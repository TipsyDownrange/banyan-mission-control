import { ISSUES } from '@/lib/data';

export default function IssuesPanel() {
  const open = ISSUES.filter(i => i.status === 'OPEN');
  const blocking = open.filter(i => i.blocking);
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">Operations</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Issues</h1>
        <div className="flex gap-3 mt-2">
          <span className="pill bg-orange-50 text-orange-600">{open.length} Open</span>
          {blocking.length > 0 && <span className="pill bg-red-50 text-red-700">{blocking.length} Blocking</span>}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {open.map(issue => (
          <div key={issue.id} className="card p-5">
            <div className="flex items-start gap-4">
              <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                <span className={`pill ${issue.severity === 'HIGH' ? 'bg-red-50 text-red-700' : issue.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-surface text-ink-label'}`}>
                  {issue.severity}
                </span>
                {issue.blocking && <span className="pill bg-orange-50 text-orange-600">BLOCKING</span>}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono text-ink-meta">{issue.id}</span>
                  <span className="text-ink-meta">·</span>
                  <span className="text-sm font-bold text-ink-heading">{issue.kID}</span>
                </div>
                <p className="text-[14px] text-ink-body m-0 leading-snug">{issue.description}</p>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-[11px] text-ink-meta">Assigned → <strong className="text-ink-secondary">{issue.assignedTo}</strong></span>
                  <span className="text-[11px] text-ink-meta">·</span>
                  <span className="text-[11px] text-ink-meta">Opened {issue.createdAt}</span>
                </div>
              </div>
              <button className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors border border-teal-100">
                Resolve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
