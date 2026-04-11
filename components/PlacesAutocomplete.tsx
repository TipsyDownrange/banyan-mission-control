'use client';
/**
 * PlacesAutocomplete — Google Places API (New) with AutocompleteSuggestion.
 * Custom dropdown, no map tiles, no widget.
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

function detectIsland(city: string, formatted: string): string {
  const t = (city + ' ' + formatted).toLowerCase();
  if (/kahului|lahaina|kihei|paia|makawao|haiku|wailuku|pukalani|kula|wailea|napili|kapalua|maalaea|hana|maui/.test(t)) return 'Maui';
  if (/honolulu|kailua|kaneohe|aiea|pearl|ewa|mililani|kapolei|waipahu|haleiwa|oahu/.test(t)) return 'Oahu';
  if (/lihue|poipu|princeville|kapaa|waimea|hanalei|koloa|kauai/.test(t)) return 'Kauai';
  if (/hilo|kona|kohala|pahoa|keaau|volcano|captain cook|big island/.test(t)) return 'Hawaii';
  if (/molokai|lanai city/.test(t)) return 'Molokai';
  return '';
}

// Load Maps JS API once — module-level singleton
let loadPromise: Promise<void> | null = null;
function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as unknown as Record<string, unknown>).google) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const t = setInterval(() => {
        if ((window as unknown as Record<string, unknown>).google) { clearInterval(t); resolve(); }
      }, 100);
      return;
    }
    const s = document.createElement('script');
    // Use beta channel for the new Places API (AutocompleteSuggestion)
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=beta`;
    s.async = true; s.defer = true;
    s.onload  = () => { console.log('[Places] Maps JS API (beta) loaded'); resolve(); };
    s.onerror = () => { loadPromise = null; reject(new Error('Maps failed to load')); };
    document.head.appendChild(s);
  });
  return loadPromise;
}

// Type shims for the new Places API (not yet in @types/google.maps)
interface PlacePrediction {
  placeId: string;
  text: { text: string };
  mainText: { text: string };
  secondaryText: { text: string };
  toPlace(): NewPlace;
}

interface NewPlace {
  fetchFields(opts: { fields: string[] }): Promise<void>;
  formattedAddress?: string;
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  location?: { lat(): number; lng(): number };
}

interface AutocompleteSuggestionStatic {
  fetchAutocompleteSuggestions(req: {
    input: string;
    includedRegionCodes?: string[];
    includedPrimaryTypes?: string[];
    locationBias?: { center: { lat: number; lng: number }; radius: number };
    sessionToken?: unknown;
  }): Promise<{ suggestions: Array<{ placePrediction: PlacePrediction }> }>;
}

interface AutocompleteSessionTokenStatic {
  new(): unknown;
}

function getPlacesNew() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const places = (window as any).google?.maps?.places;
  return {
    AutocompleteSuggestion: places?.AutocompleteSuggestion as AutocompleteSuggestionStatic | undefined,
    AutocompleteSessionToken: places?.AutocompleteSessionToken as AutocompleteSessionTokenStatic | undefined,
  };
}

export default function PlacesAutocomplete({
  value, onChange, onSelect, placeholder = 'Start typing an address…', style, disabled,
}: PlacesAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<unknown>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!apiKey) {
      console.warn('[Places] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set');
      return;
    }
    console.log('[Places] Loading, key prefix:', apiKey.slice(0, 14) + '…');
    loadGoogleMaps(apiKey).then(() => {
      const { AutocompleteSessionToken } = getPlacesNew();
      if (AutocompleteSessionToken) {
        sessionRef.current = new AutocompleteSessionToken();
        console.log('[Places] New Places API ready');
        setReady(true);
      } else {
        console.error('[Places] AutocompleteSessionToken not found — check API version');
      }
    }).catch(e => console.error('[Places] Load error:', e));
  }, [apiKey]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPredictions = useCallback((input: string) => {
    if (!ready || input.length < 3) { setPredictions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { AutocompleteSuggestion } = getPlacesNew();
      if (!AutocompleteSuggestion) return;
      try {
        console.log('[Places] fetchAutocompleteSuggestions ->', input);
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ['us'],
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
          locationBias: {
            center: { lat: 20.8, lng: -156.3 },
            radius: 400000,
          },
          sessionToken: sessionRef.current,
        });
        console.log('[Places] suggestions:', suggestions.length);
        setPredictions(suggestions.map(s => s.placePrediction));
        setOpen(suggestions.length > 0);
        setActiveIdx(-1);
      } catch (e) {
        console.error('[Places] fetchAutocompleteSuggestions error:', e);
        setPredictions([]); setOpen(false);
      }
    }, 200);
  }, [ready]);

  async function selectPrediction(pred: PlacePrediction) {
    setOpen(false);
    setPredictions([]);
    onChange(pred.text.text);

    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });

      // Refresh session token
      const { AutocompleteSessionToken } = getPlacesNew();
      if (AutocompleteSessionToken) sessionRef.current = new AutocompleteSessionToken();

      const formatted = place.formattedAddress || pred.text.text;
      let street = '', city = '', state = '', zip = '';
      for (const c of place.addressComponents || []) {
        if (c.types.includes('street_number'))    street = c.longText + ' ';
        else if (c.types.includes('route'))       street += c.longText;
        else if (c.types.includes('locality'))    city   = c.longText;
        else if (c.types.includes('sublocality_level_1') && !city) city = c.longText;
        else if (c.types.includes('administrative_area_level_1')) state = c.shortText;
        else if (c.types.includes('postal_code')) zip    = c.longText;
      }
      street = street.trim();
      const island = detectIsland(city, formatted);
      onChange(formatted);
      onSelect({ formatted_address: formatted, street, city, state, zip, island,
        lat: place.location?.lat() ?? 0, lng: place.location?.lng() ?? 0 });
    } catch (e) {
      console.error('[Places] fetchFields error:', e);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || predictions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, predictions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectPrediction(predictions[activeIdx]); }
    else if (e.key === 'Escape') setOpen(false);
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
          {predictions.map((p, i) => (
            <div
              key={p.placeId}
              onMouseDown={e => { e.preventDefault(); selectPrediction(p); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '9px 12px', cursor: 'pointer',
                background: i === activeIdx ? '#f0fdfa' : 'white',
                borderBottom: i < predictions.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.mainText.text}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{p.secondaryText.text}</div>
            </div>
          ))}
          <div style={{ padding: '5px 12px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', textAlign: 'right' }}>
            <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" style={{ height: 14, opacity: 0.7 }} />
          </div>
        </div>
      )}
    </div>
  );
}
