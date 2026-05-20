'use client';
/**
 * BAN-341 PM-V1.0-B — RFI Log surface v1 for the PM ProjectsPanel `rfis` tab.
 * Replaces the prior read-only Sheets-backed stub.
 *
 * - Row list with status, ball-in-court, required_response_by_date,
 *   days_until_due (computed), cost/schedule impact indicator.
 * - Filters by status (multi-select), submitted_to, ball-in-court; overdue
 *   toggle; cost-impact toggle.
 * - Sort by required_response_by_date asc default, user-selectable.
 * - Search across rfi_number, subject, question.
 * - Contextual Document Surfacing chip strip per row.
 * - "+ New RFI" wizard launches RfiCreateWizard.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import RfiCreateWizard from './RfiCreateWizard';
import RfiDetailDrawer from './RfiDetailDrawer';

type RfiRow = {
  rfi_id: string;
  rfi_number: string;
  subject: string;
  question: string;
  reason_for_rfi: string | null;
  cost_or_schedule_impact_anticipated: boolean;
  cost_impact_estimate: string | null;
  schedule_impact_days: number | null;
  submitted_to: string | null;
  submitted_date: string | null;
  required_response_by_date: string | null;
  status: string;
  ball_in_court: string | null;
  response_received_date: string | null;
  response_text: string | null;
  response_documents: string[];
  generates_change_order: boolean;
  linked_change_order_id: string | null;
  rfi_pdf_drive_id: string | null;
  submitted_attachments: string[];
};

type ApiResponse = {
  kIDFound: boolean;
  engagement: { engagement_id: string; kid: string } | null;
  items: RfiRow[];
  summary: {
    total: number;
    by_status: Record<string, number>;
    open: number;
    overdue: number;
  };
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)' },
  SUBMITTED: { bg: '#eff6ff', color: '#1d4ed8' },
  UNDER_REVIEW: { bg: '#eff6ff', color: '#1d4ed8' },
  ANSWERED: { bg: '#fffbeb', color: 'var(--color-amber-800)' },
  RESOLVED: { bg: '#f0fdfa', color: 'var(--bos-color-brand-primary-deep)' },
  CLOSED: { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-tertiary)' },
  VOID: { bg: '#fef2f2', color: 'var(--color-red-700)' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)' };
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.color}22`,
      whiteSpace: 'nowrap',
    }}>{status.replace(/_/g, ' ')}</span>
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

export default function RfisTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterSubmittedTo, setFilterSubmittedTo] = useState<string>('ALL');
  const [filterBic, setFilterBic] = useState<string>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [costImpactOnly, setCostImpactOnly] = useState(false);
  const [sort, setSort] = useState<'due_asc' | 'due_desc' | 'number' | 'status'>('due_asc');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedRfiId, setSelectedRfiId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/rfis/by-kid/${encodeURIComponent(kID)}`);
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
      if (filterSubmittedTo !== 'ALL' && (it.submitted_to ?? '') !== filterSubmittedTo) return false;
      if (filterBic !== 'ALL' && (it.ball_in_court ?? '') !== filterBic) return false;
      if (overdueOnly) {
        const d = daysUntilDue(it.required_response_by_date);
        const isOpen = it.status === 'SUBMITTED' || it.status === 'UNDER_REVIEW';
        if (!isOpen || d === null || d >= 0) return false;
      }
      if (costImpactOnly && !it.cost_or_schedule_impact_anticipated) return false;
      if (q) {
        const hay = `${it.rfi_number} ${it.subject} ${it.question}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    xs = xs.slice().sort((a, b) => {
      if (sort === 'number') return a.rfi_number.localeCompare(b.rfi_number);
      if (sort === 'status') return a.status.localeCompare(b.status);
      const ad = a.required_response_by_date ?? '9999-12-31';
      const bd = b.required_response_by_date ?? '9999-12-31';
      return sort === 'due_asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
    });
    return xs;
  }, [items, search, filterStatuses, filterSubmittedTo, filterBic, overdueOnly, costImpactOnly, sort]);

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
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: 'var(--bos-color-brand-primary)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 24, color: 'var(--color-red-700)', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
        Failed to load RFIs: {err}
      </div>
    );
  }

  if (!data?.kIDFound) {
    return (
      <div style={{ padding: 24, color: 'var(--bos-color-ink-disabled)', background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>
        RFI Log v1.0 requires this project to be migrated to Postgres. The legacy Sheets-based RFI list is still shown elsewhere; new entries via this surface require an engagement row.
      </div>
    );
  }

  return (
    <div>
      {/* KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overdue</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: data.summary.overdue > 0 ? 'var(--color-red-700)' : '#059669', marginTop: 4 }}>
            {data.summary.overdue}
          </div>
          <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>past required-by</div>
        </div>
        <div style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Open</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{data.summary.open}</div>
          <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>submitted / under review / answered</div>
        </div>
        <div style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{data.summary.total}</div>
          <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>all statuses</div>
        </div>
        {(['SUBMITTED', 'ANSWERED', 'RESOLVED'] as const).map((k) => (
          <div key={k} style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{data.summary.by_status[k] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="text" placeholder="Search by #, subject, question..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 260px', padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white' }}
        />
        <select value={filterSubmittedTo} onChange={(e) => setFilterSubmittedTo(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 12, background: 'white' }}>
          <option value="ALL">All submitted-to</option>
          <option value="GC">GC</option>
          <option value="ARCHITECT">Architect</option>
          <option value="ENGINEER">Engineer</option>
          <option value="OWNER">Owner</option>
        </select>
        <select value={filterBic} onChange={(e) => setFilterBic(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 12, background: 'white' }}>
          <option value="ALL">All courts</option>
          <option value="SUBCONTRACTOR">Subcontractor</option>
          <option value="GC">GC</option>
          <option value="ARCHITECT">Architect</option>
          <option value="ENGINEER">Engineer</option>
          <option value="OWNER">Owner</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 12, background: 'white' }}>
          <option value="due_asc">Due date ↑</option>
          <option value="due_desc">Due date ↓</option>
          <option value="number">RFI #</option>
          <option value="status">Status</option>
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
          <input type="checkbox" checked={costImpactOnly} onChange={(e) => setCostImpactOnly(e.target.checked)} />
          Cost/schedule impact
        </label>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 800, border: '1px solid var(--bos-color-brand-primary-deep)', background: 'var(--bos-color-brand-primary-deep)', color: 'white', cursor: 'pointer' }}
        >
          + New RFI
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
                : '1.5px solid var(--color-surface-border)',
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
          {items.length === 0 ? 'No RFIs yet — click + New RFI to start.' : 'No RFIs match the active filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((it) => {
            const d = daysUntilDue(it.required_response_by_date);
            const isOpen = it.status === 'SUBMITTED' || it.status === 'UNDER_REVIEW';
            const overdue = isOpen && d !== null && d < 0;
            return (
              <div
                key={it.rfi_id}
                onClick={() => setSelectedRfiId(it.rfi_id)}
                style={{
                  background: 'white', borderRadius: 12,
                  border: overdue ? '1.5px solid #fecaca' : '1px solid var(--color-surface-border)',
                  padding: '12px 16px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: 'var(--color-ink-primary)' }}>{it.rfi_number}</span>
                      <StatusPill status={it.status} />
                      {it.submitted_to && (
                        <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>→ {it.submitted_to}</span>
                      )}
                      {it.ball_in_court && (
                        <span style={{ fontSize: 10, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
                          Ball: {it.ball_in_court}
                        </span>
                      )}
                      {it.cost_or_schedule_impact_anticipated && (
                        <span style={{ fontSize: 10, color: 'var(--color-amber-800)', fontWeight: 800, background: '#fffbeb', padding: '1px 6px', borderRadius: 6, border: '1px solid #fde68a' }}>
                          $ impact
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {it.subject}
                    </div>
                    {it.reason_for_rfi && (
                      <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>
                        {it.reason_for_rfi.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {it.required_response_by_date && (
                      <div style={{ fontSize: 11, color: overdue ? 'var(--color-red-700)' : 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>
                        Due {it.required_response_by_date}
                      </div>
                    )}
                    {d !== null && isOpen && (
                      <div style={{ fontSize: 10, color: overdue ? 'var(--color-red-700)' : 'var(--bos-color-ink-tertiary)', marginTop: 2, fontWeight: 700 }}>
                        {overdue ? `${Math.abs(d)}d overdue` : `${d}d to due`}
                      </div>
                    )}
                  </div>
                </div>
                {/* Contextual Document Surfacing chip strip */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--color-surface-border)' }}>
                  <DocChip
                    icon="📄"
                    label="RFI PDF"
                    count={it.rfi_pdf_drive_id ? 1 : 0}
                    accent="#1d4ed8"
                    onClick={() => { if (it.rfi_pdf_drive_id) window.open(`https://drive.google.com/file/d/${it.rfi_pdf_drive_id}/view`, '_blank'); }}
                  />
                  <DocChip
                    icon="📋"
                    label="Attachments"
                    count={it.submitted_attachments?.length ?? 0}
                    accent="var(--bos-color-brand-primary-deep)"
                  />
                  <DocChip
                    icon="✅"
                    label="Response"
                    count={(it.response_text ? 1 : 0) + (it.response_documents?.length ?? 0)}
                    accent="#15803d"
                  />
                  <DocChip
                    icon="🔗"
                    label="Linked CO"
                    count={it.linked_change_order_id ? 1 : 0}
                    accent="#9a3412"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showWizard && (
        <RfiCreateWizard
          kID={kID}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); fetchList(); }}
        />
      )}
      {selectedRfiId && (
        <RfiDetailDrawer
          rfiId={selectedRfiId}
          kID={kID}
          onClose={() => setSelectedRfiId(null)}
          onChanged={() => fetchList()}
        />
      )}
    </div>
  );
}
