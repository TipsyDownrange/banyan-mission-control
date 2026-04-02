'use client';
import { useState } from 'react';

type ApprovalItem = {
  id: string;
  ts: string;
  action: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'denied';
  source: string;
};

const MOCK_APPROVALS: ApprovalItem[] = [
  {
    id: 'APR-001',
    ts: '2026-03-31 11:42',
    action: 'Send daily report email',
    detail: 'Email daily report PDF to Frank (frank@kulaglass.com) for Hokuala Hotel — Thomas Begonia submitted.',
    risk: 'low',
    status: 'pending',
    source: 'Daily Report Cron',
  },
  {
    id: 'APR-002',
    ts: '2026-03-31 10:15',
    action: 'Write to Google Drive',
    detail: 'Save 2026-03-31_Hokuala_DailyReport_ThomasBegonia.pdf to Active Projects / PRJ-26-0001 / Field Reports.',
    risk: 'low',
    status: 'pending',
    source: 'Field Capture App',
  },
  {
    id: 'APR-003',
    ts: '2026-03-31 09:30',
    action: 'Update Google Sheet row',
    detail: 'Mark Field Issue ISS-002 as RESOLVED in Field_Events_V1. Triggered by Nate via field app.',
    risk: 'medium',
    status: 'pending',
    source: 'Field App',
  },
  {
    id: 'APR-004',
    ts: '2026-03-30 16:55',
    action: 'Send reminder email',
    detail: 'Email Thomas Begonia (thomas@kulaglass.com): "Daily report not submitted for Hokuala Hotel. Please submit by 3:30 PM."',
    risk: 'low',
    status: 'approved',
    source: 'Daily Report Cron',
  },
];

type ApprovalItemWithComment = ApprovalItem & { comment?: string };

const RISK_STYLE: Record<string, string> = {
  low: 'bg-teal-50 text-teal-700',
  medium: 'bg-amber-50 text-amber-600',
  high: 'bg-red-50 text-red-700',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-50 text-orange-600',
  approved: 'bg-teal-50 text-teal-700',
  denied: 'bg-red-50 text-red-700',
};

export default function ApprovalsPanel() {
  const [items, setItems] = useState<ApprovalItemWithComment[]>(MOCK_APPROVALS);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function act(id: string, status: 'approved' | 'denied') {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status, comment: comments[id] || undefined } : i));
  }

  const pending = items.filter(i => i.status === 'pending');
  const resolved = items.filter(i => i.status !== 'pending');

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="label-upper text-ink-meta mb-1">AI Command</div>
        <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Approvals</h1>
        <p className="text-ink-label text-sm mt-1">Kai routes sensitive actions here before executing</p>
      </div>

      {pending.length > 0 && (
        <div className="mb-8">
          <div className="label-upper text-orange-600 mb-3">{pending.length} Pending</div>
          <div className="flex flex-col gap-3">
            {pending.map(item => (
              <div key={item.id} className="card p-5">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                    <span className={`pill ${RISK_STYLE[item.risk]}`}>{item.risk} risk</span>
                    <span className="pill bg-surface text-ink-meta">{item.source}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold text-ink-heading mb-1">{item.action}</div>
                    <p className="text-[13px] text-ink-body m-0 leading-snug">{item.detail}</p>
                    <div className="text-[11px] text-ink-meta mt-2">{item.ts} · {item.id}</div>

                    {/* Comment toggle */}
                    <button
                      onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="mt-3 text-[12px] font-bold text-ink-label hover:text-ink-secondary transition-colors"
                    >
                      {expanded[item.id] ? '↑ Hide comment' : '+ Add comment or instructions'}
                    </button>

                    {expanded[item.id] && (
                      <div className="mt-2">
                        <textarea
                          value={comments[item.id] || ''}
                          onChange={e => setComments(prev => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Add instructions, modifications, or notes for Kai..."
                          rows={3}
                          className="w-full rounded-xl border border-surface-border text-[13px] text-ink-primary px-3 py-2 outline-none resize-none focus:border-teal-500 transition-colors"
                          style={{ background: '#f9fbfc' }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => act(item.id, 'approved')}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(item.id, 'denied')}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="card p-8 flex flex-col items-center text-center mb-8">
          <div className="text-4xl mb-3"></div>
          <div className="font-extrabold text-ink-heading mb-1">All clear</div>
          <p className="text-ink-label text-sm">No pending actions. Kai will route sensitive operations here for your approval.</p>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <div className="label-upper text-ink-meta mb-3">Recent</div>
          <div className="card divide-y divide-surface-border">
            {resolved.map(item => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                <span className={`pill shrink-0 ${STATUS_STYLE[item.status]}`}>{item.status}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-ink-heading truncate">{item.action}</div>
                  <div className="text-[11px] text-ink-meta">{item.ts} · {item.source}</div>
                  {item.comment && (
                    <div className="text-[12px] text-ink-body mt-0.5 italic">"{item.comment}"</div>
                  )}
                </div>
                <span className={`pill shrink-0 ${RISK_STYLE[item.risk]}`}>{item.risk}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
