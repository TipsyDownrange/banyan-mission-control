import { PROJECTS, ISSUES, EVENTS, ISLAND_EMOJI } from '@/lib/data';

export default function OverviewPanel() {
  const activeProjects = PROJECTS.filter(p => p.status === 'active').length;
  const openIssues = ISSUES.filter(i => i.status === 'OPEN').length;
  const blockingIssues = ISSUES.filter(i => i.blocking && i.status === 'OPEN').length;
  const recentEvents = EVENTS.slice(0, 3);

  const stats = [
    { label: 'Active Projects', value: activeProjects, color: 'text-teal-700', bg: 'bg-teal-50' },
    { label: 'Open Issues', value: openIssues, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Blocking', value: blockingIssues, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Field Events Today', value: 3, color: 'text-blue-700', bg: 'bg-blue-50' },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">Operations</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Overview</h1>
        <p className="text-ink-label text-sm mt-1">Tuesday, March 31 · Kula Glass Company</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className={`card p-5 ${s.bg}`}>
            <div className={`text-[34px] font-extrabold ${s.color} leading-none mb-1`}>{s.value}</div>
            <div className="label-upper text-ink-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Active Projects */}
        <div className="card p-6">
          <div className="label-upper text-ink-meta mb-4">Active Projects</div>
          <div className="flex flex-col gap-3">
            {PROJECTS.filter(p => p.kID.startsWith('PRJ')).map(p => {
              const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
              return (
                <div key={p.kID} className="flex items-center gap-3">
                  <span className="text-lg">{ISLAND_EMOJI[p.island]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-ink-heading truncate">{p.name}</span>
                      <span className="text-[11px] text-ink-meta ml-2 shrink-0">{p.pm}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-border rounded-pill overflow-hidden">
                        <div
                          className={`h-full rounded-pill ${pct > 90 ? 'bg-orange-500' : 'bg-teal-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-ink-meta shrink-0">{pct}%</span>
                    </div>
                  </div>
                  {p.issues > 0 && (
                    <span className="pill bg-orange-50 text-orange-600">{p.issues}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-6">
          <div className="label-upper text-ink-meta mb-4">Recent Field Activity</div>
          <div className="flex flex-col gap-4">
            {recentEvents.map(e => (
              <div key={e.id} className="flex gap-3">
                <div
                  className="w-1.5 shrink-0 rounded-pill mt-1"
                  style={{
                    height: 'auto',
                    minHeight: 32,
                    background: e.type === 'FIELD_ISSUE' ? '#f97316' : e.type === 'INSTALL_STEP' ? '#14b8a6' : '#1d4ed8',
                    opacity: 0.5,
                  }}
                />
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-bold text-ink-heading">{e.user}</span>
                    <span className="text-[11px] text-ink-meta">·</span>
                    <span className="text-[11px] text-ink-meta">{e.projectName}</span>
                  </div>
                  <p className="text-[13px] text-ink-body m-0 leading-snug">{e.note}</p>
                  <div className="text-[11px] text-ink-meta mt-1">{e.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Open Issues */}
        <div className="card p-6 col-span-2">
          <div className="label-upper text-ink-meta mb-4">Open Issues</div>
          <div className="flex flex-col gap-2">
            {ISSUES.map(issue => (
              <div
                key={issue.id}
                className="flex items-start gap-4 p-4 rounded-xl border border-surface-border bg-surface-soft"
              >
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className={`pill ${issue.severity === 'HIGH' ? 'bg-red-50 text-red-700' : issue.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-surface text-ink-label'}`}>
                    {issue.severity}
                  </span>
                  {issue.blocking && (
                    <span className="pill bg-orange-50 text-orange-600">BLOCKING</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-heading mb-0.5">{issue.kID}</div>
                  <div className="text-[13px] text-ink-body">{issue.description}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-ink-meta">Assigned to</div>
                  <div className="text-[13px] font-bold text-ink-secondary">{issue.assignedTo}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
