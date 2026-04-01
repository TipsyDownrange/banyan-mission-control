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

const CAT_CONFIG: Record<EmailCategory, { label: string; color: string; bg: string }> = {
  bid_invite:   { label: 'Bid Invite',    color: '#0f766e', bg: 'rgba(15,118,110,0.1)' },
  change_order: { label: 'Change Order',  color: '#c2410c', bg: 'rgba(194,65,12,0.1)' },
  payment:      { label: 'Payment',       color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)' },
  vendor_quote: { label: 'Vendor Quote',  color: '#6d28d9', bg: 'rgba(109,40,217,0.1)' },
  internal:     { label: 'Internal',      color: '#b45309', bg: 'rgba(180,83,9,0.1)' },
  other:        { label: 'Other',         color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

const PRIORITY_DOT: Record<Priority, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#94a3b8',
};

const DELEGATES = ['Kyle', 'Jenny', 'Mark Olson', 'Frank', 'Tia', 'Sean'];

export default function InboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<EmailCategory | 'all'>('all');
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

  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter);
  const unreadCount = items.filter(i => i.unread).length;
  const bidCount = items.filter(i => i.category === 'bid_invite').length;
  const coCount = items.filter(i => i.category === 'change_order').length;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="label-upper text-ink-meta mb-1">Estimating</div>
        <div className="flex items-end justify-between">
          <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Bid Intake</h1>
          <div className="flex gap-3 pb-1">
            {unreadCount > 0 && <span className="pill" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{unreadCount} unread</span>}
            {bidCount > 0 && <span className="pill" style={{ background: 'rgba(15,118,110,0.1)', color: '#0f766e' }}>{bidCount} bid invites</span>}
            {coCount > 0 && <span className="pill" style={{ background: 'rgba(194,65,12,0.1)', color: '#c2410c' }}>{coCount} change orders</span>}
          </div>
        </div>
        <p className="text-ink-label text-sm mt-1">
          Kai is reading your inbox — showing {items.length} actionable items from the last 14 days
          {total > items.length && ` (${total} matched total)`}
        </p>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        <button onClick={() => setFilter('all')}
          className="pill border transition-colors"
          style={{ background: filter === 'all' ? 'rgba(15,118,110,0.1)' : 'white', borderColor: filter === 'all' ? 'rgba(15,118,110,0.3)' : '#e2e8f0', color: filter === 'all' ? '#0f766e' : '#64748b' }}>
          All · {items.length}
        </button>
        {(Object.keys(CAT_CONFIG) as EmailCategory[]).map(cat => {
          const count = items.filter(i => i.category === cat).length;
          if (count === 0) return null;
          const cfg = CAT_CONFIG[cat];
          return (
            <button key={cat} onClick={() => setFilter(cat)}
              className="pill border transition-colors"
              style={{ background: filter === cat ? cfg.bg : 'white', borderColor: filter === cat ? cfg.color + '44' : '#e2e8f0', color: filter === cat ? cfg.color : '#64748b' }}>
              {cfg.label} · {count}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading && (
        <div className="card p-10 flex flex-col items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(15,118,110,0.15)', borderTopColor: '#14b8a6' }} />
          <div className="text-sm text-ink-meta">Kai is reading your inbox...</div>
        </div>
      )}

      {error && (
        <div className="card p-5" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div className="text-sm font-bold text-red-700 mb-1">Connection error</div>
          <div className="text-xs text-ink-body">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-col gap-3">
          {filtered.map(item => {
            const cfg = CAT_CONFIG[item.category];
            const isExpanded = expanded === item.id;
            return (
              <div
                key={item.id}
                className="card cursor-pointer transition-all"
                style={{ borderLeft: `3px solid ${item.unread ? cfg.color : '#e2e8f0'}` }}
                onClick={() => setExpanded(isExpanded ? null : item.id)}
              >
                {/* Condensed view */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Priority dot */}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[item.priority], marginTop: 6, flexShrink: 0 }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="pill" style={{ background: cfg.bg, color: cfg.color, fontSize: 10 }}>{cfg.label}</span>
                        {item.unread && <span className="pill" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 10 }}>New</span>}
                        {item.dueDate && <span className="pill" style={{ background: 'rgba(245,158,11,0.08)', color: '#b45309', fontSize: 10 }}>Due: {item.dueDate}</span>}
                      </div>
                      <div className={`text-[14px] text-ink-heading leading-snug mb-1 ${item.unread ? 'font-bold' : 'font-semibold'}`}>
                        {item.project}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-ink-label">{item.from}</span>
                        <span className="text-ink-meta">·</span>
                        <span className="text-[12px] text-ink-meta">{item.date}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-[11px] text-ink-meta">{isExpanded ? '▲' : '▼'}</div>
                  </div>

                  {/* Kai note — always visible */}
                  <div className="mt-2 ml-5 flex items-start gap-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'rgba(94,234,212,0.6)', marginTop: 1, flexShrink: 0 }}>Kai</span>
                    <span className="text-[12px] text-ink-body">{item.kaiNote}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-surface-border pt-4" style={{ marginTop: 0 }}>
                    <div className="text-[12px] text-ink-body mb-4 leading-relaxed" style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
                      {item.snippet}
                    </div>
                    <div className="label-upper text-ink-meta mb-2">Delegate to</div>
                    <div className="flex gap-2 flex-wrap">
                      {DELEGATES.map(d => (
                        <button key={d}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-colors"
                          style={{ background: 'white', borderColor: '#e2e8f0', color: '#475569' }}
                          onClick={e => { e.stopPropagation(); alert(`Delegated to ${d} — email routing coming soon`); }}>
                          {d}
                        </button>
                      ))}
                      <a href={`https://mail.google.com/mail/u/0/#inbox/${item.id}`} target="_blank" rel="noopener"
                        onClick={e => e.stopPropagation()}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-colors"
                        style={{ background: 'white', borderColor: '#e2e8f0', color: '#94a3b8', textDecoration: 'none' }}>
                        Open in Gmail ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="card p-8 text-center">
              <div className="text-ink-meta text-sm">No items in this category</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
