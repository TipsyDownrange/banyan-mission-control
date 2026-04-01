import { PROJECTS, ISLAND_EMOJI } from '@/lib/data';

const PHASE_COLOR: Record<string, { color: string; bg: string }> = {
  'Installation':  { color: '#0f766e', bg: '#f0fdfa' },
  'QA / Closeout': { color: '#1d4ed8', bg: '#eff6ff' },
  'Submittal':     { color: '#92400e', bg: '#fffbeb' },
  'Procurement':   { color: '#c2410c', bg: '#fff7ed' },
  'Service':       { color: '#475569', bg: '#f8fafc' },
};

export default function ProjectsPanel() {
  const active = PROJECTS.filter(p => p.kID.startsWith('PRJ'));

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Projects</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Active Projects</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{active.length} jobs · All islands</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Active jobs', value: active.length, helper: 'Contract work in progress' },
          { label: 'Open issues', value: PROJECTS.reduce((s,p) => s+p.issues,0), helper: 'Across all projects' },
          { label: 'Islands', value: [...new Set(PROJECTS.map(p=>p.island))].length, helper: 'Oahu, Maui, Kauai, Hawaii' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* Project cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.map(p => {
          const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : null;
          const phase = PHASE_COLOR[p.phase] || PHASE_COLOR['Service'];
          return (
            <div key={p.kID} style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{ISLAND_EMOJI[p.island]}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{p.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: phase.color, background: phase.bg, padding: '3px 9px', borderRadius: 999 }}>
                      {p.phase}
                    </span>
                    {p.issues > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', background: '#fff7ed', padding: '3px 9px', borderRadius: 999 }}>
                        {p.issues} issue{p.issues > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: pct !== null ? 8 : 0 }}>
                    {p.kID} · {p.island} · PM: {p.pm}
                  </div>
                  {pct !== null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? '#f97316' : '#14b8a6', borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, fontWeight: 700 }}>{pct}% spent</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
