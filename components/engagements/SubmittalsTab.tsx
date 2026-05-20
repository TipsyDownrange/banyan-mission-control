'use client';
/**
 * BAN-340 PM-V1.0-A — Submittal Log surface v1 for the PM ProjectsPanel
 * `submittals` tab. Replaces the prior read-only stub.
 *
 * - Row list with status, type, CSI section, ball-in-court, required-by-date,
 *   days-until-due (computed).
 * - Filters by status (multi-select), type, ball-in-court; overdue toggle.
 * - Sort by required_by_date asc default, user-selectable.
 * - Search across submittal_number, description, CSI section.
 * - Contextual Document Surfacing chip strip per row.
 * - "+ New Submittal" wizard launches SubmittalCreateWizard.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import SubmittalCreateWizard from './SubmittalCreateWizard';
import SubmittalDetailDrawer from './SubmittalDetailDrawer';

type SubmittalRow = {
  submittal_id: string;
  submittal_number: string;
  display_label: string | null;
  csi_division: string | null;
  csi_spec_section: string;
  csi_subsection: string;
  csi_sub_subsection: string;
  submittal_type: 'ACTION' | 'PHYSICAL' | 'CLOSEOUT';
  description: string | null;
  status: string;
  required_by_date: string | null;
  submitted_to: string | null;
  submitted_date: string | null;
  ball_in_court: string | null;
  submitted_documents: string[];
  review_comments_documents: string[];
  approved_documents: string[];
  spec_document_ref: string | null;
};

type ApiResponse = {
  kIDFound: boolean;
  engagement: { engagement_id: string; kid: string } | null;
  items: SubmittalRow[];
  summary: {
    total: number;
    by_status: Record<string, number>;
    outstanding: number;
    engagement_in_closeout: boolean;
  };
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  REQUIRED: { bg: '#f8fafc', color: 'var(--bos-color-ink-disabled)' },
  IN_PROGRESS: { bg: '#fff7ed', color: '#9a3412' },
  SUBMITTED: { bg: '#eff6ff', color: '#1d4ed8' },
  UNDER_REVIEW: { bg: '#eff6ff', color: '#1d4ed8' },
  APPROVED: { bg: '#f0fdfa', color: 'var(--bos-color-brand-primary-deep)' },
  APPROVED_AS_NOTED: { bg: '#f0fdfa', color: '#15803d' },
  REVISE_RESUBMIT: { bg: '#fffbeb', color: '#92400e' },
  REJECTED: { bg: '#fef2f2', color: '#b91c1c' },
  CLOSED: { bg: '#f8fafc', color: '#475569' },
};

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  ACTION: { bg: '#eef2ff', color: '#4338ca' },
  PHYSICAL: { bg: '#f0fdf4', color: '#166534' },
  CLOSEOUT: { bg: '#fdf2f8', color: '#9d174d' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || { bg: '#f8fafc', color: 'var(--bos-color-ink-disabled)' };
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.color}22`,
      whiteSpace: 'nowrap',
    }}>{status.replace(/_/g, ' ')}</span>
  );
}

function TypePill({ type }: { type: string }) {
  const s = TYPE_STYLE[type] || { bg: '#f8fafc', color: 'var(--bos-color-ink-disabled)' };
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.color}22`,
      whiteSpace: 'nowrap',
    }}>{type}</span>
  );
}

function DocChip({ icon, label, count, onClick, accent }: {
  icon: string;
  label: string;
  count: number;
  onClick?: () => void;
  accent?: string;
}) {
  const has = count > 0;
  const color = has ? (accent ?? 'var(--bos-color-brand-primary-deep)') : 'var(--bos-color-ink-tertiary)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!has}
      title={`${label}: ${count} document${count === 1 ? '' : 's'}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 7px', borderRadius: 999, fontSize: 10,
        fontWeight: 700, background: has ? `${color}12` : '#f1f5f9',
        color, border: `1px solid ${color}22`,
        cursor: has ? 'pointer' : 'default',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {has && <span style={{ background: color, color: 'white', borderRadius: 999, padding: '0 5px', fontSize: 9 }}>{count}</span>}
    </button>
  );
}

function daysUntilDue(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const ms = due.getTime() - now.getTime();
  return Math.ceil(ms / 86400000);
}

export default function SubmittalsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'ALL' | 'ACTION' | 'PHYSICAL' | 'CLOSEOUT'>('ALL');
  const [filterBic, setFilterBic] = useState<string>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<'due_asc' | 'due_desc' | 'csi' | 'status'>('due_asc');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedSubmittalId, setSelectedSubmittalId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/submittals/by-kid/${encodeURIComponent(kID)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const j: ApiResponse = await r.json();
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kID]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let xs = items.filter((it) => {
      if (filterStatuses.size > 0 && !filterStatuses.has(it.status)) return false;
      if (filterType !== 'ALL' && it.submittal_type !== filterType) return false;
      if (filterBic !== 'ALL' && (it.ball_in_court ?? '') !== filterBic) return false;
      if (overdueOnly) {
        const d = daysUntilDue(it.required_by_date);
        if (d === null || d >= 0 || it.status === 'CLOSED') return false;
      }
      if (q) {
        const hay = `${it.submittal_number} ${it.description ?? ''} ${it.csi_spec_section} ${it.csi_subsection} ${it.csi_sub_subsection}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    xs = xs.slice().sort((a, b) => {
      if (sort === 'csi') return a.submittal_number.localeCompare(b.submittal_number);
      if (sort === 'status') return a.status.localeCompare(b.status);
      const ad = a.required_by_date ?? '9999-12-31';
      const bd = b.required_by_date ?? '9999-12-31';
      return sort === 'due_asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
    return xs;
  }, [items, search, filterStatuses, filterType, filterBic, overdueOnly, sort]);

  const toggleStatus = (s: string) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 24, color: '#b91c1c', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
        Failed to load submittals: {err}
      </div>
    );
  }

  if (!data?.kIDFound) {
    return (
      <div style={{ padding: 24, color: 'var(--bos-color-ink-disabled)', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
        Submittal Log v1.0 requires this project to be migrated to Postgres. The legacy Sheets-based submittals list is still shown elsewhere; new entries via this surface require an engagement row.
      </div>
    );
  }

  return (
    <div>
      {/* KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outstanding</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: data.summary.outstanding > 0 ? '#d97706' : '#059669', marginTop: 4 }}>
            {data.summary.outstanding}
          </div>
          <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>per §5.4 logic</div>
        </div>
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{data.summary.total}</div>
          <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>all statuses</div>
        </div>
        {(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'] as const).map((k) => (
          <div key={k} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{data.summary.by_status[k] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="text" placeholder="Search by #, description, CSI..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 260px', padding: '8px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none', background: 'white' }}
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, background: 'white' }}>
          <option value="ALL">All types</option>
          <option value="ACTION">Action</option>
          <option value="PHYSICAL">Physical</option>
          <option value="CLOSEOUT">Closeout</option>
        </select>
        <select value={filterBic} onChange={(e) => setFilterBic(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, background: 'white' }}>
          <option value="ALL">All courts</option>
          <option value="SUBCONTRACTOR">Subcontractor</option>
          <option value="GC">GC</option>
          <option value="ARCHITECT">Architect</option>
          <option value="ENGINEER">Engineer</option>
          <option value="OWNER">Owner</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 12, background: 'white' }}>
          <option value="due_asc">Due date ↑</option>
          <option value="due_desc">Due date ↓</option>
          <option value="csi">Number / CSI</option>
          <option value="status">Status</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, border: '1px solid var(--bos-color-brand-primary-deep)', background: 'var(--bos-color-brand-primary-deep)', color: 'white', cursor: 'pointer' }}
        >
          + New Submittal
        </button>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {Object.keys(STATUS_STYLE).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              border: filterStatuses.has(s)
                ? `1.5px solid ${STATUS_STYLE[s].color}`
                : '1.5px solid #e2e8f0',
              background: filterStatuses.has(s) ? STATUS_STYLE[s].bg : 'white',
              color: filterStatuses.has(s) ? STATUS_STYLE[s].color : 'var(--bos-color-ink-disabled)',
              cursor: 'pointer',
            }}
          >
            {s.replace(/_/g, ' ')} {data.summary.by_status[s] ? `(${data.summary.by_status[s]})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)' }}>
          {items.length === 0 ? 'No submittals yet — click + New Submittal to start.' : 'No submittals match the active filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((it) => {
            const d = daysUntilDue(it.required_by_date);
            const overdue = d !== null && d < 0 && it.status !== 'CLOSED';
            return (
              <div
                key={it.submittal_id}
                onClick={() => setSelectedSubmittalId(it.submittal_id)}
                style={{
                  background: 'white', borderRadius: 12,
                  border: overdue ? '1.5px solid #fecaca' : '1px solid #e2e8f0',
                  padding: '12px 16px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: 'var(--color-ink-primary)' }}>{it.submittal_number}</span>
                      <TypePill type={it.submittal_type} />
                      <StatusPill status={it.status} />
                      {it.ball_in_court && (
                        <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
                          Ball: {it.ball_in_court}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.description || it.display_label || '(no description)'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>
                      CSI {it.csi_spec_section} · {it.csi_subsection} · {it.csi_sub_subsection}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {it.required_by_date && (
                      <div style={{ fontSize: 11, color: overdue ? '#b91c1c' : 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
                        Due {it.required_by_date}
                      </div>
                    )}
                    {d !== null && (
                      <div style={{ fontSize: 10, color: overdue ? '#b91c1c' : 'var(--bos-color-ink-tertiary)', marginTop: 2, fontWeight: 700 }}>
                        {overdue ? `${Math.abs(d)}d overdue` : `${d}d to due`}
                      </div>
                    )}
                  </div>
                </div>
                {/* Contextual Document Surfacing chip strip */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                  <DocChip
                    icon="📋"
                    label="Spec"
                    count={it.spec_document_ref ? 1 : 0}
                    accent="#1d4ed8"
                    onClick={() => { if (it.spec_document_ref) window.open(`https://drive.google.com/file/d/${it.spec_document_ref}/view`, '_blank'); }}
                  />
                  <DocChip
                    icon="📄"
                    label="Submitted"
                    count={it.submitted_documents?.length ?? 0}
                    accent="var(--bos-color-brand-primary-deep)"
                  />
                  <DocChip
                    icon="🖍️"
                    label="Markup"
                    count={it.review_comments_documents?.length ?? 0}
                    accent="#9a3412"
                  />
                  <DocChip
                    icon="✅"
                    label="Approved"
                    count={it.approved_documents?.length ?? 0}
                    accent="#15803d"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showWizard && (
        <SubmittalCreateWizard
          kID={kID}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); fetchList(); }}
        />
      )}
      {selectedSubmittalId && (
        <SubmittalDetailDrawer
          submittalId={selectedSubmittalId}
          kID={kID}
          onClose={() => setSelectedSubmittalId(null)}
          onChanged={() => fetchList()}
        />
      )}
    </div>
  );
}
