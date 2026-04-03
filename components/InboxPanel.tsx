'use client';
import { useEffect, useState } from 'react';

type EmailCategory = 'bid_invite' | 'change_order' | 'payment' | 'vendor_quote' | 'internal' | 'other';
type Priority = 'high' | 'medium' | 'low';

type InboxItem = {
  id: string;
  subject: string;
  from: string;
  fromEmail: string;
  date: string;
  snippet: string;
  unread: boolean;
  category: EmailCategory;
  priority: Priority;
  kaiNote: string;
  dueDate: string | null;
  project: string;
  bidStatus: string | null;
  bidMatch: { name: string; assignedTo: string; status: string } | null;
  island: string | null;
};

const CAT: Record<EmailCategory, { label: string; color: string; bg: string; border: string; accent: string }> = {
  bid_invite:   { label: 'Bid Invite',   color: '#0f766e', bg: 'rgba(240,253,250,0.96)', border: '1px solid rgba(13,148,136,0.22)', accent: '#0d9488' },
  change_order: { label: 'Change Order', color: '#c2410c', bg: 'rgba(255,247,237,0.98)', border: '1px solid rgba(249,115,22,0.22)', accent: '#f97316' },
  payment:      { label: 'Payment',      color: '#1d4ed8', bg: 'rgba(239,246,255,0.98)', border: '1px solid rgba(59,130,246,0.2)',  accent: '#3b82f6' },
  vendor_quote: { label: 'Quote',        color: '#6d28d9', bg: 'rgba(245,243,255,0.98)', border: '1px solid rgba(139,92,246,0.2)', accent: '#8b5cf6' },
  internal:     { label: 'Internal',     color: '#92400e', bg: 'rgba(255,251,235,0.98)', border: '1px solid rgba(245,158,11,0.2)', accent: '#f59e0b' },
  other:        { label: 'Other',        color: '#475569', bg: 'rgba(248,250,252,0.96)', border: '1px solid rgba(148,163,184,0.22)', accent: '#94a3b8' },
};

const PILL = (color: string, bg: string, border?: string): React.CSSProperties => ({
  padding: '6px 10px', borderRadius: '999px', fontSize: '11px',
  fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
  color, background: bg, border: border || `1px solid ${color}33`,
  display: 'inline-block',
});

const DELEGATES = ['Kyle', 'Jenny', 'Mark Olson', 'Frank', 'Joey', 'Tia'];

