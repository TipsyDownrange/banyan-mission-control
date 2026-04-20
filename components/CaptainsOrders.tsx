'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type DecisionStatus = 'open' | 'deferred' | 'discussing' | 'resolved';
type DecisionResolution = 'approved' | 'approved_amended' | 'rejected' | 'deferred' | 'overridden' | 'rerouted' | null;

interface DecisionOption {
  label: string;
  description: string;
  tradeoffs?: string;
}

interface DecisionItem {
  decision_id: string;
  label: string;
  question: string;
  context: string;
  options: DecisionOption[];
  recommendation_index: number | null;
  recommendation_rationale: string;
  affects_phase: number | null;
  blocks_items: string[];
  deadline: string | null;
  status: DecisionStatus;
  resolution: DecisionResolution;
  resolution_timestamp: string | null;
  resolution_by: string | null;
  rationale: string | null;
  direct_order_text: string | null;
  created_at: string;
  created_by: string;
}

interface DecisionQueueData {
  decisions: DecisionItem[];
  last_updated: string;
  open_count: number;
  deferred_count: number;
  discussing_count?: number;
  resolved_count: number;
}

// ── Status + resolution config ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<DecisionStatus, { label: string; color: string; bg: string }> = {
  open:       { label: 'Open',       color: '#0f766e', bg: 'rgba(20,184,166,0.1)' },
  deferred:   { label: 'Deferred',   color: '#64748b', bg: '#f1f5f9' },
  discussing: { label: 'Discussing', color: '#d97706', bg: '#fffbeb' },
  resolved:   { label: 'Resolved',   color: '#15803d', bg: '#f0fdf4' },
};

const RESOLUTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  approved:          { label: 'Approved',          color: '#059669', bg: '#f0fdf4' },
  approved_amended:  { label: 'Approved (amended)', color: '#0f766e', bg: 'rgba(20,184,166,0.08)' },
  rejected:          { label: 'Rejected',          color: '#dc2626', bg: '#fef2f2' },
  deferred:          { label: 'Deferred',          color: '#64748b', bg: '#f1f5f9' },
  overridden:        { label: 'Overridden',        color: '#b91c1c', bg: '#fef2f2' },
  rerouted:          { label: 'Rerouted',          color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
};

function fmtDeadline(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── ResolvedDecisionCard ───────────────────────────────────────────────────────

function ResolvedDecisionCard({ decision }: { decision: DecisionItem }) {
  const [expanded, setExpanded] = useState(false);
  const res = decision.resolution ? RESOLUTION_CONFIG[decision.resolution] : null;

  return (
    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'white', border: '1px solid #f1f5f9', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>{decision.label}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {decision.resolution_by} · {decision.resolution_timestamp ? new Date(decision.resolution_timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {res && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: res.color, background: res.bg }}>{res.label}</span>}
          <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#94a3b8' }}>
            {expanded ? '▾ Less' : '▸ More'}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ fontSize: 12, color: '#334155', marginBottom: 6 }}>{decision.question}</div>
          {decision.rationale && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}><strong>Rationale:</strong> {decision.rationale}</div>}
          {decision.direct_order_text && <div style={{ fontSize: 11, color: '#0f766e', padding: '6px 10px', borderRadius: 7, background: 'rgba(15,118,110,0.05)', border: '1px solid rgba(15,118,110,0.15)', marginTop: 4 }}><strong>Direct Order:</strong> {decision.direct_order_text}</div>}
        </div>
      )}
    </div>
  );
}

// ── DecisionCard ───────────────────────────────────────────────────────────────

