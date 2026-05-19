/**
 * BAN-347 PM-V1.0-H — unit tests for lib/pm/overview/panels.ts.
 *
 * Covers the pure KPI rollups + helpers feeding the 9 Overview panels.
 * Route/component integration is asserted in ban347ProjectOverviewSource +
 * ban347ProjectsPanelTabOrder.
 */

import {
  buildActivityTicker,
  computeFinancialSummary,
  computeRfiKpi,
  computeSubmittalKpi,
  daysSince,
  engagementInCloseout,
  formatHandoffStateLabel,
  isHandoffTerminal,
  pickHandoffReferenceTimestamp,
  topOpenActionItems,
  topRecentDocuments,
} from '@/lib/pm/overview/panels';

const FROZEN_NOW = new Date('2026-05-19T12:00:00Z');

describe('BAN-347 daysSince', () => {
  it('returns null when timestamp is missing or invalid', () => {
    expect(daysSince(null, FROZEN_NOW)).toBeNull();
    expect(daysSince(undefined, FROZEN_NOW)).toBeNull();
    expect(daysSince('not a date', FROZEN_NOW)).toBeNull();
  });

  it('floors the day diff', () => {
    expect(daysSince('2026-05-18T12:00:00Z', FROZEN_NOW)).toBe(1);
    expect(daysSince('2026-05-12T12:00:00Z', FROZEN_NOW)).toBe(7);
    expect(daysSince('2026-05-19T11:59:59Z', FROZEN_NOW)).toBe(0);
  });

  it('clamps future timestamps to 0', () => {
    expect(daysSince('2026-06-01T00:00:00Z', FROZEN_NOW)).toBe(0);
  });
});

describe('BAN-347 pickHandoffReferenceTimestamp', () => {
  it('prefers accepted_at over reviewed_at/submitted_at', () => {
    expect(pickHandoffReferenceTimestamp({
      accepted_at: '2026-05-10T00:00:00Z',
      reviewed_at: '2026-05-05T00:00:00Z',
      submitted_at: '2026-05-01T00:00:00Z',
    })).toBe('2026-05-10T00:00:00Z');
  });

  it('falls back to reviewed_at when accepted_at is null', () => {
    expect(pickHandoffReferenceTimestamp({
      accepted_at: null,
      reviewed_at: '2026-05-05T00:00:00Z',
      submitted_at: '2026-05-01T00:00:00Z',
    })).toBe('2026-05-05T00:00:00Z');
  });

  it('honours the alternate received_at spelling between accepted_at and reviewed_at', () => {
    expect(pickHandoffReferenceTimestamp({
      accepted_at: null,
      received_at: '2026-05-08T00:00:00Z',
      reviewed_at: '2026-05-05T00:00:00Z',
    })).toBe('2026-05-08T00:00:00Z');
  });

  it('returns null for missing receipts', () => {
    expect(pickHandoffReferenceTimestamp(null)).toBeNull();
    expect(pickHandoffReferenceTimestamp(undefined)).toBeNull();
    expect(pickHandoffReferenceTimestamp({})).toBeNull();
  });
});

describe('BAN-347 handoff state labels', () => {
  it('formats snake_case states for display', () => {
    expect(formatHandoffStateLabel('pm_assigned')).toBe('pm assigned');
    expect(formatHandoffStateLabel(null)).toBe('—');
  });

  it('classifies terminal handoff states per BAN-346', () => {
    expect(isHandoffTerminal('accepted')).toBe(true);
    expect(isHandoffTerminal('accepted_with_gaps')).toBe(true);
    expect(isHandoffTerminal('rejected_with_gaps')).toBe(true);
    expect(isHandoffTerminal('pending_review')).toBe(false);
    expect(isHandoffTerminal(null)).toBe(false);
  });

  it('engagementInCloseout only fires for closed state in the current handoff schema', () => {
    expect(engagementInCloseout('closed')).toBe(true);
    expect(engagementInCloseout('active')).toBe(false);
    expect(engagementInCloseout(null)).toBe(false);
  });
});

