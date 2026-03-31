import { PROJECTS, ISLAND_EMOJI } from '@/lib/data';

const PHASE_COLOR: Record<string, string> = {
  'Installation': 'bg-teal-50 text-teal-700',
  'QA / Closeout': 'bg-blue-50 text-blue-700',
  'Submittal': 'bg-amber-50 text-amber-600',
  'Procurement': 'bg-orange-50 text-orange-600',
  'Service': 'bg-surface text-ink-label',
};

export default function ProjectsPanel() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">Projects</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Active Projects</h1>
        <p className="text-ink-label text-sm mt-1">{PROJECTS.length} jobs · All islands</p>
      </div>
      <div className="card divide-y divide-surface-border">
        {PROJECTS.map(p => {
          const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : null;
          return (
            <div key={p.kID} className="flex items-center gap-5 px-6 py-5 hover:bg-surface-soft transition-colors">
              <span className="text-2xl">{ISLAND_EMOJI[p.island]}</span>
              <div className="w-36 shrink-0">
                <div className="text-[11px] font-mono text-ink-meta">{p.kID}</div>
                <div className="text-sm font-extrabold text-ink-heading leading-tight">{p.name}</div>
              </div>
              <span className={`pill shrink-0 ${PHASE_COLOR[p.phase] ?? 'bg-surface text-ink-label'}`}>{p.phase}</span>
              <div className="flex-1 min-w-0">
                {pct !== null && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-border rounded-pill overflow-hidden">
                      <div
                        className={`h-full rounded-pill ${pct > 90 ? 'bg-orange-500' : 'bg-teal-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-ink-meta shrink-0">{pct}% spent</span>
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-ink-meta">PM</div>
                <div className="text-sm font-bold text-ink-secondary">{p.pm}</div>
              </div>
              {p.issues > 0 && (
                <span className="pill bg-orange-50 text-orange-600 shrink-0">{p.issues} issue{p.issues > 1 ? 's' : ''}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
