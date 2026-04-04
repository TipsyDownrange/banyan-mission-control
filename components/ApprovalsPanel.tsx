'use client';
import { useState, useEffect, useCallback } from 'react';

type ApprovalItem = {
  id: string;
  ts: string;
  action: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'denied';
  source: string;
  notes?: string;
};

const RISK_STYLE: Record<string, string> = {
  low: 'bg-teal-50 text-teal-700',
  medium: 'bg-amber-50 text-amber-600',
  high: 'bg-red-50 text-red-700',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-50 text-orange-600',
  approved: 'bg-teal-50 text-teal-700',
  denied: 'bg-red-50 text-red-700',
};

export default function ApprovalsPanel() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      if (data.error) setError(data.error);
      else setItems(data.approvals || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  async function act(id: string, status: 'approved' | 'denied') {
    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, status, notes: comments[id] || i.notes } : i));
    try {
      await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_id: id, status, notes: comments[id] || undefined }),
      });
    } catch {
      // Revert on failure
      fetchApprovals();
    }
  }

  const pending = items.filter(i => i.status === 'pending');
  const resolved = items.filter(i => i.status !== 'pending');

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">AI Command</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Approvals</h1>
        <p className="text-ink-label text-sm mt-1">Kai routes sensitive actions here before executing</p>
      </div>

      {loading && (
        <div className="card p-8 flex flex-col items-center text-center mb-8">
          <div className="w-7 h-7 rounded-full border-2 border-teal-100 border-t-teal-500 animate-spin mb-3" />
          <div className="text-ink-label text-sm">Loading approvals...</div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm">{error}</div>
      )}

      {!loading && pending.length > 0 && (
        <div className="mb-8">
          <div className="label-upper text-orange-600 mb-3">{pending.length} Pending</div>
          <div className="flex flex-col gap-3">
            {pending.map(item => (
              <div key={item.id} className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                    <span className={`pill ${RISK_STYLE[item.risk]}`}>{item.risk} risk</span>
                    <span className="pill bg-surface text-ink-meta">{item.source}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold text-ink-heading mb-1">{item.action}</div>
                    <p className="text-[13px] text-ink-body m-0 leading-snug">{item.detail}</p>
                    <div className="text-[11px] text-ink-meta mt-2">{item.ts} · {item.id}</div>

                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="mt-3 text-[12px] font-bold text-ink-label hover:text-ink-secondary transition-colors"
                    >
                      {expanded[item.id] ? '↑ Hide comment' : '+ Add comment or instructions'}
                    </button>

                    {expanded[item.id] && (
                      <div className="mt-2">
                        <textarea
                          value={comments[item.id] || ''}
                          onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Add instructions, modifications, or notes for Kai..."
                          rows={3}
                          className="w-full rounded-xl border border-surface-border text-[13px] text-ink-primary px-3 py-2 outline-none resize-none focus:border-teal-500 transition-colors"
                          style={{ background: '#f9fbfc' }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => act(item.id, 'approved')}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(item.id, 'denied')}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && pending.length === 0 && (
        <div className="card p-8 flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="font-extrabold text-ink-heading mb-1">No pending approvals</div>
          <p className="text-ink-label text-sm">Kai will route sensitive operations here for your approval.</p>
        </div>
      )}

      {!loading && resolved.length > 0 && (
        <div>
          <div className="label-upper text-ink-meta mb-3">Recent</div>
          <div className="card divide-y divide-surface-border">
            {resolved.map(item => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                <span className={`pill shrink-0 ${STATUS_STYLE[item.status]}`}>{item.status}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-heading truncate">{item.action}</div>
                  <div className="text-[11px] text-ink-meta">{item.ts} · {item.source}</div>
                  {item.notes && (
                    <div className="text-[12px] text-ink-body mt-0.5 italic">&quot;{item.notes}&quot;</div>
                  )}
                </div>
                <span className={`pill shrink-0 ${RISK_STYLE[item.risk]}`}>{item.risk}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
