'use client';
import { useState } from 'react';

type CronJob = {
  id: string;
  name: string;
  schedule: string;
  description: string;
  status: 'active' | 'paused' | 'error';
  lastRun: string | null;
  nextRun: string;
  category: 'field' | 'email' | 'reports' | 'system';
};

const INITIAL_JOBS: CronJob[] = [
  {
    id: 'cron-001',
    name: 'Daily Report Reminder',
    schedule: '3:30 PM daily',
    description: 'Check for missing daily reports. Email field lead if not submitted by 3:30 PM HST.',
    status: 'active',
    lastRun: '2026-03-31 15:30',
    nextRun: '2026-04-01 15:30',
    category: 'field',
  },
  {
    id: 'cron-002',
    name: 'Morning Briefing',
    schedule: '7:00 AM weekdays',
    description: 'Compile overnight field events, open issues, and schedule for the day. Send summary to Sean.',
    status: 'paused',
    lastRun: '2026-03-31 07:00',
    nextRun: '2026-04-01 07:00',
    category: 'reports',
  },
  {
    id: 'cron-003',
    name: 'Email Inbox Scan',
    schedule: 'Every 15 min',
    description: 'Scan Gmail for submittal approvals, RFI responses, procurement confirmations. Write events to spine.',
    status: 'paused',
    lastRun: null,
    nextRun: 'Awaiting setup',
    category: 'email',
  },
  {
    id: 'cron-004',
    name: 'Memory Maintenance',
    schedule: 'Sunday 9:00 PM',
    description: 'Review weekly session notes. Update MEMORY.md with durable facts. Archive stale entries.',
    status: 'active',
    lastRun: '2026-03-29 21:00',
    nextRun: '2026-04-05 21:00',
    category: 'system',
  },
  {
    id: 'cron-005',
    name: 'Cost Alert',
    schedule: 'Daily 11:59 PM',
    description: 'Check daily API token spend. Alert Sean via Telegram if daily cost exceeds $10.',
    status: 'active',
    lastRun: '2026-03-30 23:59',
    nextRun: '2026-03-31 23:59',
    category: 'system',
  },
];

const CAT_STYLE: Record<string, string> = {
  field: 'bg-teal-50 text-teal-700',
  email: 'bg-blue-50 text-blue-700',
  reports: 'bg-amber-50 text-amber-600',
  system: 'bg-surface text-ink-label',
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-teal-50 text-teal-700',
  paused: 'bg-amber-50 text-amber-600',
  error: 'bg-red-50 text-red-700',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-teal-500',
  paused: 'bg-amber-400',
  error: 'bg-red-500',
};

export default function CronPanel() {
  const [jobs, setJobs] = useState<CronJob[]>(INITIAL_JOBS);
  const [showNew, setShowNew] = useState(false);
  const [newJob, setNewJob] = useState({ name: '', schedule: '', description: '', category: 'system' as CronJob['category'] });

  function toggleStatus(id: string) {
    setJobs(prev => prev.map(j => j.id === id
      ? { ...j, status: j.status === 'active' ? 'paused' : 'active' }
      : j
    ));
  }

  function addJob() {
    if (!newJob.name || !newJob.schedule) return;
    setJobs(prev => [...prev, {
      id: `cron-${Date.now()}`,
      name: newJob.name,
      schedule: newJob.schedule,
      description: newJob.description,
      status: 'paused',
      lastRun: null,
      nextRun: 'Scheduled',
      category: newJob.category,
    }]);
    setNewJob({ name: '', schedule: '', description: '', category: 'system' });
    setShowNew(false);
  }

  const active = jobs.filter(j => j.status === 'active');

  const inputStyle = "w-full rounded-xl border border-surface-border text-[13px] text-ink-primary px-3 py-2 outline-none focus:border-teal-500 transition-colors bg-white";

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="label-upper text-ink-meta mb-1">AI Command</div>
          <h1 className="text-[30px] font-extrabold text-ink-heading tracking-tight m-0">Cron &amp; Workflows</h1>
          <p className="text-ink-label text-sm mt-1">{active.length} active · {jobs.length} total scheduled tasks</p>
        </div>
        <button
          onClick={() => setShowNew(v => !v)}
          className="px-4 py-2 rounded-xl text-[13px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100 transition-colors"
        >
          + New Task
        </button>
      </div>

      {/* New job form */}
      {showNew && (
        <div className="card p-6 mb-6">
          <div className="label-upper text-ink-meta mb-4">New Scheduled Task</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[11px] font-bold text-ink-label block mb-1">Task Name</label>
              <input className={inputStyle} placeholder="e.g. Weekly Budget Summary" value={newJob.name} onChange={e => setNewJob(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-label block mb-1">Schedule</label>
              <input className={inputStyle} placeholder="e.g. Every Monday 8:00 AM" value={newJob.schedule} onChange={e => setNewJob(p => ({ ...p, schedule: e.target.value }))} />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-[11px] font-bold text-ink-label block mb-1">Description / Instructions for Kai</label>
            <textarea className={`${inputStyle} resize-none`} rows={3} placeholder="What should Kai do when this runs?" value={newJob.description} onChange={e => setNewJob(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {(['field','email','reports','system'] as const).map(cat => (
                <button key={cat} onClick={() => setNewJob(p => ({ ...p, category: cat }))}
                  className={`pill capitalize transition-colors ${newJob.category === cat ? CAT_STYLE[cat] : 'bg-surface text-ink-meta'}`}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-xl text-[12px] font-bold text-ink-label hover:bg-surface transition-colors">Cancel</button>
              <button onClick={addJob} className="px-4 py-2 rounded-xl text-[12px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-100 transition-colors">Save Task</button>
            </div>
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="flex flex-col gap-3">
        {jobs.map(job => (
          <div key={job.id} className="card p-5">
            <div className="flex items-start gap-4">
              <div className="flex flex-col gap-1.5 shrink-0 pt-0.5">
                <span className={`pill ${CAT_STYLE[job.category]}`}>{job.category}</span>
                <div className="flex items-center gap-1.5 pl-1">
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[job.status]}`} />
                  <span className="text-[11px] font-bold text-ink-label capitalize">{job.status}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-extrabold text-ink-heading mb-0.5">{job.name}</div>
                <div className="text-[12px] font-bold text-ink-label mb-1">{job.schedule}</div>
                <p className="text-[13px] text-ink-body m-0 leading-snug">{job.description}</p>
                <div className="flex gap-4 mt-2">
                  <span className="text-[11px] text-ink-meta">Last run: <strong className="text-ink-secondary">{job.lastRun || 'Never'}</strong></span>
                  <span className="text-[11px] text-ink-meta">Next: <strong className="text-ink-secondary">{job.nextRun}</strong></span>
                </div>
              </div>
              <button
                onClick={() => toggleStatus(job.id)}
                className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold border transition-colors ${
                  job.status === 'active'
                    ? 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'
                    : 'bg-teal-50 text-teal-700 border-teal-100 hover:bg-teal-100'
                }`}
              >
                {job.status === 'active' ? 'Pause' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