function DecisionCard({ decision, onAction }: {
  decision: DecisionItem;
  onAction: (id: string, resolution: string, rationale?: string, directOrder?: string, explicitStatus?: string) => Promise<void>;
}) {
  const [directOrder, setDirectOrder] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const statusCfg = STATUS_CONFIG[decision.status];
  const hasDirectOrder = directOrder.trim().length > 0;

  const fire = async (resolution: string, requiresDirectOrder = false) => {
    if (requiresDirectOrder && !hasDirectOrder) {
      setOverrideError(true);
      return;
    }
    setOverrideError(false);
    setSubmitting(resolution);
    try {
      await onAction(decision.decision_id, resolution, undefined, hasDirectOrder ? directOrder : undefined);
      setDirectOrder('');
      setFlash(resolution);
      setTimeout(() => setFlash(null), 2000);
    } finally {
      setSubmitting(null);
    }
  };

  const fireDiscuss = async () => {
    setSubmitting('discuss');
    try { await onAction(decision.decision_id, '', undefined, undefined, 'discussing'); }
    finally { setSubmitting(null); }
  };

  const disabled = (label: string) => submitting !== null && submitting !== label;

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{decision.label}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: statusCfg.color, background: statusCfg.bg }}>
                {statusCfg.label}
              </span>
              {decision.affects_phase !== null && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Phase {decision.affects_phase}</span>
              )}
              {decision.deadline && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706' }}>⚑ {fmtDeadline(decision.deadline)}</span>
              )}
              <span style={{ fontSize: 10, color: '#94a3b8' }}>{decision.decision_id} · {decision.created_by}</span>
            </div>
          </div>
          {flash && (
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', flexShrink: 0 }}>✓ {RESOLUTION_CONFIG[flash]?.label || 'Updated'}</div>
          )}
        </div>
      </div>

      <div style={{ padding: '14px 20px' }}>
        {/* Question */}
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 8, lineHeight: 1.4 }}>{decision.question}</div>

        {/* Context */}
        <div>
          <div style={{
            fontSize: 13, color: '#475569', lineHeight: 1.5,
            overflow: contextExpanded ? 'visible' : 'hidden',
            display: contextExpanded ? 'block' : '-webkit-box',
            WebkitLineClamp: contextExpanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
          } as React.CSSProperties}>
            {decision.context}
          </div>
          {decision.context.length > 120 && (
            <button onClick={() => setContextExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0f766e', padding: '2px 0', fontWeight: 600 }}>
              {contextExpanded ? 'Less ▴' : 'More ▾'}
            </button>
          )}
        </div>

        {/* Options */}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          {decision.options.map((opt, i) => {
            const isRec = decision.recommendation_index === i;
            return (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 9,
                background: isRec ? 'rgba(15,118,110,0.04)' : '#fafafa',
                border: isRec ? '1.5px solid rgba(15,118,110,0.2)' : '1px solid #f1f5f9',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: isRec ? '#0f766e' : '#334155' }}>
                    {i + 1}. {opt.label}
                  </span>
                  {isRec && <span style={{ fontSize: 9, fontWeight: 800, color: '#0f766e', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>XO recommends</span>}
                </div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{opt.description}</div>
                {opt.tradeoffs && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Tradeoffs: {opt.tradeoffs}</div>}
              </div>
            );
          })}
        </div>

        {/* XO Recommendation callout */}
        {decision.recommendation_rationale && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(15,118,110,0.04)', border: '1px solid rgba(15,118,110,0.15)' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0f766e' }}>XO: </span>
            <span style={{ fontSize: 11, color: '#334155' }}>{decision.recommendation_rationale}</span>
          </div>
        )}

        {/* Direct Order textarea */}
        <div style={{ marginTop: 14 }}>
          <textarea
            value={directOrder}
            onChange={e => { setDirectOrder(e.target.value); setOverrideError(false); }}
            placeholder="Direct Order: add directive, amendment, or override rationale..."
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box' as const,
              fontSize: 13, padding: '9px 12px', borderRadius: 9,
              border: overrideError ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
              outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit',
              color: '#0f172a', background: 'white', lineHeight: 1.5,
            }}
          />
          {overrideError && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>Override requires a Direct Order explaining why.</div>}
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
          {/* Approve */}
          <button disabled={disabled('approved') || disabled('approved_amended')}
            onClick={() => fire('approved')}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
              background: '#059669', color: 'white',
              cursor: submitting ? 'default' : 'pointer', opacity: disabled('approved') ? 0.5 : 1,
            }}>
            {submitting === 'approved' ? '…' : hasDirectOrder ? '✓ Approve + Amend' : '✓ Approve'}
          </button>

          {/* Defer */}
          <button disabled={disabled('deferred')}
            onClick={() => fire('deferred')}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1px solid #e2e8f0', background: 'white', color: '#64748b',
              cursor: submitting ? 'default' : 'pointer', opacity: disabled('deferred') ? 0.5 : 1,
            }}>
            {submitting === 'deferred' ? '…' : 'Defer'}
          </button>

          {/* Discuss */}
          {decision.status !== 'discussing' && (
            <button disabled={disabled('discuss')}
              onClick={fireDiscuss}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: '1px solid #e2e8f0', background: 'white', color: '#64748b',
                cursor: submitting ? 'default' : 'pointer', opacity: disabled('discuss') ? 0.5 : 1,
              }}>
              {submitting === 'discuss' ? '…' : '💬 Discuss'}
            </button>
          )}

          {/* Override */}
          <button disabled={disabled('overridden')}
            onClick={() => fire('overridden', true)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1.5px solid #dc2626', background: 'white', color: '#dc2626',
              cursor: submitting ? 'default' : 'pointer', opacity: disabled('overridden') ? 0.5 : 1,
            }}>
            {submitting === 'overridden' ? '…' : 'Override'}
          </button>

          {/* Reroute */}
          <button disabled={disabled('rerouted')}
            onClick={() => fire('rerouted', true)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: '1px solid #e2e8f0', background: 'white', color: '#7c3aed',
              cursor: submitting ? 'default' : 'pointer', opacity: disabled('rerouted') ? 0.5 : 1,
            }}>
            {submitting === 'rerouted' ? '…' : '↪ Reroute'}
          </button>

          {/* Add Directive standalone */}
          {hasDirectOrder && (
            <button disabled={disabled('directive')}
              onClick={async () => {
                setSubmitting('directive');
                try { await onAction(decision.decision_id, 'approved_amended', undefined, directOrder); setDirectOrder(''); setFlash('approved_amended'); setTimeout(() => setFlash(null), 2000); }
                finally { setSubmitting(null); }
              }}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
                background: '#14b8a6', color: 'white',
                cursor: submitting ? 'default' : 'pointer', opacity: disabled('directive') ? 0.5 : 1,
              }}>
              {submitting === 'directive' ? '…' : 'Add Directive'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main CaptainsOrders component ──────────────────────────────────────────────

type FilterTab = 'all' | 'open' | 'deferred' | 'discussing' | 'resolved';

export default function CaptainsOrders() {
  const [data, setData] = useState<DecisionQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('open');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/decision-queue');
      const json = await res.json();
      if (json.ok) { setData(json.data); setError(null); }
      else { setError(json.error || 'Failed to load decision queue'); }
    } catch (e) {
      console.error('[CaptainsOrders] fetch error:', e);
      setError('Network error loading decision queue');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const handleAction = useCallback(async (id: string, resolution: string, rationale?: string, directOrder?: string, explicitStatus?: string) => {
    try {
      await fetch('/api/decision-queue/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision_id: id, resolution: resolution || undefined, rationale: rationale || null, direct_order_text: directOrder || null, status: explicitStatus }),
      });
      await fetchData();
    } catch (e) { console.error('[CaptainsOrders] action error:', e); }
  }, [fetchData]);

  if (loading) return (
    <div style={{ padding: '20px 0', fontSize: 12, color: '#94a3b8' }}>Loading Captain's Orders…</div>
  );
  if (error) return (
    <div style={{ padding: '16px 20px', borderRadius: 12, background: 'white', border: '1px solid #fca5a5', marginTop: 20 }}>
      <div style={{ fontSize: 12, color: '#dc2626' }}>Captain's Orders unavailable: {error}</div>
    </div>
  );
  if (!data) return null;

  const allDecisions = data.decisions || [];
  const openCount = data.open_count || 0;
  const deferredCount = data.deferred_count || 0;
  const discussingCount = data.discussing_count || 0;
  const resolvedCount = data.resolved_count || 0;

  const filtered = filter === 'all' ? allDecisions
    : allDecisions.filter(d => d.status === filter);

  // Sort open decisions: deadlined first (soonest), then non-deadlined
  const sorted = [...filtered].sort((a, b) => {
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  const TABS: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'open', label: 'Open', count: openCount },
    { key: 'discussing', label: 'Discussing', count: discussingCount },
    { key: 'deferred', label: 'Deferred', count: deferredCount },
    { key: 'resolved', label: 'Resolved', count: resolvedCount },
    { key: 'all', label: 'All' },
  ];

  return (
    <div style={{ marginTop: 24 }}>
      {/* Header */}
      <div style={{
        background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '14px 20px', marginBottom: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#94a3b8' }}>
            S3 — Captain's Orders
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 1 }}>Decision Queue</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          {openCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(20,184,166,0.1)', color: '#0f766e' }}>{openCount} open</span>}
          {discussingCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#fffbeb', color: '#d97706' }}>{discussingCount} discussing</span>}
          {deferredCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#f1f5f9', color: '#64748b' }}>{deferredCount} deferred</span>}
          {openCount === 0 && discussingCount === 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#f0fdf4', color: '#15803d' }}>All clear ✓</span>}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' as const }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: filter === tab.key ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0',
              background: filter === tab.key ? 'rgba(240,253,250,0.96)' : 'white',
              color: filter === tab.key ? '#0f766e' : '#64748b',
            }}>
            {tab.label}{tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
          </button>
        ))}
      </div>

      {/* Decision list */}
      {sorted.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center' as const, color: '#94a3b8', fontSize: 13, background: 'white', borderRadius: 12, border: '1px solid #f1f5f9' }}>
          {filter === 'resolved' ? 'No resolved decisions yet.' : filter === 'open' ? 'No open decisions — all clear.' : `No ${filter} decisions.`}
        </div>
      ) : filter === 'resolved' ? (
        <div>{sorted.map(d => <ResolvedDecisionCard key={d.decision_id} decision={d} />)}</div>
      ) : (
        <div>{sorted.map(d => <DecisionCard key={d.decision_id} decision={d} onAction={handleAction} />)}</div>
      )}
    </div>
  );
}