export default function InboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmailCategory | 'all' | 'unread'>('all');
  const [total, setTotal] = useState(0);
  const [delegating, setDelegating] = useState<string | null>(null); // itemId being delegated

  useEffect(() => {
    fetch('/api/inbox')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setItems(d.items || []); setTotal(d.total || 0); } setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const filtered = filter === 'all' ? items : filter === 'unread' ? items.filter(i => i.unread) : items.filter(i => i.category === filter);
  const unreadCount = items.filter(i => i.unread).length;
  const bidCount = items.filter(i => i.category === 'bid_invite').length;
  const coCount = items.filter(i => i.category === 'change_order').length;
  const highCount = items.filter(i => i.priority === 'high').length;

  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Assistant</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Inbox</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', paddingBottom: 4 }}>Live · Gmail</div>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20,
          padding: 18, borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.92) 45%, rgba(248,250,252,0.96) 100%)',
          border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 18px 36px rgba(15,23,42,0.08)',
        }}>
          {[
            { label: 'Bid invites', value: bidCount, helper: 'New RFPs to review' },
            { label: 'Change orders', value: coCount, helper: 'Pricing response needed' },
            { label: 'Unread', value: unreadCount, helper: 'Not yet opened' },
            { label: 'High priority', value: highCount, helper: 'Needs action soon' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a' }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {/* Kai posture */}
      {!loading && !error && items.length > 0 && (
        <div style={{ marginBottom: 20, padding: '12px 16px 12px 14px', borderRadius: 18, background: 'rgba(255,255,255,0.8)', border: '1px dashed rgba(148,163,184,0.42)', display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', flexShrink: 0, marginTop: 2 }}>KAI</span>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            Intake first, merge never by accident. Review bid invites, action change orders that need pricing, hold items missing docs. Delegate — don&apos;t let these age in inbox.
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['all','unread','bid_invite','change_order','payment','vendor_quote','internal'] as const).map(f => {
            const isActive = filter === f;
            const count = f === 'all' ? items.length : f === 'unread' ? unreadCount : items.filter(i => i.category === f).length;
            if (count === 0 && f !== 'all') return null;
            const cfg = f !== 'all' && f !== 'unread' ? CAT[f] : null;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                border: isActive ? (cfg?.border || '1px solid rgba(13,148,136,0.3)') : '1px solid rgba(226,232,240,0.9)',
                background: isActive ? (cfg?.bg || 'rgba(240,253,250,0.96)') : 'white',
                color: isActive ? (cfg?.color || '#0f766e') : '#64748b',
                cursor: 'pointer',
              }}>
                {f === 'bid_invite' ? 'Bid Invites' : f === 'change_order' ? 'Change Orders' : f === 'vendor_quote' ? 'Quotes' : f.charAt(0).toUpperCase() + f.slice(1)} · {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ background: 'white', borderRadius: 24, padding: 48, textAlign: 'center', border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(13,148,136,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Kai is reading your inbox...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(254,242,242,0.98)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 18, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>Connection error</div>
          <div style={{ fontSize: 12, color: '#475569' }}>{error}</div>
        </div>
      )}

      {/* Items — Hunter's card architecture */}
      {!loading && !error && (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(item => {
            const cfg = CAT[item.category];
            const isExpanded = expanded === item.id;
            return (
              <div key={item.id} onClick={() => setExpanded(isExpanded ? null : item.id)}
                style={{
                  display: 'grid', gap: 16, padding: 18, borderRadius: 24,
                  background: item.unread ? cfg.bg : 'rgba(255,255,255,0.98)',
                  border: item.unread ? cfg.border : '1px solid rgba(226,232,240,0.9)',
                  boxShadow: '0 14px 30px rgba(15,23,42,0.06)',
                  position: 'relative', overflow: 'hidden', cursor: 'pointer',
                }}>
                {/* Left accent bar — Hunter's signature */}
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 6, background: cfg.accent, opacity: item.unread ? 1 : 0.35 }} />

                {/* Top row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 10px', alignItems: 'flex-start', paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: 1 }}>
                    {/* Pills row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={PILL(cfg.color, 'rgba(255,255,255,0.72)', `1px solid ${cfg.accent}33`)}>{cfg.label}</span>
                      {item.unread && <span style={PILL('#ef4444', 'rgba(254,242,242,0.9)', '1px solid rgba(239,68,68,0.2)')}>New</span>}
                      {item.island && item.category === 'bid_invite' && (
                        <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#0369a1', background: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.2)' }}>
                          {item.island}
                        </span>
                      )}
                      {item.dueDate && <span style={PILL('#92400e', 'rgba(255,251,235,0.9)', '1px solid rgba(245,158,11,0.2)')}>Due {item.dueDate}</span>}
                      {item.bidMatch && <span style={PILL('#0f766e', 'rgba(240,253,250,0.9)', '1px solid rgba(13,148,136,0.2)')}>✓ In bid log</span>}
                      {!item.bidMatch && item.category === 'bid_invite' && <span style={PILL('#92400e', 'rgba(255,251,235,0.9)', '1px solid rgba(245,158,11,0.2)')}>Not logged</span>}
                    </div>

                    {/* Project name */}
                    <div style={{ fontSize: 15, fontWeight: item.unread ? 800 : 700, color: '#0f172a', letterSpacing: '-0.015em', lineHeight: 1.3 }}>
                      {item.project}
                    </div>

                    {/* From + date */}
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {item.from} <span style={{ color: '#94a3b8' }}>·</span> {item.date}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</div>
                </div>

                {/* Kai analysis block */}
                <div style={{ paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gap: '6px', padding: '10px 14px', borderRadius: 18, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(226,232,240,0.94)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', flexShrink: 0, marginTop: 1 }}>KAI</span>
                      <span style={{ fontSize: 13, color: '#334155', lineHeight: 1.55 }}>{item.kaiNote}</span>
                    </div>
                    {item.bidMatch && (
                      <div style={{ fontSize: 12, color: '#0f766e', borderTop: '1px solid rgba(226,232,240,0.7)', paddingTop: 6, marginTop: 2 }}>
                        Matched: <strong>{item.bidMatch.name}</strong> · {item.bidMatch.assignedTo} · {item.bidMatch.status}
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div style={{ paddingLeft: 4, borderTop: '1px solid rgba(226,232,240,0.7)', paddingTop: 16 }}>
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 16, padding: '10px 14px', background: 'rgba(248,250,252,0.9)', borderRadius: 14, border: '1px solid rgba(226,232,240,0.9)' }}>
                      {item.snippet}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Delegate to</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {DELEGATES.map(d => (
                            <button key={d} disabled={delegating === item.id} onClick={async e => {
                              e.stopPropagation();
                              setDelegating(item.id);
                              // Find email for delegate
                              const EMAILS: Record<string,string> = {
                                Kyle: 'kyle@kulaglass.com', Jenny: 'jenny@kulaglass.com',
                                'Mark Olson': 'markolson@kulaglass.com', Frank: 'frank@kulaglass.com',
                                Joey: 'joey@kulaglass.com', Tia: 'tia@kulaglass.com',
                              };
                              const toEmail = EMAILS[d] || '';
                              try {
                                const res = await fetch('/api/inbox/delegate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ messageId: item.id, delegateTo: d, delegateEmail: toEmail, subject: item.subject, snippet: item.snippet }),
                                });
                                const data = await res.json();
                                if (data.ok) {
                                  // Mark as delegated in the list
                                  setItems(prev => prev.map(i => i.id === item.id ? { ...i, delegatedTo: d } : i));
                                  setExpanded(null);
                                } else {
                                  alert('Failed to delegate: ' + (data.error || 'Unknown error'));
                                }
                              } catch(err) { alert('Error: ' + err); }
                              setDelegating(null);
                            }}
                              style={{ padding: '6px 14px', borderRadius: 12, fontSize: 12, fontWeight: 700, background: delegating === item.id ? '#e2e8f0' : 'white', border: '1px solid rgba(226,232,240,0.9)', color: delegating === item.id ? '#94a3b8' : '#334155', cursor: delegating === item.id ? 'default' : 'pointer' }}>
                              {delegating === item.id ? '...' : d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <a href={`https://mail.google.com/mail/u/0/#inbox/${item.id}`} target="_blank" rel="noopener"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', textDecoration: 'none', padding: '6px 16px', borderRadius: 12, background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(13,148,136,0.2)' }}>
                        Open in Gmail ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div style={{ background: 'white', borderRadius: 24, border: '1px solid rgba(226,232,240,0.9)', padding: 48, textAlign: 'center', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No items in this category</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
