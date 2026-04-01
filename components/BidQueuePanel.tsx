'use client';
import { useEffect, useState } from 'react';

type Bid = Record<string, string>;

type DecisionState = 'needs review' | 'assign' | 'waiting on docs' | 'in estimating' | 'submitted' | 'won' | 'lost' | 'no bid';

const DECISION_STYLES: Record<DecisionState, { color: string; bg: string; border: string }> = {
  'needs review':   { color: '#92400e', bg: 'rgba(255,251,235,0.9)',  border: '1px solid rgba(245,158,11,0.25)' },
  'assign':         { color: '#0369a1', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.25)' },
  'waiting on docs':{ color: '#6d28d9', bg: 'rgba(245,243,255,0.9)', border: '1px solid rgba(139,92,246,0.25)' },
  'in estimating':  { color: '#0f766e', bg: 'rgba(240,253,250,0.9)', border: '1px solid rgba(13,148,136,0.25)' },
  'submitted':      { color: '#1d4ed8', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.25)' },
  'won':            { color: '#15803d', bg: 'rgba(240,253,244,0.9)', border: '1px solid rgba(34,197,94,0.25)' },
  'lost':           { color: '#b91c1c', bg: 'rgba(254,242,242,0.9)', border: '1px solid rgba(239,68,68,0.25)' },
  'no bid':         { color: '#64748b', bg: 'rgba(248,250,252,0.9)', border: '1px solid rgba(148,163,184,0.25)' },
};

const CARD_STYLES: Record<string, { background: string; border: string; accent: string; tone: string }> = {
  urgent:   { background: 'rgba(255,247,237,0.98)', border: '1px solid rgba(249,115,22,0.22)', accent: '#f97316', tone: 'Due soon' },
  match:    { background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(13,148,136,0.22)', accent: '#0d9488', tone: 'In bid log' },
  nodocs:   { background: 'rgba(254,252,232,0.98)', border: '1px solid rgba(202,138,4,0.22)',  accent: '#d97706', tone: 'Missing docs' },
  clean:    { background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(226,232,240,0.9)', accent: '#94a3b8', tone: 'New' },
};

const FIELD_LABEL = (text: string) => (
  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#64748b', marginBottom: 4 }}>
    {text}
  </div>
);

const PILL = (label: string, style: {color: string; bg: string; border: string}) => (
  <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: style.color, background: style.bg, border: style.border }}>
    {label}
  </span>
);

const ESTIMATORS = ['Unassigned', 'Kyle', 'Jenny', 'Mark Olson', 'Sean'];
const DECISION_STATES: DecisionState[] = ['needs review', 'assign', 'waiting on docs', 'in estimating', 'submitted', 'won', 'lost', 'no bid'];

function daysUntil(dateStr: string) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function getCardStyle(bid: Bid) {
  const days = daysUntil(bid['Due Date']);
  const hasMatch = bid['Win / Loss'] === 'Won';
  const noDocs = false; // could be derived from a field
  if (days !== null && days <= 3 && days >= 0) return CARD_STYLES.urgent;
  if (hasMatch) return CARD_STYLES.match;
  return CARD_STYLES.clean;
}

function getDecisionState(bid: Bid): DecisionState {
  const status = (bid['Status'] || '').toLowerCase();
  const winLoss = (bid['Win / Loss'] || '').toLowerCase();
  if (winLoss === 'won') return 'won';
  if (winLoss === 'lost') return 'lost';
  if (winLoss === 'no bid') return 'no bid';
  if (status === 'submitted') return 'submitted';
  if (status === 'assigned' && bid['Assigned To']) return 'in estimating';
  if (status === 'assigned' && !bid['Assigned To']) return 'assign';
  return 'needs review';
}

