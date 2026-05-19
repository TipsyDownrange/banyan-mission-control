'use client';
/**
 * BAN-344 PM-V1.0-E — My Open Actions cross-project view.
 *
 * Renders every action_items row assigned to the given user across the
 * tenant.  Lives on the user dashboard so PMs and supers can see "23 open
 * action items across 8 projects" at a glance.  Drills back into the
 * source entity via the Linked Source link.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

type Row = {
  action_item_id: string;
  engagement_id: string | null;
  source_event_type: string;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  action_required: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  kid: string | null;
};

type ApiResponse = {
  items: Row[];
  total: number;
  project_count: number;
};

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function dueRank(it: Row): number {
  if (!it.due_date) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(it.due_date);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(it: Row): boolean {
  if (!it.due_date) return false;
  if (it.status !== 'OPEN' && it.status !== 'IN_PROGRESS') return false;
  return it.due_date < new Date().toISOString().slice(0, 10);
}

export default function MyOpenActionsPanel({ userId, userName }: { userId: string; userName?: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/action-items/by-assignee/${encodeURIComponent(userId)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const sorted = useMemo(() => {
    const items = data?.items ?? [];
    return [...items].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 5;
      const pb = PRIORITY_RANK[b.priority] ?? 5;
      if (pa !== pb) return pa - pb;
      return dueRank(a) - dueRank(b);
    });
  }, [data]);

  if (loading) return <div style={{ padding: 24, color: '#64748b' }}>Loading open actions...</div>;
  if (err) return <div style={{ padding: 24, color: '#b91c1c' }}>Failed to load: {err}</div>;

  const total = data?.total ?? 0;
  const projects = data?.project_count ?? 0;

  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>My Open Actions</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
            {userName ? `${userName.split(' ')[0]}'s ` : ''}{total} open {total === 1 ? 'action' : 'actions'} {projects > 0 && <span style={{ fontSize: 14, color: '#64748b', fontWeight: 700 }}>across {projects} {projects === 1 ? 'project' : 'projects'}</span>}
          </div>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>Nothing assigned right now. Good.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map((it) => {
            const overdue = isOverdue(it);
            return (
              <div key={it.action_item_id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 110px', gap: 10, alignItems: 'center', padding: '10px 12px', background: overdue ? '#fef2f2' : '#f8fafc', borderRadius: 10, border: overdue ? '1px solid #fca5a5' : '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>{it.kid ?? '—'}</div>
                <div style={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#475569' }}>{it.priority}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: overdue ? '#b91c1c' : '#334155' }}>{it.due_date ? `Due ${formatDate(it.due_date)}` : 'No due'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
