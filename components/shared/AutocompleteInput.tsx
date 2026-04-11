'use client';
/**
 * Shared AutocompleteInput — extracted from ServiceIntake.tsx.
 * Used by: ServiceIntake, WODetailPanel.
 * Matches customer records from the Customers DB by a given field.
 */
import { useState, useEffect, useRef } from 'react';
import type { CustomerRecord } from '@/app/api/service/customers/route';

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(20,184,166,0.18)', color: '#0f766e', padding: 0, borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function AutocompleteInput({
  value, onChange, onSelect, placeholder, style, customers, matchField, subField,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (c: CustomerRecord) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  customers: CustomerRecord[];
  matchField: keyof CustomerRecord;
  subField?: keyof CustomerRecord;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const fieldVal = (c: CustomerRecord) => String(c[matchField] || '');
  const filtered = value.length >= 2
    ? customers
        .filter(c => fieldVal(c).toLowerCase().includes(value.toLowerCase()) && fieldVal(c) !== '')
        .slice(0, 8)
    : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.length >= 2) setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', overflow: 'hidden', marginTop: 4,
        }}>
          {filtered.map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(c); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', minHeight: 44, border: 'none', background: 'white',
                cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {highlightMatch(fieldVal(c), value)}
                </span>
                {c.island && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, color: '#0f766e', background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.15)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {c.island}
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                  {c.woCount} past WO{c.woCount !== 1 ? 's' : ''}
                </span>
              </div>
              {subField && c[subField] && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(c[subField])}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
