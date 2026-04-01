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
};

const CAT_CONFIG: Record<EmailCategory, { label: string; color: string; bg: string; border: string }> = {
  bid_invite:   { label: 'Bid Invite',   color: '#0f766e', bg: '#f0fdfa', border: 'rgba(15,118,110,0.18)' },
  change_order: { label: 'Change Order', color: '#c2410c', bg: '#fff7ed', border: 'rgba(194,65,12,0.18)' },
  payment:      { label: 'Payment',      color: '#1d4ed8', bg: '#eff6ff', border: 'rgba(29,78,216,0.18)' },
  vendor_quote: { label: 'Quote',        color: '#6d28d9', bg: '#faf5ff', border: 'rgba(109,40,217,0.15)' },
  internal:     { label: 'Internal',     color: '#92400e', bg: '#fffbeb', border: 'rgba(146,64,14,0.18)' },
  other:        { label: 'Other',        color: '#475569', bg: '#f8fafc', border: 'rgba(71,85,105,0.15)' },
};

const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#94a3b8',
};

const DELEGATES = ['Kyle', 'Jenny', 'Mark Olson', 'Frank', 'Joey', 'Tia'];

export default function InboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmailCategory | 'all' | 'unread'>('all');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch('/api/inbox')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else { setItems(d.items || []); setTotal(d.total || 0); }
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const filtered = filter === 'all' ? items
    : filter === 'unread' ? items.filter(i => i.unread)
    : items.filter(i => i.category === filter);

  const bidCount = items.filter(i => i.category === 'bid_invite').length;
  const coCount = items.filter(i => i.category === 'change_order').length;
  const unreadCount = items.filter(i => i.unread).length;
  const highCount = items.filter(i => i.priority === 'high').length;

  const stats = [
    { label: 'Bid invites', value: bidCount, helper: 'New RFPs needing review or assignment' },
    { label: 'Change orders', value: coCount, helper: 'GC change notifications requiring pricing' },
    { label: 'Unread', value: unreadCount, helper: 'Items not yet opened in Gmail' },
    { label: 'High priority', value: highCount, helper: 'Due soon or blocking action required' },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
          Estimating
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 6 }}>
          Bid Intake
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          Kai is reading your inbox — {items.length} actionable items from the last 14 days
          {total > items.length && `, ${total} total matches`}
        </p>
      </div>

      {/* Stats row */}
      {!loading && !error && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 20,
          padding: 18,
          borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.92) 50%, rgba(248,250,252,0.96) 100%)',
          border: '1px solid rgba(148,163,184,0.18)',
          boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
        }}>
          {stats.map(s => (
            <div key={s.label} style={{
              padding: '14px 16px', borderRadius: 18,
              background: 'rgba(255,255,255,0.78)',
              border: '1px solid rgba(226,232,240,0.95)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>
                {s.label}
              </div>
              <div style={{ marginTop: 6, fontSize: 32, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {/* Kai posture note */}
      {!loading && !error && items.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 16,
          background: 'rgba(15,23,42,0.03)', border: '1px dashed rgba(148,163,184,0.35)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(15,118,110,0.7)', flexShrink: 0, marginTop: 2 }}>Kai</span>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            Intake posture: review bid invites first, flag change orders that need pricing responses, hold items missing docs. Delegate down — don&apos;t let these sit in your inbox.
          </div>
        </div>
      )}

      {/* Filters */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['all', 'unread', 'bid_invite', 'change_order', 'payment', 'vendor_quote', 'internal'] as const).map(f => {
            const isActive = filter === f;
            const count = f === 'all' ? items.length : f === 'unread' ? unreadCount : items.filter(i => i.category === f).length;
            if (count === 0 && f !== 'all') return null;
            const cfg = f !== 'all' && f !== 'unread' ? CAT_CONFIG[f] : null;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: `1px solid ${isActive ? (cfg?.border || 'rgba(15,118,110,0.3)') : 'rgba(226,232,240,0.9)'}`,
                background: isActive ? (cfg?.bg || '#f0fdfa') : 'white',
                color: isActive ? (cfg?.color || '#0f766e') : '#64748b',
                cursor: 'pointer', transition: 'all 0.12s ease',
                textTransform: 'capitalize',
              }}>
                {f === 'bid_invite' ? 'Bid Invites' : f === 'change_order' ? 'Change Orders' : f === 'vendor_quote' ? 'Quotes' : f.charAt(0).toUpperCase() + f.slice(1)} · {count}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ background: 'white', borderRadius: 20, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Kai is reading your inbox...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>Connection error</div>
          <div style={{ fontSize: 12, color: '#475569' }}>{error}</div>
        </div>
      )}

      {/* Items */}
      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => {
            const cfg = CAT_CONFIG[item.category];
            const isExpanded = expanded === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setExpanded(isExpanded ? null : item.id)}
                style={{
                  background: 'white',
                  borderRadius: 20,
                  border: `1px solid ${item.unread ? cfg.border : 'rgba(226,232,240,0.9)'}`,
                  boxShadow: isExpanded
                    ? '0 8px 32px rgba(15,23,42,0.10)'
                    : '0 1px 4px rgba(15,23,42,0.05)',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s ease',
                  overflow: 'hidden',
                }}
              >
                {/* Card body */}
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Priority bar */}
                    <div style={{ width: 3, borderRadius: 4, background: PRIORITY_COLOR[item.priority], alignSelf: 'stretch', flexShrink: 0, minHeight: 48 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Top row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: cfg.color, background: cfg.bg, padding: '3px 9px', borderRadius: 999, border: `1px solid ${cfg.border}` }}>
                          {cfg.label}
                        </span>
                        {item.unread && (
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ef4444', background: '#fef2f2', padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(239,68,68,0.15)' }}>
                            New
                          </span>
                        )}
                        {item.dueDate && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fffbeb', padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(146,64,14,0.15)' }}>
                            Due: {item.dueDate}
                          </span>
                        )}
                      </div>

                      {/* Project name */}
                      <div style={{ fontSize: 15, fontWeight: item.unread ? 800 : 700, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.3, marginBottom: 4 }}>
                        {item.project}
                      </div>

                      {/* From + date */}
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                        {item.from} · {item.date}
                      </div>

                      {/* Kai note */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', borderRadius: 12, background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(148,163,184,0.12)' }}>
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(15,118,110,0.7)', flexShrink: 0, marginTop: 1 }}>KAI</span>
                        <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{item.kaiNote}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, marginTop: 2 }}>
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 20px', background: '#fafbfc' }}>
                    {/* Snippet */}
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginBottom: 16, padding: '10px 14px', background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      {item.snippet}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Delegate to</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {DELEGATES.map(d => (
                            <button key={d} onClick={e => { e.stopPropagation(); alert(`Delegate to ${d} — routing coming soon`); }} style={{
                              padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                              background: 'white', border: '1px solid #e2e8f0', color: '#334155', cursor: 'pointer',
                              transition: 'all 0.1s ease',
                            }}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${item.id}`}
                        target="_blank" rel="noopener"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', textDecoration: 'none', padding: '6px 14px', borderRadius: 10, background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)' }}>
                        Open in Gmail ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div style={{ background: 'white', borderRadius: 20, padding: 40, textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No items in this category</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
