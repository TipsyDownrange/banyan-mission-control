import { BIDS } from '@/lib/data';

const STATUS_COLOR: Record<string, string> = {
  'In Progress': 'bg-blue-50 text-blue-700',
  'Site Visit Needed': 'bg-amber-50 text-amber-600',
  'Proposal Sent': 'bg-teal-50 text-teal-700',
  'Takeoff In Progress': 'bg-orange-50 text-orange-600',
};

export default function BidQueuePanel() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">Estimating</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Bid Queue</h1>
        <p className="text-ink-label text-sm mt-1">{BIDS.length} active bids</p>
      </div>
      <div className="card divide-y divide-surface-border">
        {BIDS.map(bid => (
          <div key={bid.id} className="flex items-center gap-5 px-6 py-5 hover:bg-surface-soft transition-colors">
            <div className="w-36 shrink-0">
              <div className="text-[11px] font-mono text-ink-meta">{bid.id}</div>
              <div className="text-sm font-extrabold text-ink-heading leading-tight">{bid.name}</div>
            </div>
            <span className={`pill shrink-0 ${STATUS_COLOR[bid.status] ?? 'bg-surface text-ink-label'}`}>{bid.status}</span>
            <div className="flex-1 text-[13px] text-ink-label">{bid.client}</div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-ink-meta">Due</div>
              <div className="text-sm font-bold text-ink-secondary">{bid.due}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] text-ink-meta">Assigned</div>
              <div className="text-sm font-bold text-ink-secondary">{bid.assignedTo}</div>
            </div>
            {bid.value && (
              <div className="text-right shrink-0">
                <div className="text-[11px] text-ink-meta">Value</div>
                <div className="text-sm font-bold text-teal-700">${bid.value.toLocaleString()}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
