import { BIDS } from '@/lib/data';

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  'In Progress':          { color: '#1d4ed8', bg: '#eff6ff' },
  'Site Visit Needed':    { color: '#92400e', bg: '#fffbeb' },
  'Proposal Sent':        { color: '#0f766e', bg: '#f0fdfa' },
  'Takeoff In Progress':  { color: '#c2410c', bg: '#fff7ed' },
};

export default function BidQueuePanel() {
  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Estimating</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Bid Queue</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{BIDS.length} active bids in progress</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Active bids', value: BIDS.length, helper: 'In various stages' },
          { label: 'Due this week', value: BIDS.filter(b => b.due <= '2026-04-07').length, helper: 'Needs immediate attention' },
          { label: 'Proposals sent', value: BIDS.filter(b => b.status === 'Proposal Sent').length, helper: 'Awaiting client response' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {BIDS.map(bid => {
          const st = STATUS_STYLE[bid.status] || { color: '#475569', bg: '#f8fafc' };
          const daysUntilDue = Math.ceil((new Date(bid.due).getTime() - Date.now()) / 86400000);
          const urgent = daysUntilDue <= 3;
          return (
            <div key={bid.id} style={{ background: 'white', borderRadius: 20, border: `1px solid ${urgent ? 'rgba(249,115,22,0.2)' : '#e2e8f0'}`, boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 3, borderRadius: 4, background: urgent ? '#f97316' : '#e2e8f0', alignSelf: 'stretch', flexShrink: 0, minHeight: 40 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: st.color, background: st.bg, padding: '3px 9px', borderRadius: 999 }}>
                      {bid.status}
                    </span>
                    {urgent && <span style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', background: '#fff7ed', padding: '3px 9px', borderRadius: 999 }}>Due soon</span>}
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94a3b8' }}>{bid.id}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 4 }}>{bid.name}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                    <span>{bid.client}</span>
                    <span>Due <strong style={{ color: '#334155' }}>{bid.due}</strong></span>
                    <span>→ <strong style={{ color: '#334155' }}>{bid.assignedTo}</strong></span>
                    {bid.value && <span style={{ color: '#0f766e', fontWeight: 700 }}>${bid.value.toLocaleString()}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
