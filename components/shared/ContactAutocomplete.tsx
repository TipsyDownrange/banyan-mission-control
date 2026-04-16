'use client';
import React, { useState, useEffect, useRef } from 'react';

export interface ContactResult {
  contact_id: string;
  name: string;
  phone: string;
  email: string;
  title: string;
  org_name?: string;
  is_primary: boolean;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect: (contact: ContactResult) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  orgId?: string; // if set, only show contacts for this org
}

export default function ContactAutocomplete({ value, onChange, onSelect, style, placeholder = 'Search contacts...', orgId }: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ContactResult[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    onChange(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const url = orgId
          ? `/api/contacts?org_id=${encodeURIComponent(orgId)}&q=${encodeURIComponent(q)}`
          : `/api/contacts?q=${encodeURIComponent(q)}`;
        const r = await fetch(url);
        const d = await r.json();
        setResults((d.contacts || []).slice(0, 8));
        setOpen(true);
      } catch (err) { console.error('[ContactAutocomplete] search', err); }
    }, 220);
  }

  function handleSelect(c: ContactResult) {
    setQuery(c.name);
    setOpen(false);
    setResults([]);
    onSelect(c);
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={handleChange}
        onFocus={() => query.length >= 2 && results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 240, overflowY: 'auto',
          marginTop: 2,
        }}>
          {results.map(c => (
            <div key={c.contact_id} onMouseDown={() => handleSelect(c)} style={{
              padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
              display: 'flex', flexDirection: 'column', gap: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{c.name}{c.is_primary ? ' ⭐' : ''}</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {[c.title, c.org_name, c.phone].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
