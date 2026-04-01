import { CREW } from '@/lib/data';

export default function CrewPanel() {
  const management = CREW.filter(c => c.type === 'management');
  const field = CREW.filter(c => c.type === 'field');

  const Avatar = ({ name, color }: { name: string; color: string }) => (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0, letterSpacing: '-0.02em' }}>
      {name.split(' ').map(n => n[0]).join('').slice(0,2)}
    </div>
  );

  const Card = ({ c, color }: { c: typeof CREW[0]; color: string }) => (
    <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}>
      <Avatar name={c.name} color={color} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{c.role}</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>People</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Crew</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{CREW.length} people · Kula Glass Company</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Total crew', value: CREW.length, helper: 'All islands' },
          { label: 'Management', value: management.length, helper: 'Office & PM team' },
          { label: 'Field crew', value: field.length, helper: 'Journeymen on Oahu' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Office & Management</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
        {management.map(c => <Card key={c.id} c={c} color="#1d4ed8" />)}
      </div>

      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Field Crew — Oahu</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {field.map(c => <Card key={c.id} c={c} color="#0f766e" />)}
      </div>
    </div>
  );
}
