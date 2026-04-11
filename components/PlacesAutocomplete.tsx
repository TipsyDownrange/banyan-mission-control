'use client';
/**
 * PlacesAutocomplete — calls our own /api/places/* proxy (server-side key).
 * No Google Maps JS API loaded in the browser. Custom dropdown, no map tiles.
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

interface Suggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
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

export default function PlacesAutocomplete({
  value, onChange, onSelect, placeholder = 'Start typing an address…', style, disabled,
}: PlacesAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchSuggestions = useCallback((input: string) => {
    if (input.length < 3) { setSuggestions([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}`);
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: Suggestion[] = (data.suggestions || []).map((s: any) => ({
          placeId: s.placePrediction?.placeId ?? '',
          mainText: s.placePrediction?.structuredFormat?.mainText?.text ?? s.placePrediction?.text?.text ?? '',
          secondaryText: s.placePrediction?.structuredFormat?.secondaryText?.text ?? '',
          fullText: s.placePrediction?.text?.text ?? '',
        })).filter((s: Suggestion) => s.placeId);
        setSuggestions(parsed);
        setOpen(parsed.length > 0);
        setActiveIdx(-1);
      } catch (e) {
        console.error('[Places] autocomplete error:', e);
        setSuggestions([]); setOpen(false);
      }
    }, 250);
  }, []);

  async function selectSuggestion(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    onChange(s.fullText || s.mainText);

    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(s.placeId)}`);
      const place = await res.json();
      if (place.error) return;

      const formatted = place.formattedAddress ?? s.fullText;
      let street = '', city = '', state = '', zip = '';

      for (const c of place.addressComponents ?? []) {
        const types: string[] = c.types ?? [];
        if (types.includes('street_number'))              street = (c.longText ?? '') + ' ';
        else if (types.includes('route'))                 street += (c.longText ?? '');
        else if (types.includes('locality'))              city   = c.longText ?? '';
        else if (types.includes('sublocality_level_1') && !city) city = c.longText ?? '';
        else if (types.includes('administrative_area_level_1')) state = c.shortText ?? '';
        else if (types.includes('postal_code'))           zip    = c.longText ?? '';
      }

      const island = detectIsland(city, formatted);
      onChange(formatted);
      onSelect({
        formatted_address: formatted,
        street: street.trim(), city, state, zip, island,
        lat: place.location?.latitude ?? 0,
        lng: place.location?.longitude ?? 0,
      });
    } catch (e) {
      console.error('[Places] details error:', e);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectSuggestion(suggestions[activeIdx]); }
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
        onChange={e => { onChange(e.target.value); fetchSuggestions(e.target.value); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={INP}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', marginTop: 4, overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.placeId}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '9px 12px', cursor: 'pointer',
                background: i === activeIdx ? '#f0fdfa' : 'white',
                borderBottom: i < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{s.mainText}</div>
              {s.secondaryText && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{s.secondaryText}</div>}
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
