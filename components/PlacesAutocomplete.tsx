'use client';
/**
 * PlacesAutocomplete — address input with Google Places AutocompleteService.
 * Custom dropdown UI — NO map widget, NO map tiles, NO grey circles.
 * Matches the visual pattern of AutocompleteInput in ServiceIntake.tsx.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

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

// Detect Hawaii island from city or full address text
function detectIsland(city: string, formatted: string): string {
  const t = (city + ' ' + formatted).toLowerCase();
  if (/kahului|lahaina|kihei|paia|makawao|haiku|wailuku|pukalani|kula|wailea|napili|kapalua|maalaea|hana|maui/.test(t)) return 'Maui';
  if (/honolulu|kailua|kaneohe|aiea|pearl|ewa|mililani|kapolei|waipahu|haleiwa|oahu/.test(t)) return 'Oahu';
  if (/lihue|poipu|princeville|kapaa|waimea|hanalei|koloa|kauai/.test(t)) return 'Kauai';
  if (/hilo|kona|kohala|pahoa|keaau|volcano|captain cook|big island/.test(t)) return 'Hawaii';
  if (/molokai|lanai city/.test(t)) return 'Molokai';
  return '';
}

function parseComponents(components: google.maps.GeocoderAddressComponent[]): {
  street: string; city: string; state: string; zip: string;
} {
  let streetNum = '', route = '', city = '', state = '', zip = '';
  for (const c of components) {
    if (c.types.includes('street_number'))    streetNum = c.long_name;
    else if (c.types.includes('route'))       route     = c.long_name;
    else if (c.types.includes('locality'))    city      = c.long_name;
    else if (c.types.includes('sublocality_level_1') && !city) city = c.long_name;
    else if (c.types.includes('administrative_area_level_1')) state = c.short_name;
    else if (c.types.includes('postal_code')) zip       = c.long_name;
  }
  return { street: [streetNum, route].filter(Boolean).join(' '), city, state, zip };
}

// Load Maps JS API once — module-level singleton
let loadPromise: Promise<void> | null = null;
function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const t = setInterval(() => { if (window.google?.maps?.places) { clearInterval(t); resolve(); } }, 100);
      return;
    }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true; s.defer = true;
    s.onload  = () => resolve();
    s.onerror = () => { loadPromise = null; reject(new Error('Maps failed to load')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

export default function PlacesAutocomplete({
  value, onChange, onSelect, placeholder = 'Start typing an address…', style, disabled,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const svcRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesSvcRef = useRef<google.maps.places.PlacesService | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey).then(() => {
      svcRef.current = new window.google.maps.places.AutocompleteService();
      // PlacesService needs a DOM node but won't render anything visible
      const dummy = document.createElement('div');
      placesSvcRef.current = new window.google.maps.places.PlacesService(dummy);
      sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
      setReady(true);
    }).catch(() => {/* graceful degradation — plain input */});
  }, [apiKey]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchPredictions = useCallback((input: string) => {
    if (!ready || !svcRef.current || input.length < 3) { setPredictions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      svcRef.current!.getPlacePredictions({
        input,
        sessionToken: sessionRef.current ?? undefined,
        componentRestrictions: { country: 'us' },
        location: new window.google.maps.LatLng(20.8, -156.3), // Center of Hawaii
        radius: 400000, // 400km covers all islands
        types: ['address'],
      }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results);
          setOpen(true);
          setActiveIdx(-1);
        } else {
          setPredictions([]);
          setOpen(false);
        }
      });
    }, 200);
  }, [ready]);

  function selectPrediction(prediction: google.maps.places.AutocompletePrediction) {
    setOpen(false);
    setPredictions([]);
    // Show description immediately in the input
    onChange(prediction.description);

    if (!placesSvcRef.current) return;
    placesSvcRef.current.getDetails(
      {
        placeId: prediction.place_id,
        sessionToken: sessionRef.current ?? undefined,
        fields: ['formatted_address', 'address_components', 'geometry'],
      },
      (place, status) => {
        // Refresh session token after each completed request
        sessionRef.current = new window.google.maps.places.AutocompleteSessionToken();
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place) return;
        const { street, city, state, zip } = parseComponents(place.address_components || []);
        const formatted = place.formatted_address || prediction.description;
        const island = detectIsland(city, formatted);
        onChange(formatted);
        onSelect({
          formatted_address: formatted,
          street, city, state, zip, island,
          lat: place.geometry?.location?.lat() ?? 0,
          lng: place.geometry?.location?.lng() ?? 0,
        });
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || predictions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, predictions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectPrediction(predictions[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  const INP: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1px solid #e2e8f0', background: 'white',
    fontSize: 13, color: '#0f172a', outline: 'none',
    boxSizing: 'border-box', ...style,
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); fetchPredictions(e.target.value); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={INP}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {open && predictions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', marginTop: 4, overflow: 'hidden',
        }}>
          {predictions.map((p, i) => {
            const main = p.structured_formatting.main_text;
            const secondary = p.structured_formatting.secondary_text;
            return (
              <div
                key={p.place_id}
                onMouseDown={e => { e.preventDefault(); selectPrediction(p); }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  padding: '9px 12px', cursor: 'pointer',
                  background: i === activeIdx ? '#f0fdfa' : 'white',
                  borderBottom: i < predictions.length - 1 ? '1px solid #f1f5f9' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 1,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{main}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{secondary}</span>
              </div>
            );
          })}
          {/* Required Google attribution */}
          <div style={{ padding: '5px 12px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'right' }}>
            <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" style={{ height: 14, opacity: 0.7 }} />
          </div>
        </div>
      )}
    </div>
  );
}
