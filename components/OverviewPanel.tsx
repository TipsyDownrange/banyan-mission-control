import { PROJECTS, ISSUES, EVENTS, ISLAND_EMOJI } from '@/lib/data';

export default function OverviewPanel() {
  const activeProjects = PROJECTS.filter(p => p.status === 'active' && p.kID.startsWith('PRJ')).length;
  const openIssues = ISSUES.filter(i => i.status === 'OPEN').length;
  const blockingIssues = ISSUES.filter(i => i.blocking && i.status === 'OPEN').length;

  const stats = [
    { label: 'Active projects', value: activeProjects, helper: 'Across all islands' },
    { label: 'Open issues', value: openIssues, helper: 'Requiring attention' },
    { label: 'Blocking', value: blockingIssues, helper: 'Stopping work right now' },
    { label: 'Field events today', value: 3, helper: 'Logged by crew' },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Overview</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Wednesday, April 1 · Kula Glass Company</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.92) 50%, rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: 34, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{s.helper}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Active Projects */}
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Active Projects</div>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            {PROJECTS.filter(p => p.kID.startsWith('PRJ')).map(p => {
              const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
              return (
                <div key={p.kID} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{ISLAND_EMOJI[p.island]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.pm}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? '#f97316' : '#14b8a6', borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{pct}%</span>
                    </div>
                  </div>
                  {p.issues > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#c2410c', background: '#fff7ed', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(194,65,12,0.15)', flexShrink: 0 }}>
                      {p.issues}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Recent Activity */}
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Recent Field Activity</div>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              {EVENTS.slice(0, 3).map(e => (
                <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12 }}>
                  <div style={{ width: 3, borderRadius: 4, background: e.type === 'FIELD_ISSUE' ? '#f97316' : e.type === 'INSTALL_STEP' ? '#14b8a6' : '#1d4ed8', flexShrink: 0, alignSelf: 'stretch', minHeight: 32 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 1 }}>{e.user} · <span style={{ color: '#64748b', fontWeight: 500 }}>{e.projectName}</span></div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{e.note}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{e.timestamp}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Open Issues */}
          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Open Issues</div>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              {ISSUES.map(i => (
                <div key={i.id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: i.severity === 'HIGH' ? '#b91c1c' : i.severity === 'MEDIUM' ? '#92400e' : '#475569', background: i.severity === 'HIGH' ? '#fef2f2' : i.severity === 'MEDIUM' ? '#fffbeb' : '#f8fafc', padding: '2px 8px', borderRadius: 999 }}>
                      {i.severity}
                    </span>
                    {i.blocking && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c2410c', background: '#fff7ed', padding: '2px 8px', borderRadius: 999 }}>BLOCKING</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{i.kID}</div>
                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{i.description}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>→ {i.assignedTo}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
