'use client';
/**
 * BAN-347 PM-V1.0-H — Project Detail Container Overview tab.
 *
 * Renders the 9 KPI panels canonicalized in PM Trunk v1.0 §12.3:
 *   1. Project header
 *   2. Status summary
 *   3. Open Actions panel
 *   4. Submittals KPI
 *   5. RFIs KPI
 *   6. Documents panel
 *   7. Financial summary
 *   8. Schedule snapshot (STUB — Schedule Trunk pending)
 *   9. Activity ticker
 *
 * Every panel is a deterministic SQL count rollup or entity read against an
 * existing route (no LLM, no schema migrations).  Kai (Charter Amendment 2)
 * may LATER layer health scoring on top, but BanyanOS default operation
 * displays all KPIs without Kai.
 */

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/pm/sov-summary';
import {
  buildActivityTicker,
  computeFinancialSummary,
  computeRfiKpi,
  computeSubmittalKpi,
  daysSince,
  engagementInCloseout,
  formatHandoffStateLabel,
  pickHandoffReferenceTimestamp,
  topOpenActionItems,
  topRecentDocuments,
  type ActionItemRowLite,
  type ActivityTickerEntry,
  type DocumentRowLite,
  type FieldEventRowLite,
  type PayAppRowLite,
  type RfiRowLite,
  type SubmittalRowLite,
} from '@/lib/pm/overview/panels';

type Project = {
  kID: string;
  name: string;
  pm?: string;
  island?: string;
};

type HandoffReceipt = {
  state: string;
  accepted_at: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  received_at?: string | null;
};

type EngagementLite = {
  engagement_id: string;
  status: string;
  pm_handoff_state: string;
  is_test_project: boolean;
};

type OverviewData = {
  loading: boolean;
  error: string | null;
  submittals: SubmittalRowLite[];
  rfis: RfiRowLite[];
  actionItems: ActionItemRowLite[];
  documents: DocumentRowLite[];
  payApps: PayAppRowLite[];
  events: FieldEventRowLite[];
  currentHandoff: HandoffReceipt | null;
  engagement: EngagementLite | null;
  // TODO(BAN-348+): org_name surfaces from a future /api/engagements/by-kid endpoint;
  // for now we render kID + name only.
};

const EMPTY: OverviewData = {
  loading: true,
  error: null,
  submittals: [],
  rfis: [],
  actionItems: [],
  documents: [],
  payApps: [],
  events: [],
  currentHandoff: null,
  engagement: null,
};

const CARD: React.CSSProperties = {
  background: 'white',
  borderRadius: 14,
  border: '1px solid var(--color-surface-border)',
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
};

const PANEL_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--bos-color-brand-primary-deep)',
};

const PANEL_SUBTITLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--bos-color-ink-disabled)',
  marginTop: 4,
};

const STAT_VALUE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
  color: 'var(--color-ink-primary)',
};

const STAT_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: 'var(--bos-color-ink-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

