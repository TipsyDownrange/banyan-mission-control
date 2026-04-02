'use client';
import { useEffect, useState, useMemo } from 'react';

type Bid = Record<string, string>;

const DECISION_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  'needs review':    { color: '#92400e', bg: 'rgba(255,251,235,0.9)',  border: '1px solid rgba(245,158,11,0.25)' },
  'assign':          { color: '#0369a1', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.25)' },
  'waiting on docs': { color: '#6d28d9', bg: 'rgba(245,243,255,0.9)', border: '1px solid rgba(139,92,246,0.25)' },
  'in estimating':   { color: '#0f766e', bg: 'rgba(240,253,250,0.9)', border: '1px solid rgba(13,148,136,0.25)' },
  'submitted':       { color: '#1d4ed8', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.25)' },
  'won':             { color: '#15803d', bg: 'rgba(240,253,244,0.9)', border: '1px solid rgba(34,197,94,0.25)' },
  'lost':            { color: '#b91c1c', bg: 'rgba(254,242,242,0.9)', border: '1px solid rgba(239,68,68,0.25)' },
  'no bid':          { color: '#64748b', bg: 'rgba(248,250,252,0.9)', border: '1px solid rgba(148,163,184,0.25)' },
};

const PILL = (label: string, style: {color:string;bg:string;border:string}) => (
  <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: style.color, background: style.bg, border: style.border }}>{label}</span>
);

const FL = (text: string) => (
  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: '#64748b', marginBottom: 6 }}>{text}</div>
);

