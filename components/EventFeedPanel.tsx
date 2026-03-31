import { EVENTS, EVENT_TYPE_COLOR } from '@/lib/data';

export default function EventFeedPanel() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">Operations</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Event Feed</h1>
        <p className="text-ink-label text-sm mt-1">All field activity — immutable spine</p>
      </div>
      <div className="card divide-y divide-surface-border">
        {EVENTS.map(e => (
          <div key={e.id} className="flex items-start gap-4 p-5 hover:bg-surface-soft transition-colors">
            <span className={`pill mt-0.5 shrink-0 ${EVENT_TYPE_COLOR[e.type] ?? 'bg-surface text-ink-label'}`}>
              {e.type.replace('_', ' ')}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-ink-heading">{e.user}</span>
                <span className="text-ink-meta">·</span>
                <span className="text-sm text-ink-label">{e.projectName}</span>
                <span className="text-[11px] font-mono text-ink-meta ml-auto">{e.id}</span>
              </div>
              <p className="text-[13px] text-ink-body m-0 leading-snug">{e.note}</p>
            </div>
            <div className="text-[11px] text-ink-meta shrink-0 whitespace-nowrap">{e.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