export default function BidQueuePanel() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'active' | 'mine' | 'all'>('active');
  const [overrides, setOverrides] = useState<Record<string, { assignedTo?: string; decisionState?: DecisionState; notes?: string }>>({});
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bids?limit=150')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setBids(d.bids || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  function updateBid(kID: string, field: string, value: string) {
    setOverrides(prev => ({ ...prev, [kID]: { ...prev[kID], [field]: value } }));
  }

  function getEffective(bid: Bid, field: string) {
    const kID = bid['kID'];
    return (overrides[kID] as Record<string, string> | undefined)?.[field] ?? bid[field] ?? '';
  }

  const active = bids.filter(b => !['Won','Lost','No Bid'].includes(b['Status'] || '') && !['Won','Lost','No Bid'].includes(b['Win / Loss'] || ''));
  const displayed = filter === 'active' ? active : filter === 'mine' ? bids.filter(b => (b['Assigned To'] || '').toLowerCase().includes('sean')) : bids.slice(0, 50);

  const needsReview = active.filter(b => !b['Assigned To']).length;
  const waitingDocs = active.filter(b => daysUntil(b['Due Date']) !== null && (daysUntil(b['Due Date']) || 99) <= 3).length;
  const inEstimating = active.filter(b => b['Assigned To']).length;

  if (loading) return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ background: 'white', borderRadius: 24, padding: 48, textAlign: 'center', border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading bid log...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 18 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Estimating</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Bid Queue</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', paddingBottom: 4 }}>Live · BanyanOS Bid Log</div>
        </div>
      </div>

      {/* Stats + posture */}
      <section style={{ display: 'grid', gap: 16, padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.92) 45%, rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 18px 36px rgba(15,23,42,0.08)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
          {[
            { label: 'Active bids', value: `${active.length}`, helper: 'In the pipeline right now' },
            { label: 'Needs assignment', value: `${needsReview}`, helper: 'No estimator assigned yet' },
            { label: 'Due within 3 days', value: `${waitingDocs}`, helper: 'Deadline pressure' },
            { label: 'In estimating', value: `${inEstimating}`, helper: 'Assigned and in progress' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a' }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.helper}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 10, padding: '12px 14px', borderRadius: 18, background: 'rgba(15,23,42,0.04)', border: '1px dashed rgba(148,163,184,0.42)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Bid desk posture:</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: '#475569' }}>
              Assign unassigned bids first. Flag anything due within 3 days as urgent. Hold incomplete invites in daylight — don't log until docs are confirmed.
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['active','Active pipeline'],['mine','My bids'],['all','All bids']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            border: filter === k ? '1px solid rgba(15,118,110,0.3)' : '1px solid rgba(226,232,240,0.9)',
            background: filter === k ? 'rgba(240,253,250,0.96)' : 'white',
            color: filter === k ? '#0f766e' : '#64748b', cursor: 'pointer',
          }}>{l} · {k === 'active' ? active.length : k === 'mine' ? bids.filter(b=>(b['Assigned To']||'').toLowerCase().includes('sean')).length : Math.min(bids.length,50)}</button>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(254,242,242,0.98)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 18, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>Error loading bids</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{error}</div>
        </div>
      )}

      {/* Bid cards */}
      <section style={{ display: 'grid', gap: 14 }}>
        {displayed.map(bid => {
          const kID = bid['kID'];
          const cardStyle = getCardStyle(bid);
          const decisionState = (overrides[kID]?.decisionState || getDecisionState(bid)) as DecisionState;
          const decisionStyle = DECISION_STYLES[decisionState];
          const assignedTo = getEffective(bid, 'Assigned To') || 'Unassigned';
          const days = daysUntil(bid['Due Date']);
          const urgent = days !== null && days <= 3 && days >= 0;

          return (
            <article key={kID} style={{
              display: 'grid', gap: 16, padding: 18, borderRadius: 24,
              background: cardStyle.background, border: cardStyle.border,
              boxShadow: '0 14px 30px rgba(15,23,42,0.06)',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Left accent bar */}
              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 6, background: cardStyle.accent }} />

              {/* Top row — pills + name + desk posture */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 12px', justifyContent: 'space-between', alignItems: 'flex-start', paddingLeft: 4 }}>
                <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: 1 }}>
                  {/* Pill row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>{kID}</span>
                    {PILL(cardStyle.tone, { color: cardStyle.accent, bg: 'rgba(255,255,255,0.72)', border: `1px solid ${cardStyle.accent}33` })}
                    {PILL(decisionState, decisionStyle)}
                    {urgent && PILL(`Due in ${days}d`, { color: '#c2410c', bg: 'rgba(255,247,237,0.9)', border: '1px solid rgba(249,115,22,0.25)' })}
                  </div>

                  {/* Project name */}
                  <h3 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a', lineHeight: 1.1 }}>
                    {bid['Job Name']}
                  </h3>
                  <div style={{ fontSize: 14, color: '#334155', fontWeight: 600 }}>
                    {bid['Island'] && <span>{bid['Island']} · </span>}
                    GC / source: {bid['General Contractor'] || bid['Bid Source'] || 'Not specified'}
                  </div>
                </div>

                {/* Desk posture card */}
                <div style={{ display: 'grid', gap: 8, minWidth: 200, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.92)' }}>
                  {FIELD_LABEL('Desk posture')}
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                    {urgent ? '⚡ Urgent' : days !== null && days <= 7 ? 'Due this week' : 'Normal pipeline'}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    {bid['Due Date'] ? `Due ${bid['Due Date']}` : 'No due date'}
                  </div>
                  {/* Assign dropdown */}
                  <select
                    value={assignedTo}
                    onChange={e => updateBid(kID, 'Assigned To', e.target.value)}
                    style={{ fontSize: 12, padding: '6px 10px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#0f172a', fontWeight: 700, cursor: 'pointer', outline: 'none' }}
                  >
                    {ESTIMATORS.map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
              </div>

              {/* Detail fields row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14, paddingLeft: 4 }}>
                <div>
                  {FIELD_LABEL('Received')}
                  <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{bid['Received Date'] || '—'}</div>
                </div>
                <div>
                  {FIELD_LABEL('Bid due')}
                  <div style={{ fontSize: 14, color: urgent ? '#c2410c' : '#0f172a', fontWeight: 700 }}>{bid['Due Date'] || '—'}</div>
                </div>
                <div>
                  {FIELD_LABEL('GC count')}
                  <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{bid['GC Count'] || '1'}</div>
                </div>
                <div>
                  {FIELD_LABEL('Est. value')}
                  <div style={{ fontSize: 14, color: '#0f766e', fontWeight: 700 }}>{bid['Est Value (High)'] || '—'}</div>
                </div>
                <div>
                  {FIELD_LABEL('Docs available')}
                  <div style={{ fontSize: 14, fontWeight: 800, color: bid['Site Visit Done'] === 'Yes' ? '#047857' : '#b45309' }}>
                    {bid['Site Visit Done'] === 'Yes' ? 'Yes — package ready' : 'Pending confirmation'}
                  </div>
                </div>
                <div>
                  {FIELD_LABEL('Products / specs')}
                  <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{bid['Products / Specs'] || '—'}</div>
                </div>
              </div>

              {/* Scope summary + Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(240px,0.8fr)', gap: 14, alignItems: 'start', paddingLeft: 4 }}>
                <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(226,232,240,0.92)' }}>
                  {FIELD_LABEL('Scope summary')}
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: '#334155' }}>
                    {bid['Notes'] || 'No scope summary available.'}
                  </div>
                </div>
                <div style={{ padding: 16, borderRadius: 18, background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(148,163,184,0.16)' }}>
                  {FIELD_LABEL('Notes')}
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: '#475569' }}>
                    Bid log entry. {bid['Products / Specs'] ? `Products: ${bid['Products / Specs']}.` : ''} {bid['Assigned To'] ? `Assigned to ${bid['Assigned To']}.` : 'Unassigned.'}
                  </div>
                </div>

                {/* Decision controls */}
                <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(226,232,240,0.92)', display: 'grid', gap: 10 }}>
                  {FIELD_LABEL('Decision state')}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DECISION_STATES.map(ds => (
                      <button key={ds} onClick={() => updateBid(kID, 'decisionState', ds)}
                        style={{
                          padding: '5px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          cursor: 'pointer',
                          border: decisionState === ds ? `1px solid ${DECISION_STYLES[ds].color}44` : '1px solid rgba(226,232,240,0.8)',
                          background: decisionState === ds ? DECISION_STYLES[ds].bg : 'white',
                          color: decisionState === ds ? DECISION_STYLES[ds].color : '#94a3b8',
                        }}>
                        {ds}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setExpandedNotes(expandedNotes === kID ? null : kID)}
                    style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    {expandedNotes === kID ? '↑ Hide note' : '+ Add note'}
                  </button>
                  {expandedNotes === kID && (
                    <textarea
                      placeholder="Add a note about this bid..."
                      style={{ fontSize: 13, padding: '8px 12px', borderRadius: 12, border: '1px solid #e2e8f0', resize: 'none', outline: 'none', color: '#0f172a', lineHeight: 1.5 }}
                      rows={3}
                    />
                  )}
                </div>
              </div>
              {/* Bid-Log lookup */}
              <div style={{ paddingLeft: 4 }}>
                <div style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(226,232,240,0.94)', display: 'grid', gap: 6 }}>
                  {FIELD_LABEL('Bid-log lookup')}
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                    {bid['kID'] ? (
                      <span>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{bid['kID']}</span>
                        {' · '}{bid['Status'] || 'Unknown status'}
                        {bid['Win / Loss'] ? ` · ${bid['Win / Loss']}` : ''}
                        {' · '}{bid['Assigned To'] || 'Unassigned'}
                      </span>
                    ) : 'Not in BanyanOS bid log'}
                  </div>
                </div>
              </div>

            </article>
          );
        })}

        {displayed.length === 0 && !loading && (
          <div style={{ background: 'white', borderRadius: 24, border: '1px solid rgba(226,232,240,0.9)', padding: 48, textAlign: 'center', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No bids in this view</div>
          </div>
        )}
      </section>
    </div>
  );
}