function daysUntil(d: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function getDecisionState(bid: Bid, overrides: Record<string, Record<string,string>>): string {
  const ds = overrides[bid['kID']]?.decisionState;
  if (ds) return ds;
  const wl = (bid['Win / Loss'] || '').toLowerCase();
  const st = (bid['Status'] || '').toLowerCase();
  if (wl === 'won') return 'won';
  if (wl === 'lost') return 'lost';
  if (wl === 'no bid') return 'no bid';
  if (st === 'submitted') return 'submitted';
  if (st === 'assigned' && bid['Assigned To']) return 'in estimating';
  return 'needs review';
}

const ESTIMATORS = ['Kyle Shimizu', 'Jenny Shimabukuro', 'Mark Olson', 'Sean Daniels'];

// Simulated current user — will come from OAuth session
const DEMO_USERS: Record<string, string> = {
  'Kyle Shimizu': 'Kyle Shimizu',
  'Jenny Shimabukuro': 'Jenny Shimabukuro',
  'Mark Olson': 'Mark Olson',
  'Sean Daniels': 'Sean Daniels',
};

export default function EstimatorWorkspace({ currentUser = 'Kyle Shimizu' }: { currentUser?: string }) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState<Record<string, Record<string,string>>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'submitted' | 'closed'>('active');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/bids?limit=300')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setBids(d.bids || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  function setEff(kID: string, field: string, val: string) {
    setOverrides(p => ({ ...p, [kID]: { ...p[kID], [field]: val } }));
  }

  // My bids — filtered to current user
  const myBids = useMemo(() => bids.filter(b => {
    const assigned = b['Assigned To'] || '';
    return assigned.includes(currentUser.split(' ')[0]) || assigned === currentUser;
  }), [bids, currentUser]);

  const filtered = useMemo(() => {
    let result = myBids;
    const wl = (b: Bid) => (b['Win / Loss'] || '').toLowerCase();
    const st = (b: Bid) => (b['Status'] || '').toLowerCase();
    const isActive = (b: Bid) => !['won','lost','no bid'].includes(wl(b)) && !['won','lost','no bid'].includes(st(b));

    if (filter === 'active') result = result.filter(b => isActive(b) && st(b) !== 'submitted');
    if (filter === 'submitted') result = result.filter(b => st(b) === 'submitted');
    if (filter === 'closed') result = result.filter(b => ['won','lost','no bid'].includes(wl(b)));
    if (search) result = result.filter(b => (b['Job Name']||'').toLowerCase().includes(search.toLowerCase()));
    return result;
  }, [myBids, filter, search]);

  const newAssignments = myBids.filter(b => (b['Status']||'').toLowerCase() === 'assigned' && !overrides[b['kID']]).length;
  const activeCount = myBids.filter(b => !['won','lost','no bid'].includes((b['Win / Loss']||'').toLowerCase())).length;
  const submittedCount = myBids.filter(b => (b['Status']||'').toLowerCase() === 'submitted').length;

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto', display: 'grid', gap: 20 }}>

      {/* Personal header */}
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8' }}>My Estimating Workspace</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>{currentUser}</h1>
        {newAssignments > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 12, background: 'rgba(255,251,235,0.98)', border: '1px solid rgba(245,158,11,0.3)', marginTop: 6, width: 'fit-content' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>{newAssignments} new bid{newAssignments > 1 ? 's' : ''} assigned to you</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 45%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 18px 36px rgba(15,23,42,0.08)' }}>
        {[
          { label: 'My active bids', value: activeCount, helper: 'In your pipeline' },
          { label: 'Submitted', value: submittedCount, helper: 'Awaiting decision' },
          { label: 'New assignments', value: newAssignments, helper: 'Need your attention' },
          { label: 'Showing', value: filtered.length, helper: 'Current filter' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a' }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.helper}</div>
          </div>
        ))}
      </section>

      {/* Kai posture */}
      <div style={{ padding: '12px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.8)', border: '1px dashed rgba(148,163,184,0.42)', display: 'flex', gap: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(13,148,136,0.7)', flexShrink: 0, marginTop: 2 }}>KAI</span>
        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
          {newAssignments > 0
            ? `You have ${newAssignments} new bid${newAssignments > 1 ? 's' : ''} assigned. Review scope and check for pre-flight checklist items before starting takeoff.`
            : `Your pipeline is current. ${submittedCount > 0 ? `${submittedCount} bid${submittedCount > 1 ? 's' : ''} submitted and awaiting decision.` : 'No bids pending decision.'}`}
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search my bids..."
          style={{ flex: '1 1 200px', background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '9px 14px', fontSize: 13, color: '#0f172a', outline: 'none' }} />
        {(['active','submitted','closed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            border: filter === f ? '1px solid rgba(15,118,110,0.3)' : '1px solid #e2e8f0',
            background: filter === f ? 'rgba(240,253,250,0.96)' : 'white',
            color: filter === f ? '#0f766e' : '#64748b', cursor: 'pointer',
          }}>{f}</button>
        ))}
      </div>

      {loading && (
        <div style={{ background: 'white', borderRadius: 24, padding: 48, textAlign: 'center', border: '1px solid rgba(226,232,240,0.9)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading your bids...</div>
        </div>
      )}

      {/* Bid cards — Hunter architecture */}
      {!loading && (
        <div style={{ display: 'grid', gap: 14 }}>
          {filtered.map(bid => {
            const kID = bid['kID'];
            const ds = getDecisionState(bid, overrides);
            const dStyle = DECISION_STYLES[ds] || DECISION_STYLES['needs review'];
            const days = daysUntil(bid['Due Date']);
            const urgent = days !== null && days <= 3 && days >= 0;
            const isNew = (bid['Status']||'').toLowerCase() === 'assigned' && !overrides[kID];
            const isExpanded = expanded === kID;
            const accent = urgent ? '#f97316' : isNew ? '#f59e0b' : ds === 'won' ? '#22c55e' : ds === 'lost' ? '#ef4444' : '#0d9488';

            return (
              <article key={kID} style={{
                display: 'grid', gap: 16, padding: 20, borderRadius: 24,
                background: isNew ? 'rgba(255,251,235,0.98)' : 'rgba(255,255,255,0.98)',
                border: isNew ? '1px solid rgba(245,158,11,0.22)' : urgent ? '1px solid rgba(249,115,22,0.22)' : '1px solid rgba(226,232,240,0.9)',
                boxShadow: '0 14px 30px rgba(15,23,42,0.06)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 6, background: accent }} />

                {/* Top row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 12px', justifyContent: 'space-between', paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>{kID}</span>
                      {PILL(ds, dStyle)}
                      {isNew && PILL('New Assignment', { color: '#92400e', bg: 'rgba(255,251,235,0.9)', border: '1px solid rgba(245,158,11,0.3)' })}
                      {urgent && PILL(`Due in ${days}d`, { color: '#c2410c', bg: 'rgba(255,247,237,0.9)', border: '1px solid rgba(249,115,22,0.25)' })}
                      {bid['Island'] && PILL(bid['Island'], { color: '#0369a1', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.2)' })}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a', lineHeight: 1.1 }}>
                      {bid['Job Name']}
                    </h3>
                    <div style={{ fontSize: 14, color: '#334155', fontWeight: 600 }}>
                      {bid['Due Date'] ? `Due ${bid['Due Date']}` : 'No due date set'}
                    </div>
                  </div>

                  {/* Desk posture */}
                  <div style={{ display: 'grid', gap: 8, minWidth: 200, padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.92)' }}>
                    {FL('Status')}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        ['In Estimating', 'in estimating'],
                        ['Submitted', 'submitted'],
                        ['Won', 'won'],
                        ['Lost', 'lost'],
                        ['No Bid', 'no bid'],
                      ].map(([label, val]) => (
                        <button key={val} onClick={() => setEff(kID, 'decisionState', val)}
                          style={{
                            padding: '5px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
                            letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                            border: ds === val ? `1px solid ${DECISION_STYLES[val]?.color}44` : '1px solid #e2e8f0',
                            background: ds === val ? DECISION_STYLES[val]?.bg : 'white',
                            color: ds === val ? DECISION_STYLES[val]?.color : '#94a3b8',
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fields row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, paddingLeft: 4 }}>
                  <div>{FL('Received')}<div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{bid['Received Date'] || '—'}</div></div>
                  <div>{FL('GC Count')}<div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700 }}>{bid['GC Count'] || '1'} GC{parseInt(bid['GC Count']||'1') > 1 ? 's' : ''}</div></div>
                  <div>{FL('Est. Value')}<div style={{ fontSize: 14, color: '#0f766e', fontWeight: 700 }}>{bid['Est Value (High)'] || '—'}</div></div>
                  <div>{FL('Products / Specs')}<div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{bid['Products / Specs'] || '—'}</div></div>
                </div>

                {/* Scope + Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(220px,0.8fr)', gap: 14, paddingLeft: 4 }}>
                  <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(226,232,240,0.92)' }}>
                    {FL('Scope summary')}
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#334155' }}>{bid['Notes'] || 'No scope notes yet. Add notes as you work through the takeoff.'}</div>
                  </div>
                  <div style={{ padding: 16, borderRadius: 18, background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(148,163,184,0.16)', display: 'grid', gap: 10 }}>
                    {FL('Documents')}
                    {bid['Bid Platform URL'] ? (
                      <a href={bid['Bid Platform URL']} target="_blank" rel="noopener"
                        style={{ fontSize: 13, fontWeight: 700, color: '#0f766e', textDecoration: 'none', padding: '7px 12px', borderRadius: 10, background: 'rgba(240,253,250,0.96)', border: '1px solid rgba(15,118,110,0.2)', display: 'block' }}>
                        Open Bid Platform ↗
                      </a>
                    ) : <div style={{ fontSize: 13, color: '#94a3b8' }}>No bid platform link</div>}
                    {bid['Estimating Folder Path'] ? (
                      <div style={{ fontSize: 12, color: '#64748b' }}>📁 {bid['Estimating Folder Path']}</div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Estimating folder not linked yet</div>
                    )}
                    <button onClick={() => setExpanded(isExpanded ? null : kID)}
                      style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                      {isExpanded ? '↑ Less' : '↓ Add note'}
                    </button>
                    {isExpanded && (
                      <textarea placeholder="Add estimating notes, assumptions, risk items..."
                        style={{ fontSize: 12, padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', resize: 'none', outline: 'none', color: '#0f172a', lineHeight: 1.5 }}
                        rows={3} />
                    )}
                  </div>
                </div>

                {/* Bid-log lookup */}
                <div style={{ paddingLeft: 4 }}>
                  <div style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(226,232,240,0.94)' }}>
                    {FL('Bid log entry')}
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{kID}</span>
                      {' · '}{ds}
                      {bid['Win / Loss'] ? ` · ${bid['Win / Loss']}` : ''}
                      {' · '}Assigned to {bid['Assigned To'] || 'Unassigned'}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div style={{ background: 'white', borderRadius: 24, border: '1px solid rgba(226,232,240,0.9)', padding: 48, textAlign: 'center', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                {filter === 'active' ? 'No active bids' : filter === 'submitted' ? 'No submitted bids' : 'No closed bids'}
              </div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>
                {filter === 'active' ? 'New assignments will appear here.' : 'Items will appear here once status is updated.'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