describe('BAN-347 computeSubmittalKpi (§5.4 logic)', () => {
  const now = FROZEN_NOW;

  it('falls back to status-only rollup when sheet rows omit submittal_type', () => {
    const kpi = computeSubmittalKpi(
      [
        { status: 'SUBMITTED' },
        { status: 'UNDER_REVIEW' },
        { status: 'APPROVED' },
        { status: 'CLOSED' },
        { status: 'PENDING' },
      ],
      { engagementInCloseout: false, now },
    );
    expect(kpi.total).toBe(5);
    expect(kpi.outstanding).toBe(3);
    expect(kpi.approved).toBe(1);
    expect(kpi.hasTypeField).toBe(false);
  });

  it('applies the canonical §5.4 type filter when submittal_type is present', () => {
    const kpi = computeSubmittalKpi(
      [
        { status: 'SUBMITTED', submittal_type: 'ACTION' },
        { status: 'APPROVED', submittal_type: 'ACTION' },
        { status: 'SUBMITTED', submittal_type: 'PHYSICAL', required_by_date: '2026-05-01' },
        { status: 'SUBMITTED', submittal_type: 'PHYSICAL', required_by_date: '2099-12-31' },
        { status: 'SUBMITTED', submittal_type: 'CLOSEOUT' },
      ],
      { engagementInCloseout: true, now },
    );
    expect(kpi.hasTypeField).toBe(true);
    expect(kpi.outstandingByType.ACTION).toBe(1);
    expect(kpi.outstandingByType.PHYSICAL).toBe(1);
    expect(kpi.outstandingByType.CLOSEOUT).toBe(1);
    expect(kpi.outstanding).toBe(3);
  });

  it('excludes CLOSEOUT submittals when engagement is not in closeout', () => {
    const kpi = computeSubmittalKpi(
      [{ status: 'SUBMITTED', submittal_type: 'CLOSEOUT' }],
      { engagementInCloseout: false, now },
    );
    expect(kpi.outstanding).toBe(0);
  });

  it('treats KULA_GLASS ball_in_court rows as ours', () => {
    const kpi = computeSubmittalKpi(
      [
        { status: 'PENDING', ...{ ball_in_court: 'KULA_GLASS' } },
        { status: 'SUBMITTED', ...{ ball_in_court: 'GC' } },
      ] as unknown as Parameters<typeof computeSubmittalKpi>[0],
      { engagementInCloseout: false, now },
    );
    expect(kpi.ballInCourtUs).toBe(1);
  });
});

describe('BAN-347 computeRfiKpi (§6.5 logic)', () => {
  const now = FROZEN_NOW;

  it('counts open SUBMITTED + UNDER_REVIEW', () => {
    const kpi = computeRfiKpi(
      [
        { status: 'SUBMITTED' },
        { status: 'UNDER_REVIEW' },
        { status: 'ANSWERED' },
        { status: 'RESOLVED' },
        { status: 'CLOSED' },
      ],
      { now },
    );
    expect(kpi.open).toBe(2);
  });

  it('flags overdue when required_response_by_date passed and status open', () => {
    const kpi = computeRfiKpi(
      [
        { status: 'SUBMITTED', required_response_by_date: '2026-05-01' },
        { status: 'UNDER_REVIEW', required_response_by_date: '2099-12-31' },
        { status: 'ANSWERED', required_response_by_date: '2025-01-01' },
      ],
      { now },
    );
    expect(kpi.overdue).toBe(1);
  });

  it('counts recently answered within the 7d default window', () => {
    const kpi = computeRfiKpi(
      [
        { status: 'ANSWERED', response_received_at: '2026-05-18T00:00:00Z' },
        { status: 'ANSWERED', response_received_at: '2026-05-15T00:00:00Z' },
        { status: 'ANSWERED', response_received_at: '2026-05-10T00:00:00Z' },
        { status: 'ANSWERED', response_received_at: '2026-04-30T00:00:00Z' },
      ],
      { now },
    );
    expect(kpi.recentlyAnswered).toBe(2);
  });

  it('alternate required_response_by spelling still triggers overdue', () => {
    const kpi = computeRfiKpi(
      [{ status: 'SUBMITTED', required_response_by: '2026-04-01' }],
      { now },
    );
    expect(kpi.overdue).toBe(1);
  });

  it('honours custom recentDays window', () => {
    const kpi = computeRfiKpi(
      [
        { status: 'ANSWERED', response_received_at: '2026-05-17T00:00:00Z' },
        { status: 'ANSWERED', response_received_at: '2026-05-10T00:00:00Z' },
      ],
      { now, recentDays: 3 },
    );
    expect(kpi.recentlyAnswered).toBe(1);
  });
});

describe('BAN-347 topOpenActionItems', () => {
  it('limits to 5 and sorts URGENT/HIGH first then newest', () => {
    const items = [
      { action_item_id: 'a', title: 'A', status: 'OPEN', priority: 'LOW',    created_at: '2026-05-01T00:00:00Z' },
      { action_item_id: 'b', title: 'B', status: 'OPEN', priority: 'URGENT', created_at: '2026-05-01T00:00:00Z' },
      { action_item_id: 'c', title: 'C', status: 'OPEN', priority: 'URGENT', created_at: '2026-05-10T00:00:00Z' },
      { action_item_id: 'd', title: 'D', status: 'COMPLETED', priority: 'URGENT', created_at: '2026-05-19T00:00:00Z' },
      { action_item_id: 'e', title: 'E', status: 'IN_PROGRESS', priority: 'HIGH', created_at: '2026-05-09T00:00:00Z' },
      { action_item_id: 'f', title: 'F', status: 'OPEN', priority: 'MEDIUM', created_at: '2026-05-15T00:00:00Z' },
      { action_item_id: 'g', title: 'G', status: 'OPEN', priority: 'MEDIUM', created_at: '2026-05-14T00:00:00Z' },
    ];
    const top = topOpenActionItems(items, 5);
    expect(top.map((t) => t.action_item_id)).toEqual(['c', 'b', 'e', 'f', 'g']);
    expect(top.find((t) => t.action_item_id === 'd')).toBeUndefined();
  });
});

