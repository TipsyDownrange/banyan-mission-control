'use client';
import { useEffect, useState, useMemo } from 'react';
import DashboardHeader, { KPI, ActionItem } from './DashboardHeader';

type Bid = Record<string, string>;
type DecisionState = 'needs review' | 'assign' | 'waiting on docs' | 'in estimating' | 'submitted' | 'won' | 'lost' | 'no bid';

const DECISION_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  'needs review':    { color: 'var(--color-amber-800)', bg: 'rgba(255,251,235,0.9)',  border: '1px solid rgba(245,158,11,0.25)' },
  'assign':          { color: '#0369a1', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.25)' },
  'waiting on docs': { color: '#6d28d9', bg: 'rgba(245,243,255,0.9)', border: '1px solid rgba(139,92,246,0.25)' },
  'in estimating':   { color: 'var(--bos-color-brand-primary-deep)', bg: 'rgba(240,253,250,0.9)', border: '1px solid rgba(13,148,136,0.25)' },
  'submitted':       { color: '#1d4ed8', bg: 'rgba(239,246,255,0.9)', border: '1px solid rgba(59,130,246,0.25)' },
  'won':             { color: '#15803d', bg: 'rgba(240,253,244,0.9)', border: '1px solid rgba(34,197,94,0.25)' },
  'lost':            { color: 'var(--color-red-700)', bg: 'rgba(254,242,242,0.9)', border: '1px solid rgba(239,68,68,0.25)' },
  'no bid':          { color: 'var(--bos-color-ink-disabled)', bg: 'rgba(248,250,252,0.9)', border: '1px solid rgba(148,163,184,0.25)' },
};