function formatRelativeDate(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTickerTimestamp(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type ProjectOverviewProps = {
  project: Project;
  /** Switches the parent container's active tab so action-row clicks deep-link
   *  into ActionItemsTab / DocumentsTab. */
  onNavigateTab?: (tab: string) => void;
};

export default function ProjectOverview({ project, onNavigateTab }: ProjectOverviewProps) {
  const [data, setData] = useState<OverviewData>(EMPTY);

  const load = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));
    const kid = project.kID;
    const enc = encodeURIComponent(kid);
    try {
      const [subRes, rfiRes, aiRes, docRes, billingRes, hoRes, evRes] = await Promise.all([
        fetch(`/api/pm/submittals?kID=${enc}`).then((r) => r.json()).catch(() => ({ submittals: [] })),
        fetch(`/api/pm/rfi?kID=${enc}`).then((r) => r.json()).catch(() => ({ rfis: [] })),
        fetch(`/api/action-items/by-kid/${enc}?status=OPEN,IN_PROGRESS`).then((r) => r.json()).catch(() => ({ items: [] })),
        fetch(`/api/documents/by-kid/${enc}`).then((r) => r.json()).catch(() => ({ items: [] })),
        fetch(`/api/aia/billing/by-kid/${enc}`).then((r) => r.json()).catch(() => ({ payApps: [], engagement: null })),
        fetch(`/api/handoff-receipts/by-kid/${enc}`).then((r) => r.json()).catch(() => ({ summary: { current: null } })),
        fetch(`/api/events?kID=${enc}&limit=10`).then((r) => r.json()).catch(() => ({ events: [] })),
      ]);

      setData({
        loading: false,
        error: null,
        submittals: (subRes.submittals || []) as SubmittalRowLite[],
        rfis: (rfiRes.rfis || []) as RfiRowLite[],
        actionItems: (aiRes.items || []) as ActionItemRowLite[],
        documents: (docRes.items || []) as DocumentRowLite[],
        payApps: (billingRes.payApps || []) as PayAppRowLite[],
        events: (evRes.events || []) as FieldEventRowLite[],
        currentHandoff: (hoRes.summary?.current ?? null) as HandoffReceipt | null,
        engagement: (billingRes.engagement ?? null) as EngagementLite | null,
      });
    } catch (err) {
      setData((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [project.kID]);

  useEffect(() => { load(); }, [load]);

  if (data.loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: 'var(--bos-color-brand-primary)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const handoffRef = pickHandoffReferenceTimestamp(data.currentHandoff);
  const daysSinceHandoff = daysSince(handoffRef);
  const lastEventAt = data.events[0]?.event_occurred_at || data.events[0]?.occurredAt || null;
  const daysSinceLastEvent = daysSince(lastEventAt);
  const inCloseout = engagementInCloseout(data.engagement?.pm_handoff_state ?? null);
  const submittalKpi = computeSubmittalKpi(data.submittals, { engagementInCloseout: inCloseout });
  const rfiKpi = computeRfiKpi(data.rfis);
  const openActions = topOpenActionItems(data.actionItems, 5);
  const recentDocs = topRecentDocuments(data.documents, 5);
  const financial = computeFinancialSummary(data.payApps);
  const ticker = buildActivityTicker(data.events, 10);

  return (
    <div data-testid="project-overview" style={{ display: 'grid', gap: 14 }}>
      {/* Panel 1 — Project header */}
      <section data-overview-panel="project-header" style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={PANEL_TITLE}>Project Header</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-ink-primary)', marginTop: 6 }}>{project.name}</div>
            <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
              {project.kID} · PM: {project.pm || '—'}{project.island ? ` · ${project.island}` : ''}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, minWidth: 280 }}>
            <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={STAT_LABEL}>Contract Sum</div>
              <div style={STAT_VALUE}>{financial.contractSum > 0 ? formatCurrency(financial.contractSum) : '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                {financial.contractSumSource === 'pay_app_to_date' ? 'Latest pay app to-date' :
                  financial.contractSumSource === 'pay_app_original' ? 'Pay app original' :
                    'Pending pay app'}
              </div>
            </div>
            <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={STAT_LABEL}>Current Pay App</div>
              <div style={STAT_VALUE}>{financial.currentPayApp ? `#${financial.currentPayApp.pay_app_number}` : '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
                {financial.currentPayApp?.state ? financial.currentPayApp.state.replace(/_/g, ' ') : 'No pay apps yet'}
              </div>
            </div>
          </div>
        </div>
        {/* TODO(BAN-348+): GC org_name + SOV-rollup % complete will surface once
            /api/engagements/by-kid + sov-active-version reads are wired. */}
      </section>

      {/* Panel 2 — Status summary */}
      <section data-overview-panel="status-summary" style={CARD}>
        <div style={PANEL_TITLE}>Status Summary</div>
        <div style={PANEL_SUBTITLE}>Engagement state, days since handoff acceptance, and field-event freshness.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Engagement State</div>
            <div style={{ ...STAT_VALUE, textTransform: 'uppercase', fontSize: 14, letterSpacing: '0.04em' }}>
              {formatHandoffStateLabel(data.engagement?.pm_handoff_state ?? null)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
              {data.engagement?.status ? `engagement.status = ${data.engagement.status}` : 'Pre-migration'}
            </div>
          </div>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Days Since Handoff</div>
            <div style={STAT_VALUE}>{daysSinceHandoff !== null ? daysSinceHandoff : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
              {handoffRef ? `since ${formatRelativeDate(handoffRef)}` : 'No handoff receipt yet'}
            </div>
          </div>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Days Since Last Field Event</div>
            <div style={STAT_VALUE}>{daysSinceLastEvent !== null ? daysSinceLastEvent : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
              {lastEventAt ? `most recent ${formatRelativeDate(lastEventAt)}` : 'No field events yet'}
            </div>
          </div>
        </div>
      </section>

      {/* Panel 3 — Open Actions */}
      <section data-overview-panel="open-actions" style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={PANEL_TITLE}>Open Actions</div>
            <div style={PANEL_SUBTITLE}>Top 5 OPEN/IN_PROGRESS items; click to deep-link into Action Items tab.</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('action-items')}
            style={{ border: '1px solid rgba(15,118,110,0.22)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
          >
            All Action Items →
          </button>
        </div>
        {openActions.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>No open action items.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {openActions.map((it) => (
              <button
                key={it.action_item_id}
                type="button"
                data-action-row-id={it.action_item_id}
                onClick={() => onNavigateTab?.('action-items')}
                style={{
                  textAlign: 'left',
                  background: 'var(--color-surface)',
                  border: '1px solid #eef2f7',
                  borderRadius: 10,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>
                    {(it.source_entity_type || 'MANUAL').replace(/_/g, ' ')}
                    {it.due_date ? ` · due ${formatRelativeDate(it.due_date)}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: it.priority === 'URGENT' ? '#fee2e2' : '#eff6ff', color: it.priority === 'URGENT' ? 'var(--color-red-700)' : '#1d4ed8' }}>
                  {it.priority || 'MEDIUM'}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Panel 4 — Submittals KPI */}
      <section data-overview-panel="submittals-kpi" style={CARD}>
        <div style={PANEL_TITLE}>Submittals KPI</div>
        <div style={PANEL_SUBTITLE}>Outstanding rollup per PM Trunk v1.0 §5.4.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Total</div>
            <div style={STAT_VALUE}>{submittalKpi.total}</div>
          </div>
          <div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Outstanding</div>
            <div style={{ ...STAT_VALUE, color: submittalKpi.outstanding > 0 ? 'var(--color-amber-800)' : 'var(--bos-color-brand-primary-deep)' }}>{submittalKpi.outstanding}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
              {submittalKpi.hasTypeField
                ? `Action ${submittalKpi.outstandingByType.ACTION} · Physical ${submittalKpi.outstandingByType.PHYSICAL} · Closeout ${submittalKpi.outstandingByType.CLOSEOUT}`
                : 'Status-only rollup'}
            </div>
          </div>
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Approved</div>
            <div style={{ ...STAT_VALUE, color: '#15803d' }}>{submittalKpi.approved}</div>
          </div>
        </div>
        {!submittalKpi.hasTypeField && (
          // TODO(BAN-348+): Sheet schema lacks submittal_type column; once the
          // type backfill lands the §5.4 ACTION/PHYSICAL/CLOSEOUT breakdown
          // will populate automatically via computeSubmittalKpi.
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
            ACTION/PHYSICAL/CLOSEOUT breakdown pending submittal_type backfill.
          </div>
        )}
      </section>

      {/* Panel 5 — RFIs KPI */}
      <section data-overview-panel="rfis-kpi" style={CARD}>
        <div style={PANEL_TITLE}>RFIs KPI</div>
        <div style={PANEL_SUBTITLE}>Open / overdue / recently answered per PM Trunk v1.0 §6.5.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Open</div>
            <div style={STAT_VALUE}>{rfiKpi.open}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>of {rfiKpi.total} total</div>
          </div>
          <div style={{ background: 'var(--color-red-50)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Overdue</div>
            <div style={{ ...STAT_VALUE, color: rfiKpi.overdue > 0 ? 'var(--color-red-700)' : 'var(--bos-color-brand-primary-deep)' }}>{rfiKpi.overdue}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>past required_response_by</div>
          </div>
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Answered (7d)</div>
            <div style={{ ...STAT_VALUE, color: '#15803d' }}>{rfiKpi.recentlyAnswered}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>status=ANSWERED in last 7 days</div>
          </div>
        </div>
      </section>

      {/* Panel 6 — Documents */}
      <section data-overview-panel="documents" style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={PANEL_TITLE}>Documents</div>
            <div style={PANEL_SUBTITLE}>Top 5 most recent Document Hub entries.</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('documents')}
            style={{ border: '1px solid rgba(15,118,110,0.22)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
          >
            All Documents →
          </button>
        </div>
        {recentDocs.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>No documents yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
            {recentDocs.map((d) => (
              <button
                key={d.document_id}
                type="button"
                data-document-row-id={d.document_id}
                onClick={() => onNavigateTab?.('documents')}
                style={{
                  textAlign: 'left',
                  background: 'var(--color-surface)',
                  border: '1px solid #eef2f7',
                  borderRadius: 10,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.filename}</div>
                  <div style={{ fontSize: 11, color: 'var(--bos-color-ink-disabled)', marginTop: 2 }}>{d.kind.replace(/_/g, ' ')} · {formatRelativeDate(d.uploaded_at)}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8' }}>{d.kind}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Panel 7 — Financial summary */}
      <section data-overview-panel="financial-summary" style={CARD}>
        <div style={PANEL_TITLE}>Financial Summary</div>
        <div style={PANEL_SUBTITLE}>Contract sum, current pay app cycle status, outstanding AR.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 12 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Contract Sum</div>
            <div style={STAT_VALUE}>{financial.contractSum > 0 ? formatCurrency(financial.contractSum) : '—'}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Approved COs</div>
            <div style={STAT_VALUE}>—</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>
              {/* TODO(BAN-348+): change_orders is not a Postgres table at SHA 371297c7;
                   approved-CO total surfaces once the CO trunk lands.  Do NOT escalate
                   per BAN-347 placeholder policy. */}
              CO trunk pending
            </div>
          </div>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Pay App Cycle</div>
            <div style={STAT_VALUE}>{financial.currentPayApp ? `#${financial.currentPayApp.pay_app_number}` : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>{financial.currentPayApp?.state ? financial.currentPayApp.state.replace(/_/g, ' ') : 'No pay apps'}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={STAT_LABEL}>Outstanding AR</div>
            <div style={{ ...STAT_VALUE, color: financial.outstandingAr > 0 ? 'var(--color-amber-800)' : 'var(--bos-color-brand-primary-deep)' }}>{financial.outstandingAr > 0 ? formatCurrency(financial.outstandingAr) : '$0'}</div>
            <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2 }}>billed, not yet paid</div>
          </div>
        </div>
      </section>

      {/* Panel 8 — Schedule snapshot (STUB) */}
      <section data-overview-panel="schedule-snapshot" style={{ ...CARD, background: 'linear-gradient(180deg, var(--color-surface), #ffffff)' }}>
        <div style={PANEL_TITLE}>Schedule Snapshot</div>
        <div style={{ marginTop: 12, padding: '16px 18px', borderRadius: 10, background: '#f1f5f9', border: '1px dashed #cbd5e1', color: 'var(--bos-color-ink-disabled)', fontSize: 13 }}>
          {/* TODO(Schedule Trunk): replace with live milestones + look-ahead window
               once the Schedule Trunk ships.  Panel intentionally stubbed for v1.0
               per BAN-347 §12.3 acceptance #7. */}
          Schedule Trunk pending — milestones, look-ahead, and float surface here when the Schedule Trunk ships.
        </div>
      </section>

      {/* Panel 9 — Activity ticker */}
      <section data-overview-panel="activity-ticker" style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={PANEL_TITLE}>Activity Ticker</div>
            <div style={PANEL_SUBTITLE}>Last 10 field_events for this engagement (via /api/events).</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab?.('activity')}
            style={{ border: '1px solid rgba(15,118,110,0.22)', background: 'rgba(240,253,250,0.96)', color: 'var(--bos-color-brand-primary-deep)', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
          >
            Full Activity →
          </button>
        </div>
        {ticker.length === 0 ? (
          <div style={{ padding: '18px 0', fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>No field events yet.</div>
        ) : (
          <ol data-testid="activity-ticker-list" style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0', display: 'grid', gap: 6 }}>
            {ticker.map((e: ActivityTickerEntry) => (
              <li key={e.id || `${e.eventType}-${e.occurredAt}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 10, fontSize: 12, padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid #eef2f7' }}>
                <span style={{ fontWeight: 700, color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>{e.eventType.replace(/_/g, ' ')}</span>
                <span style={{ color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.summary || (e.actor ? `by ${e.actor}` : '—')}
                </span>
                <span style={{ color: 'var(--bos-color-ink-tertiary)', textAlign: 'right' }}>{formatTickerTimestamp(e.occurredAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {data.error && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--color-red-50)', color: 'var(--color-red-700)', fontSize: 12 }}>
          {data.error}
        </div>
      )}
    </div>
  );
}
