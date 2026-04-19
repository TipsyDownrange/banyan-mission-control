'use client';
import { useEffect, useState } from 'react';

type Event = {
  id: string; kID: string; projectName: string; type: string; rawType: string;
  occurredAt: string; recordedAt: string; performedBy: string; recordedBy: string;
  note: string; location: string; unit: string;
};

const TYPE_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DAILY_LOG:         { label: 'Daily Log',    color: '#0369a1', bg: 'rgba(239,246,255,0.9)',  border: 'rgba(59,130,246,0.2)' },
  FIELD_ISSUE:       { label: 'Field Issue',  color: '#b91c1c', bg: 'rgba(254,242,242,0.9)',  border: 'rgba(239,68,68,0.2)' },
  INSTALL_STEP:      { label: 'Install',      color: '#0f766e', bg: 'rgba(240,253,250,0.9)',  border: 'rgba(13,148,136,0.2)' },
  QA_CHECK:          { label: 'QA Check',     color: '#6d28d9', bg: 'rgba(245,243,255,0.9)',  border: 'rgba(139,92,246,0.2)' },
  PHOTO_ONLY:        { label: 'Photo',        color: '#92400e', bg: 'rgba(255,251,235,0.9)',  border: 'rgba(245,158,11,0.2)' },
  NOTE:              { label: 'Note',         color: '#475569', bg: 'rgba(248,250,252,0.9)',  border: 'rgba(148,163,184,0.2)' },
  FIELD_MEASUREMENT: { label: 'Measurement',  color: '#0891b2', bg: 'rgba(236,254,255,0.9)',  border: 'rgba(8,145,178,0.2)' },
  PUNCH_LIST:        { label: 'Punch List',   color: '#d97706', bg: 'rgba(255,251,235,0.9)',  border: 'rgba(217,119,6,0.2)' },
  TM_CAPTURE:        { label: 'T&M',          color: '#92400e', bg: 'rgba(255,247,237,0.9)',  border: 'rgba(146,64,14,0.2)' },
  SITE_VISIT:        { label: 'Site Visit',   color: '#0369a1', bg: 'rgba(240,249,255,0.9)',  border: 'rgba(3,105,161,0.2)' },
  TESTING:           { label: 'Test',         color: '#7c3aed', bg: 'rgba(245,243,255,0.9)',  border: 'rgba(124,58,237,0.2)' },
  WARRANTY_CALLBACK: { label: 'Warranty',     color: '#0f766e', bg: 'rgba(240,253,250,0.9)',  border: 'rgba(15,118,110,0.2)' },
};

function formatTime(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return raw; }
}

function displayName(email: string): string {
  if (!email) return '';
  if (email.includes('@')) return email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return email;
}

export default function EventFeedPanel() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetch('/api/events?limit=100')
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const filtered = filter === 'ALL' ? events : events.filter(e => e.type === filter);

  const counts = Object.keys(TYPE_STYLE).reduce((acc, t) => {
    acc[t] = events.filter(e => e.type === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Event Feed</h1>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => setFilter('ALL')}
          style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: filter === 'ALL' ? '1px solid rgba(15,23,42,0.2)' : '1px solid #e2e8f0', background: filter === 'ALL' ? '#0f172a' : 'white', color: filter === 'ALL' ? 'white' : '#64748b' }}>
          All · {events.length}
        </button>
        {Object.entries(TYPE_STYLE).map(([key, s]) => counts[key] > 0 && (
          <button key={key} onClick={() => setFilter(key)}
            style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', border: filter === key ? `1px solid ${s.border}` : '1px solid #e2e8f0', background: filter === key ? s.bg : 'white', color: filter === key ? s.color : '#64748b' }}>
            {s.label} · {counts[key]}
          </button>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading field events...</div>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 16 }}>{error}</div>}

      {!loading && filtered.length === 0 && !error && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No events yet. Field crew activity will appear here as jobs are logged.</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(e => {
          const s = TYPE_STYLE[e.type] || TYPE_STYLE.NOTE;
          const who = displayName(e.performedBy || e.recordedBy);
          return (
            <div key={e.id} style={{ background: s.bg, borderRadius: 16, border: `1px solid ${s.border}`, padding: '12px 16px', display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, color: s.color, background: 'rgba(255,255,255,0.7)', border: `1px solid ${s.border}` }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{e.projectName}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{formatTime(e.occurredAt || e.recordedAt)}</span>
              </div>
              {(e.note || e.location) && (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{e.note || e.location}</div>
              )}
              {who && (
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{who}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