const PILL = (label: string, style: {color:string;bg:string;border:string}) => (
  <span style={{ padding: '4px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: style.color, background: style.bg, border: style.border }}>{label}</span>
);

const FL = (text: string) => <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--bos-color-ink-disabled)', marginBottom: 4 }}>{text}</div>;

const ESTIMATORS = ['Unassigned', 'Kyle Shimizu', 'Jenny', 'Mark Olson', 'Sean Daniels'];
const ISLANDS = ['All Islands', 'Oahu', 'Maui', 'Kauai', 'Hawaii', 'Molokai', 'Lanai'];

function daysUntil(d: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

function getDecisionState(bid: Bid): DecisionState {
  const wl = (bid['Win / Loss'] || '').toLowerCase();
  const st = (bid['Status'] || '').toLowerCase();
  if (wl === 'won') return 'won';
  if (wl === 'lost') return 'lost';
  if (wl === 'no bid') return 'no bid';
  if (st === 'submitted') return 'submitted';
  if (st === 'assigned' && bid['Assigned To']) return 'in estimating';
  if (st === 'assigned' && !bid['Assigned To']) return 'assign';
  return 'needs review';
}

export default function BidQueuePanel() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [filterIsland, setFilterIsland] = useState('All Islands');
  const [filterStatus, setFilterStatus] = useState('active');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [promoting, setPromoting] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch('/api/bids?limit=300')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setBids(d.bids || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  function getEff(bid: Bid, field: string) {
    return overrides[bid['kID']]?.[field] ?? bid[field] ?? '';
  }
  function setEff(kID: string, field: string, val: string) {
    setOverrides(p => ({ ...p, [kID]: { ...p[kID], [field]: val } }));
  }

  async function promoteBid(bid: Bid) {
    const bidKid = bid['kID'];
    if (!bidKid) return;
    const engagementId = window.prompt('Engagement UUID to promote this bid into:');
    if (!engagementId) return;
    setPromoting(p => ({ ...p, [bidKid]: true }));
    setToast('');
    try {
      const created = await fetch('/api/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kid: bidKid.startsWith('BID-') ? bidKid : undefined,
          bid_state: 'go_decision',
          source_channel: bid['Bid Source'] || bid['Source'] || 'legacy_bid_queue',
          due_date: bid['Due Date'] || null,
          bid_amount: bid['Est Value (High)'] || null,
        }),
      }).then(r => r.json());
      if (created.error) throw new Error(created.error);
      const pgBidKid = created.data?.kid || bidKid;
      const promoted = await fetch(`/api/bids/${encodeURIComponent(pgBidKid)}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_id: engagementId,
          work_type: 'project',
          name: bid['Job Name'] || pgBidKid,
        }),
      }).then(r => r.json());
      if (promoted.error) throw new Error(promoted.error);
      setToast(`Promoted ${pgBidKid} → ${promoted.work_record?.kid || 'work record'}`);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Bid promotion failed');
    } finally {
      setPromoting(p => ({ ...p, [bidKid]: false }));
    }
  }

  const filtered = useMemo(() => {
    return bids.filter(b => {
      const wl = b['Win / Loss'] || '';
      const st = b['Status'] || '';
      const isActive = !['Won','Lost','No Bid'].includes(wl) && !['Won','Lost','No Bid'].includes(st);
      if (filterStatus === 'active' && !isActive) return false;
      if (filterStatus === 'won' && wl !== 'Won') return false;
      if (filterStatus === 'lost' && wl !== 'Lost' && wl !== 'No Bid') return false;
      if (filterStatus === 'submitted' && st !== 'Submitted') return false;
      if (filterAssignee !== 'All') {
          const assigned = (b['Assigned To'] || '');
          if (filterAssignee === 'unassigned') { if (assigned !== '') return false; }
          else { if (!assigned.includes(filterAssignee)) return false; }
        }
      if (filterIsland !== 'All Islands' && (b['Island'] || '') !== filterIsland) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!(b['Job Name'] || '').toLowerCase().includes(s) &&
            !(b['kID'] || '').toLowerCase().includes(s) &&
            !(b['Assigned To'] || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [bids, filterStatus, filterAssignee, filterIsland, search]);

  const active = bids.filter(b => !['Won','Lost','No Bid'].includes(b['Win / Loss'] || '') && !['Won','Lost','No Bid'].includes(b['Status'] || ''));
  const urgent = active.filter(b => { const d = daysUntil(b['Due Date']); return d !== null && d <= 3 && d >= 0; });
  const unassigned = active.filter(b => !b['Assigned To']);

  if (loading) return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ background: 'white', borderRadius: 24, padding: 48, textAlign: 'center', border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: 'var(--bos-color-brand-primary)', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>Loading bid log...</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 16 }}>

      {/* Dashboard Header */}
      {(() => {
        const activeBids = bids.filter(b => !['won','lost','no bid'].includes(getDecisionState(b)));
        const submittedBids = bids.filter(b => getDecisionState(b) === 'submitted');
        const wonBids = bids.filter(b => getDecisionState(b) === 'won');
        const lostBids = bids.filter(b => getDecisionState(b) === 'lost');
        const noBids = bids.filter(b => getDecisionState(b) === 'no bid');
        const totalDecided = wonBids.length + lostBids.length;
        const hitRate = totalDecided > 0 ? Math.round((wonBids.length / totalDecided) * 100) : 0;
        const dueSoon = activeBids.filter(b => { const d = daysUntil(b['Due Date']); return d !== null && d >= 0 && d <= 7; });
        const overdue = activeBids.filter(b => { const d = daysUntil(b['Due Date']); return d !== null && d < 0; });
        
        // Workload by estimator
        const byEstimator: Record<string, number> = {};
        activeBids.forEach(b => { const a = b['Assigned To'] || 'Unassigned'; byEstimator[a] = (byEstimator[a] || 0) + 1; });
        const workloadStr = Object.entries(byEstimator).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k.split(' ')[0]}: ${v}`).join(' · ');
        
        const kpis: KPI[] = [
          { label: 'Active Bids', value: activeBids.length, subtitle: workloadStr || 'None assigned' },
          { label: 'Submitted', value: submittedBids.length, subtitle: 'Awaiting decision', color: '#1d4ed8' },
          { label: 'Hit Rate', value: `${hitRate}%`, subtitle: `${wonBids.length} won / ${totalDecided} decided`, color: hitRate >= 30 ? '#059669' : '#d97706', progress: hitRate },
          { label: 'Due This Week', value: dueSoon.length, subtitle: overdue.length > 0 ? `${overdue.length} overdue` : 'On track', color: overdue.length > 0 ? '#dc2626' : dueSoon.length > 3 ? '#d97706' : '#059669' },
        ];
        const actionItems: ActionItem[] = [];
        if (overdue.length > 0) actionItems.push({ text: 'Overdue bids', severity: 'critical', count: overdue.length });
        if (dueSoon.length > 3) actionItems.push({ text: 'Due within 7 days', severity: 'high', count: dueSoon.length });
        const unassigned = activeBids.filter(b => !b['Assigned To']);
        if (unassigned.length > 0) actionItems.push({ text: 'Unassigned bids', severity: 'medium', count: unassigned.length });
        
        return <DashboardHeader title="Estimating" subtitle={`${bids.length} total bids tracked`} kpis={kpis} actionItems={actionItems} />;
      })()}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-ink-primary)', margin: 0 }}>Bid Queue</h2>
        </div>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
          {(['table','cards'] as const).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{
              padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              border: viewMode === v ? '1px solid rgba(15,118,110,0.3)' : '1px solid var(--color-surface-border)',
              background: viewMode === v ? 'rgba(240,253,250,0.96)' : 'white',
              color: viewMode === v ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-disabled)', cursor: 'pointer',
            }}>{v === 'table' ? '≡ Table' : '⊞ Cards'}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 45%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 18px 36px rgba(15,23,42,0.08)' }}>
        {[
          { label: 'Total in log', value: bids.length, helper: 'All time' },
          { label: 'Active pipeline', value: active.length, helper: 'In progress now' },
          { label: 'Unassigned', value: unassigned.length, helper: 'Needs estimator' },
          { label: 'Due ≤ 3 days', value: urgent.length, helper: 'Deadline pressure' },
          { label: 'Showing', value: filtered.length, helper: 'Current filters' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 26, fontWeight: 900, letterSpacing: '-0.05em', color: 'var(--color-ink-primary)', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>{s.helper}</div>
          </div>
        ))}
      </section>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search job name, ID, or estimator..."
          style={{ flex: '1 1 220px', background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '9px 14px', fontSize: 13, color: 'var(--color-ink-primary)', outline: 'none' }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer', outline: 'none' }}>
          <option value="active">Active pipeline</option>
          <option value="submitted">Submitted</option>
          <option value="won">Won</option>
          <option value="lost">Lost / No Bid</option>
          <option value="all">All bids</option>
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer', outline: 'none' }}>
          <option value="All">All estimators</option>
          <option value="Kyle Shimizu">Kyle Shimizu</option>
          <option value="Jenny Shimabukuro">Jenny Shimabukuro</option>
          <option value="Mark Olson">Mark Olson</option>
          <option value="Sean Daniels">Sean Daniels</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select value={filterIsland} onChange={e => setFilterIsland(e.target.value)}
          style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '9px 14px', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer', outline: 'none' }}>
          {ISLANDS.map(i => <option key={i}>{i}</option>)}
        </select>
        {(search || filterAssignee !== 'All' || filterIsland !== 'All Islands') && (
          <button onClick={() => { setSearch(''); setFilterAssignee('All'); setFilterIsland('All Islands'); }}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '9px 4px' }}>
            Clear filters ×
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(254,242,242,0.98)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-red-700)' }}>Error: {error}</div>
        </div>
      )}

      {toast && (
        <div style={{ background: toast.includes('failed') || toast.includes('required') ? 'rgba(254,242,242,0.98)' : 'rgba(240,253,250,0.98)', border: '1px solid rgba(20,184,166,0.22)', borderRadius: 16, padding: '12px 16px', fontSize: 13, fontWeight: 700, color: toast.includes('failed') ? 'var(--color-red-700)' : 'var(--bos-color-brand-primary-deep)' }}>
          {toast}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid rgba(226,232,240,0.9)', boxShadow: '0 14px 30px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px 110px 90px 100px 32px', gap: 0, padding: '10px 16px', background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #f1f5f9' }}>
            {['kID','Job Name','Island','Assigned','Due','Status',''].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ maxHeight: 600, overflowY: 'auto' }}>
            {filtered.map(bid => {
              const ds = getDecisionState(bid);
              const dStyle = DECISION_STYLES[ds];
              const days = daysUntil(bid['Due Date']);
              const urgent = days !== null && days <= 3 && days >= 0;
              const isExpanded = expandedRow === bid['kID'];

              return (
                <div key={bid['kID']}>
                  <div
                    onClick={() => setExpandedRow(isExpanded ? null : bid['kID'])}
                    style={{
                      display: 'grid', gridTemplateColumns: '120px 1fr 90px 110px 90px 100px 32px',
                      gap: 0, padding: '10px 16px',
                      borderBottom: '1px solid var(--color-surface)',
                      background: isExpanded ? 'rgba(240,253,250,0.4)' : 'white',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--bos-color-ink-tertiary)', display: 'flex', alignItems: 'center' }}>{bid['kID']}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)', display: 'flex', alignItems: 'center', paddingRight: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{bid['Job Name']}</div>
                    <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', display: 'flex', alignItems: 'center' }}>{bid['Island'] || '—'}</div>
                    <div style={{ fontSize: 12, color: '#334155', fontWeight: 600, display: 'flex', alignItems: 'center' }}>{bid['Assigned To'] || <span style={{ color: '#f59e0b', fontWeight: 700 }}>Unassigned</span>}</div>
                    <div style={{ fontSize: 12, color: urgent ? '#c2410c' : 'var(--bos-color-ink-disabled)', fontWeight: urgent ? 700 : 400, display: 'flex', alignItems: 'center' }}>
                      {bid['Due Date'] ? (urgent ? ` ${days}d` : bid['Due Date'].substring(5)) : '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: dStyle.color, background: dStyle.bg, border: dStyle.border, whiteSpace: 'nowrap' }}>
                        {ds}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </div>
                  </div>

                  {/* Expanded row detail */}
                  {isExpanded && (
                    <div style={{ padding: '16px 20px', background: 'rgba(248,250,252,0.6)', borderBottom: '1px solid #f1f5f9', display: 'grid', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
                        <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)', marginBottom: 4 }}>Assign to</div>
                          <select value={getEff(bid,'Assigned To') || 'Unassigned'} onChange={e => setEff(bid['kID'],'Assigned To',e.target.value)}
                            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                            {ESTIMATORS.map(e => <option key={e}>{e}</option>)}
                          </select>
                        </div>
                        <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)', marginBottom: 4 }}>Decision state</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(['needs review','in estimating','submitted','won','lost','no bid'] as DecisionState[]).map(s => (
                              <button key={s} onClick={() => setEff(bid['kID'],'decisionState',s)}
                                style={{ padding: '4px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                                  border: ds === s ? `1px solid ${DECISION_STYLES[s].color}44` : '1px solid var(--color-surface-border)',
                                  background: ds === s ? DECISION_STYLES[s].bg : 'white', color: ds === s ? DECISION_STYLES[s].color : 'var(--bos-color-ink-tertiary)' }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                        {bid['Notes'] && <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)', marginBottom: 4 }}>Notes</div>
                          <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)', lineHeight: 1.5 }}>{bid['Notes']}</div>
                        </div>}
                        {bid['Products / Specs'] && <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)', marginBottom: 4 }}>Products</div>
                          <div style={{ fontSize: 13, color: '#334155' }}>{bid['Products / Specs']}</div>
                        </div>}
                      </div>
                      <div>
                        <button onClick={() => promoteBid(bid)} disabled={Boolean(promoting[bid['kID']])}
                          style={{ padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(15,118,110,0.28)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 12, fontWeight: 800, cursor: promoting[bid['kID']] ? 'not-allowed' : 'pointer' }}>
                          {promoting[bid['kID']] ? 'Promoting…' : 'Promote to Work Record'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '32px', textAlign: 'center', fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>No bids match your filters</div>
            )}
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', fontSize: 11, color: 'var(--bos-color-ink-tertiary)', background: 'rgba(248,250,252,0.5)' }}>
            Showing {filtered.length} of {bids.length} bids · Click any row to expand details
          </div>
        </div>
      )}

      {/* CARD VIEW — Hunter architecture, only active/filtered */}
      {viewMode === 'cards' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {filtered.slice(0, 20).map(bid => {
            const ds = getDecisionState(bid);
            const dStyle = DECISION_STYLES[ds];
            const days = daysUntil(bid['Due Date']);
            const urgent = days !== null && days <= 3 && days >= 0;
            const accent = urgent ? '#f97316' : ds === 'won' ? '#22c55e' : ds === 'lost' ? '#ef4444' : 'var(--bos-color-ink-tertiary)';
            const isExpanded = expandedCard === bid['kID'];

            return (
              <article key={bid['kID']} style={{ display: 'grid', gap: 14, padding: 18, borderRadius: 24,
                background: 'rgba(255,255,255,0.98)', border: urgent ? '1px solid rgba(249,115,22,0.22)' : '1px solid rgba(226,232,240,0.9)',
                boxShadow: '0 14px 30px rgba(15,23,42,0.06)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 6, background: accent }} />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 12px', justifyContent: 'space-between', paddingLeft: 4 }}>
                  <div style={{ display: 'grid', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--bos-color-ink-disabled)' }}>{bid['kID']}</span>
                      {PILL(ds, dStyle)}
                      {urgent && PILL(`Due in ${days}d`, { color: '#c2410c', bg: 'rgba(255,247,237,0.9)', border: '1px solid rgba(249,115,22,0.25)' })}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--color-ink-primary)', lineHeight: 1.1 }}>{bid['Job Name']}</h3>
                    <div style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                      {bid['Island'] && <span>{bid['Island']} · </span>}
                      {bid['Assigned To'] || 'Unassigned'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8, minWidth: 180, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.92)' }}>
                    {FL('Assign')}
                    <select value={getEff(bid,'Assigned To') || 'Unassigned'} onChange={e => setEff(bid['kID'],'Assigned To',e.target.value)}
                      style={{ fontSize: 12, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                      {ESTIMATORS.map(e => <option key={e}>{e}</option>)}
                    </select>
                    <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)' }}>{bid['Due Date'] ? `Due ${bid['Due Date']}` : 'No due date'}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, paddingLeft: 4 }}>
                  {[['Received', bid['Received Date'] || '—'], ['Due', bid['Due Date'] || '—'], ['GCs', bid['GC Count'] || '1'], ['Est. Value', bid['Est Value (High)'] || '—'], ['Products', bid['Products / Specs'] || '—']].map(([l,v]) => (
                    <div key={l}>{FL(l)}<div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)' }}>{v}</div></div>
                  ))}
                </div>

                <button onClick={() => setExpandedCard(isExpanded ? null : bid['kID'])}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--bos-color-brand-primary-deep)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', paddingLeft: 4 }}>
                  {isExpanded ? '↑ Less detail' : '↓ More detail'}
                </button>

                {isExpanded && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(220px,0.8fr)', gap: 12, paddingLeft: 4 }}>
                    <div style={{ padding: 14, borderRadius: 16, background: 'rgba(255,255,255,0.74)', border: '1px solid rgba(226,232,240,0.92)' }}>
                      {FL('Notes / Scope')}
                      <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>{bid['Notes'] || 'No notes.'}</div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 16, background: 'rgba(15,23,42,0.03)', border: '1px solid rgba(148,163,184,0.16)', display: 'grid', gap: 8 }}>
                      {FL('Decision state')}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {(['needs review','in estimating','submitted','won','lost','no bid'] as DecisionState[]).map(s => (
                          <button key={s} onClick={() => setEff(bid['kID'],'decisionState',s)}
                            style={{ padding: '4px 8px', borderRadius: 999, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                              border: ds === s ? `1px solid ${DECISION_STYLES[s].color}44` : '1px solid var(--color-surface-border)',
                              background: ds === s ? DECISION_STYLES[s].bg : 'white', color: ds === s ? DECISION_STYLES[s].color : 'var(--bos-color-ink-tertiary)' }}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => promoteBid(bid)} disabled={Boolean(promoting[bid['kID']])}
                        style={{ marginTop: 8, padding: '8px 12px', borderRadius: 12, border: '1px solid rgba(15,118,110,0.28)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', fontSize: 12, fontWeight: 800, cursor: promoting[bid['kID']] ? 'not-allowed' : 'pointer' }}>
                        {promoting[bid['kID']] ? 'Promoting…' : 'Promote to Work Record'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {filtered.length > 20 && (
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)', padding: '14px 20px', textAlign: 'center', fontSize: 13, color: 'var(--bos-color-ink-disabled)' }}>
              Showing 20 of {filtered.length} bids in card view. Use filters to narrow results or switch to Table view to see all.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