describe('BAN-347 topRecentDocuments', () => {
  it('filters out non-current and sorts newest first', () => {
    const docs = [
      { document_id: '1', filename: 'old.pdf',     kind: 'CONTRACT', uploaded_at: '2026-04-01T00:00:00Z', is_current: true },
      { document_id: '2', filename: 'newer.pdf',   kind: 'RFI_TRANSMITTAL', uploaded_at: '2026-05-10T00:00:00Z', is_current: true },
      { document_id: '3', filename: 'stale.pdf',   kind: 'PAY_APP_PDF', uploaded_at: '2026-05-12T00:00:00Z', is_current: false },
      { document_id: '4', filename: 'newest.pdf',  kind: 'CONTRACT', uploaded_at: '2026-05-18T00:00:00Z', is_current: true },
    ];
    const top = topRecentDocuments(docs, 5);
    expect(top.map((d) => d.document_id)).toEqual(['4', '2', '1']);
  });
});

describe('BAN-347 computeFinancialSummary', () => {
  it('returns zeros for empty pay app list', () => {
    const f = computeFinancialSummary([]);
    expect(f.contractSum).toBe(0);
    expect(f.contractSumSource).toBe('none');
    expect(f.currentPayApp).toBeNull();
    expect(f.outstandingAr).toBe(0);
    expect(f.payAppCount).toBe(0);
  });

  it('picks contract sum from latest pay app and sums unpaid AR', () => {
    const f = computeFinancialSummary([
      { pay_app_id: 'p1', pay_app_number: 1, state: 'PAID_FULL', current_amount_due: '10000', contract_sum_to_date: '100000' },
      { pay_app_id: 'p2', pay_app_number: 2, state: 'SUBMITTED', current_amount_due: '15000', contract_sum_to_date: '105000' },
      { pay_app_id: 'p3', pay_app_number: 3, state: 'PENDING_DRAFT', current_amount_due: '20000', contract_sum_to_date: '125000' },
    ]);
    expect(f.contractSum).toBe(125000);
    expect(f.contractSumSource).toBe('pay_app_to_date');
    expect(f.currentPayApp?.pay_app_number).toBe(3);
    expect(f.outstandingAr).toBe(35000);
    expect(f.payAppCount).toBe(3);
  });

  it('falls back to contract_sum_original when to-date is zero', () => {
    const f = computeFinancialSummary([
      { pay_app_id: 'p1', pay_app_number: 1, state: 'PENDING_DRAFT', current_amount_due: '0', contract_sum_to_date: '0', contract_sum_original: '85000' },
    ]);
    expect(f.contractSum).toBe(85000);
    expect(f.contractSumSource).toBe('pay_app_original');
  });
});

describe('BAN-347 buildActivityTicker', () => {
  it('caps to 10 and normalises Sheet + Postgres event shapes', () => {
    const rows = [
      { event_id: '1', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-19T08:00:00Z', performedBy: 'Frank', notes: 'Stage 1' },
      { id: '2', type: 'FIELD_ISSUE', occurredAt: '2026-05-18T09:00:00Z', performedBy: 'Joey', note: 'Caulk gap' },
      { event_id: '3', event_type: 'PHOTO_ONLY', event_occurred_at: '2026-05-17T09:00:00Z', performedBy: 'Tia', notes: '' },
      { event_id: '4', event_type: 'NOTE', event_occurred_at: '2026-05-16T09:00:00Z', performedBy: '', notes: 'misc' },
      { event_id: '5', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-15T09:00:00Z' },
      { event_id: '6', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-14T09:00:00Z' },
      { event_id: '7', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-13T09:00:00Z' },
      { event_id: '8', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-12T09:00:00Z' },
      { event_id: '9', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-11T09:00:00Z' },
      { event_id: '10', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-10T09:00:00Z' },
      { event_id: '11', event_type: 'INSTALL_STEP', event_occurred_at: '2026-05-09T09:00:00Z' },
    ];
    const ticker = buildActivityTicker(rows, 10);
    expect(ticker).toHaveLength(10);
    expect(ticker[0]).toMatchObject({ id: '1', eventType: 'INSTALL_STEP', actor: 'Frank', summary: 'Stage 1' });
    expect(ticker[1]).toMatchObject({ id: '2', eventType: 'FIELD_ISSUE', summary: 'Caulk gap' });
    expect(ticker[1].occurredAt).toBe('2026-05-18T09:00:00Z');
  });

  it('truncates summary to 140 chars', () => {
    const long = 'x'.repeat(300);
    const [entry] = buildActivityTicker([{ event_id: '1', event_type: 'NOTE', event_occurred_at: '2026-05-19T08:00:00Z', notes: long }], 10);
    expect(entry.summary).toHaveLength(140);
  });
});
