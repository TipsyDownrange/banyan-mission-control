'use client';
/**
 * PlacesAutocomplete — Places API (New) via google.maps.importLibrary("places").
 * Uses AutocompleteSuggestion + Place.fetchFields. Custom dropdown, no map tiles.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlacesLib = any;

let libPromise: Promise<PlacesLib> | null = null;

function loadPlacesLib(apiKey: string): Promise<PlacesLib> {
  if (libPromise) return libPromise;

  libPromise = new Promise((resolve, reject) => {
    // Inject the bootstrap script with loading=async (required for importLibrary)
    if (!document.querySelector('script[src*="maps.googleapis.com"]')) {
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
      s.async = true;
      document.head.appendChild(s);
    }

    // Poll until google.maps.importLibrary is available
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      if (g?.maps?.importLibrary) {
        clearInterval(poll);
        try {
          const lib = await g.maps.importLibrary('places');
          console.log('[Places] Library loaded. AutocompleteSuggestion:', !!lib.AutocompleteSuggestion);
          resolve(lib);
        } catch (e) {
          reject(e);
        }
      } else if (attempts > 100) {
        clearInterval(poll);
        reject(new Error('google.maps.importLibrary not available after 10s'));
      }
    }, 100);
  });

  return libPromise;
}

export default function PlacesAutocomplete({
  value, onChange, onSelect, placeholder = 'Start typing an address…', style, disabled,
}: PlacesAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<unknown>(null);
  const libRef = useRef<PlacesLib>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ready, setReady] = useState(false);
  const [predictions, setPredictions] = useState<unknown[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!apiKey) { console.warn('[Places] No API key'); return; }
    console.log('[Places] Init, key prefix:', apiKey.slice(0, 14) + '…');
    loadPlacesLib(apiKey)
      .then(lib => {
        libRef.current = lib;
        if (lib.AutocompleteSessionToken) {
          sessionRef.current = new lib.AutocompleteSessionToken();
        }
        setReady(true);
        console.log('[Places] Ready');
      })
      .catch(e => console.error('[Places] Load failed:', e));
  }, [apiKey]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPredictions = useCallback((input: string) => {
    if (!ready || !libRef.current || input.length < 3) { setPredictions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const lib = libRef.current;
      if (!lib?.AutocompleteSuggestion) {
        console.error('[Places] AutocompleteSuggestion not in lib:', Object.keys(lib || {}));
        return;
      }
      try {
        console.log('[Places] fetchAutocompleteSuggestions ->', input);
        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ['us'],
          sessionToken: sessionRef.current,
        });
        console.log('[Places] suggestions:', suggestions?.length ?? 0);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPredictions(suggestions?.map((s: any) => s.placePrediction) ?? []);
        setOpen((suggestions?.length ?? 0) > 0);
        setActiveIdx(-1);
      } catch (e) {
        console.error('[Places] fetchAutocompleteSuggestions error:', e);
        setPredictions([]); setOpen(false);
      }
    }, 250);
  }, [ready]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function selectPrediction(pred: any) {
    setOpen(false);
    setPredictions([]);
    onChange(pred.text?.text ?? pred.mainText?.text ?? '');

    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'addressComponents', 'location'] });

      // Refresh session token
      const lib = libRef.current;
      if (lib?.AutocompleteSessionToken) sessionRef.current = new lib.AutocompleteSessionToken();

      const formatted = place.formattedAddress ?? pred.text?.text ?? '';
      let street = '', city = '', state = '', zip = '';
      for (const c of place.addressComponents ?? []) {
        if (c.types.includes('street_number'))    street = c.longText + ' ';
        else if (c.types.includes('route'))       street += c.longText;
        else if (c.types.includes('locality'))    city   = c.longText;
        else if (c.types.includes('sublocality_level_1') && !city) city = c.longText;
        else if (c.types.includes('administrative_area_level_1')) state = c.shortText;
        else if (c.types.includes('postal_code')) zip    = c.longText;
      }
      const island = detectIsland(city, formatted);
      onChange(formatted);
      onSelect({
        formatted_address: formatted,
        street: street.trim(), city, state, zip, island,
        lat: place.location?.lat() ?? 0,
        lng: place.location?.lng() ?? 0,
      });
    } catch (e) {
      console.error('[Places] fetchFields error:', e);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || predictions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, predictions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectPrediction(predictions[activeIdx] as any); }
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
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(predictions as any[]).map((p: any, i) => (
            <div
              key={p.placeId ?? i}
              onMouseDown={e => { e.preventDefault(); selectPrediction(p); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '9px 12px', cursor: 'pointer',
                background: i === activeIdx ? '#f0fdfa' : 'white',
                borderBottom: i < predictions.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.mainText?.text ?? p.text?.text}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{p.secondaryText?.text ?? ''}</div>
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
