'use client';
/**
 * PlacesAutocomplete — drop-in address input with Google Places autocomplete.
 * Biased to Hawaii. Parses place components into structured ParsedPlace.
 * On selection, calls onSelect with structured data AND keeps controlled value in sync.
 */
import { useEffect, useRef, useState } from 'react';

export interface ParsedPlace {
  formatted_address: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  island: string;
  lat: number;
  lng: number;
}

export interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: ParsedPlace) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

// Detect island from city or address text
function detectIsland(city: string, formatted: string): string {
  const text = (city + ' ' + formatted).toLowerCase();
  if (/kahului|lahaina|kihei|paia|makawao|haiku|wailuku|pukalani|kula|upcountry|wailea|napili|kapalua|maalaea|hana|lanai/.test(text)) return 'Maui';
  if (/honolulu|kailua|kaneohe|aiea|pearl|ewa|mililani|kapolei|waipahu|haleiwa|north shore|oahu/.test(text)) return 'Oahu';
  if (/lihue|poipu|princeville|kapaa|waimea|hanalei|koloa|kauai/.test(text)) return 'Kauai';
  if (/hilo|kona|waimea|kohala|pahoa|keaau|captain cook|big island|hawaii island/.test(text)) return 'Hawaii';
  if (/molokai|lanai city/.test(text)) return 'Molokai';
  return '';
}

// Load Google Maps JS API once
let loadPromise: Promise<void> | null = null;
function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Script might already be injected
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const check = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(check); resolve(); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { loadPromise = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(script);
  });
  return loadPromise;
}

// Parse address_components array into structured parts
function parseComponents(components: google.maps.GeocoderAddressComponent[]): {
  street: string; city: string; state: string; zip: string;
} {
  let streetNumber = '', route = '', city = '', state = '', zip = '';
  for (const c of components) {
    const t = c.types;
    if (t.includes('street_number')) streetNumber = c.long_name;
    else if (t.includes('route')) route = c.long_name;
    else if (t.includes('locality')) city = c.long_name;
    else if (t.includes('sublocality_level_1') && !city) city = c.long_name;
    else if (t.includes('administrative_area_level_1')) state = c.short_name;
    else if (t.includes('postal_code')) zip = c.long_name;
  }
  return {
    street: [streetNumber, route].filter(Boolean).join(' '),
    city,
    state,
    zip,
  };
}

export default function PlacesAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address…',
  style,
  disabled,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then(() => setReady(true))
      .catch(() => setLoadError(true));
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      bounds: new window.google.maps.LatLngBounds(
        { lat: 18.5, lng: -161 },  // SW corner of Hawaii
        { lat: 22.5, lng: -154 },  // NE corner of Hawaii
      ),
      strictBounds: false, // allow outside if no Hawaii result
      fields: ['formatted_address', 'address_components', 'geometry', 'name'],
      types: ['address'],
    });

    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.formatted_address) return;

      const { street, city, state, zip } = parseComponents(place.address_components || []);
      const island = detectIsland(city, place.formatted_address);
      const lat = place.geometry?.location?.lat() ?? 0;
      const lng = place.geometry?.location?.lng() ?? 0;

      // Keep controlled input in sync
      onChange(place.formatted_address);

      onSelect({
        formatted_address: place.formatted_address,
        street,
        city,
        state,
        zip,
        island,
        lat,
        lng,
      });
    });

    autocompleteRef.current = ac;
  }, [ready, onChange, onSelect]);

  const baseStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid #e2e8f0',
    background: 'white',
    fontSize: 13,
    color: '#0f172a',
    outline: 'none',
    boxSizing: 'border-box',
    ...style,
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={baseStyle}
        autoComplete="off"
      />
      {/* Google attribution (required by ToS when not using map embed) */}
      {ready && !loadError && (
        <div style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 9, color: '#94a3b8', pointerEvents: 'none', letterSpacing: 0,
        }}>
          📍
        </div>
      )}
      {loadError && (
        <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 3 }}>
          Address autocomplete unavailable — type freeform
        </div>
      )}
    </div>
  );
}
