import { PROJECTS } from '@/lib/data';

export default function SchedulesPanel() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">Projects</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Schedules</h1>
        <p className="text-ink-label text-sm mt-1">Construction schedule tracking — Phase 1 placeholder</p>
      </div>
      <div className="card p-8 flex flex-col items-center justify-center text-center" style={{ minHeight: 300 }}>
        <div className="text-4xl mb-4">📅</div>
        <div className="text-lg font-extrabold text-ink-heading mb-2">Coming in Phase 2</div>
        <p className="text-ink-label text-sm max-w-md">
          Construction schedules, Gantt views, and milestone tracking will replace Smartsheet schedules here.
          Data will pull from the Activity Spine and connected project records.
        </p>
      </div>
    </div>
  );
}
