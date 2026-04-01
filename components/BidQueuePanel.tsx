'use client';
import { useEffect, useState } from 'react';

type Bid = {
  kID: string;
  'Job Name': string;
  Island: string;
  'Assigned To': string;
  Status: string;
  'Due Date': string;
  'Received Date': string;
  'Products / Specs': string;
  'GC Count': string;
  'Est Value (High)': string;
  'Win / Loss': string;
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  'Assigned':    { color: '#1d4ed8', bg: '#eff6ff' },
  'Submitted':   { color: '#0f766e', bg: '#f0fdfa' },
  'Won':         { color: '#15803d', bg: '#f0fdf4' },
  'Lost':        { color: '#b91c1c', bg: '#fef2f2' },
  'No Bid':      { color: '#64748b', bg: '#f8fafc' },
  'In Progress': { color: '#0369a1', bg: '#eff6ff' },
};

export default function BidQueuePanel() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    fetch('/api/bids?limit=100')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setBids(d.bids || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const active = bids.filter(b => !['Won','Lost','No Bid'].includes(b.Status));
  const submitted = bids.filter(b => b.Status === 'Submitted');
  const won = bids.filter(b => b['Win / Loss'] === 'Won');
  const displayed = filter === 'active' ? active : filter === 'submitted' ? submitted : filter === 'won' ? won : bids.slice(0, 50);

  const daysUntil = (date: string) => {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  };

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Estimating</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Bid Queue</h1>
          <div style={{ fontSize: 12, color: '#94a3b8', paddingBottom: 4 }}>Live · BanyanOS Bid Log</div>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24,
          padding: 18, borderRadius: 24,
          background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
          border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          {[
            { label: 'Active bids', value: active.length, helper: 'In progress' },
            { label: 'Submitted', value: submitted.length, helper: 'Awaiting decision' },
            { label: 'Won this year', value: won.length, helper: 'Converted to jobs' },
            { label: 'Total in log', value: bids.length, helper: 'All time' },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
              <div style={{ marginTop: 6, fontSize: 32, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
              <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[['active','Active'],['submitted','Submitted'],['won','Won'],['all','All']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              border: `1px solid ${filter === k ? 'rgba(15,118,110,0.3)' : '#e2e8f0'}`,
              background: filter === k ? '#f0fdfa' : 'white',
              color: filter === k ? '#0f766e' : '#64748b', cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ background: 'white', borderRadius: 20, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading live bid data...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 13, color: '#b91c1c', fontWeight: 700 }}>Error loading bids</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayed.map(bid => {
            const st = STATUS_STYLE[bid.Status] || STATUS_STYLE['No Bid'];
            const days = daysUntil(bid['Due Date']);
            const urgent = days !== null && days <= 3 && days >= 0;
            return (
              <div key={bid.kID} style={{ background: 'white', borderRadius: 20, border: `1px solid ${urgent ? 'rgba(249,115,22,0.2)' : '#e2e8f0'}`, boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 3, borderRadius: 4, background: urgent ? '#f97316' : st.color, alignSelf: 'stretch', flexShrink: 0, minHeight: 40, opacity: 0.8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: st.color, background: st.bg, padding: '3px 9px', borderRadius: 999 }}>
                        {bid.Status || 'Unassigned'}
                      </span>
                      {urgent && <span style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', background: '#fff7ed', padding: '3px 9px', borderRadius: 999 }}>Due in {days}d</span>}
                      {bid['Win / Loss'] === 'Won' && <span style={{ fontSize: 10, fontWeight: 800, color: '#15803d', background: '#f0fdf4', padding: '3px 9px', borderRadius: 999 }}>✓ Won</span>}
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>{bid.kID}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 4 }}>{bid['Job Name']}</div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                      {bid.Island && <span>{bid.Island}</span>}
                      {bid['Due Date'] && <span>Due <strong style={{ color: '#334155' }}>{bid['Due Date']}</strong></span>}
                      {bid['Assigned To'] && <span>→ <strong style={{ color: '#334155' }}>{bid['Assigned To']}</strong></span>}
                      {bid['GC Count'] && bid['GC Count'] !== '0' && <span>{bid['GC Count']} GC{parseInt(bid['GC Count']) > 1 ? 's' : ''}</span>}
                      {bid['Est Value (High)'] && <span style={{ color: '#0f766e', fontWeight: 700 }}>{bid['Est Value (High)']}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {displayed.length === 0 && (
            <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No bids in this category</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
