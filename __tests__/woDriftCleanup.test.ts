import {
  buildApprovedIslandMappingDryRunReport,
  buildIslandBackfillDryRunReport,
  renderApprovedIslandMappingDryRunMarkdown,
  renderIslandBackfillDryRunMarkdown,
  selectIslandBackfillCandidates,
} from '@/scripts/wo_drift_cleanup';

const baseRow = {
  tenant_id: '00000000-0000-0000-0000-000000000001',
  run_id: 'run-1',
  wo_id: 'WO-26-8300',
  diff_class: 'field_drift',
  field_name: 'island',
  field_key: 'island',
  sheets_value: 'Kihei',
  postgres_value: 'unknown',
  normalization_applied: 'case_insensitive_trim_null_empty',
  category: 'true_data_conflict',
  remediation_lane: 'manual_review',
  rationale: 'Both sides have materially different non-empty values.',
};

describe('WO drift cleanup dry-run', () => {
  it('selects only old unknown-island backfill candidates', () => {
    const candidates = selectIslandBackfillCandidates([
      baseRow,
      { ...baseRow, wo_id: 'WO-26-8301', field_key: 'status', sheets_value: 'scheduled', postgres_value: 'lead' },
      { ...baseRow, wo_id: 'WO-26-8302', category: 'sheets_ahead_of_postgres', postgres_value: '' },
      { ...baseRow, wo_id: 'WO-26-8303', postgres_value: 'maui' },
    ]);

    expect(candidates.map(row => row.wo_id)).toEqual(['WO-26-8300']);
  });

  it('dry-runs literal sheets value and flags enum blocker for area labels', () => {
    const report = buildIslandBackfillDryRunReport([
      baseRow,
      { ...baseRow, wo_id: 'WO-26-8301', sheets_value: 'Wailuku' },
      { ...baseRow, wo_id: 'WO-26-8302', sheets_value: 'maui' },
    ], 100, '2026-05-12T00:00:00.000Z');

    expect(report.island_true_conflicts_total).toBe(3);
    expect(report.island_backfill_candidates_total).toBe(3);
    expect(report.island_backfill_excluded_total).toBe(0);
    expect(report.requested_literal_valid_count).toBe(1);
    expect(report.requested_literal_invalid_count).toBe(2);
    expect(report.suggested_canonical_counts).toEqual({ maui: 3 });
    expect(report.total_candidate_suggested_canonical_counts).toEqual({ maui: 3 });
    expect(report.blocker).toContain('island_code enum');
  });

  it('builds approved mapping dry-run with Maui, Big Island, junk, and Lanai disambiguation', () => {
    const rows = [
      baseRow,
      { ...baseRow, wo_id: 'WO-26-8301', sheets_value: 'Hawaii', postgres_value: 'big_island' },
      { ...baseRow, wo_id: 'WO-26-8302', sheets_value: 'pick up only' },
      { ...baseRow, wo_id: 'WO-26-8303', sheets_value: 'Lanai / Molokai' },
    ];
    const report = buildApprovedIslandMappingDryRunReport(rows, [
      { kid: 'WO-26-8303', legacy_payload: { address_raw: 'Lanai City, HI' } },
    ], '2026-05-12T00:00:00.000Z');

    expect(report.proposed_update_count).toBe(3);
    expect(report.leave_unknown_count).toBe(1);
    expect(report.manual_review_count).toBe(0);
    expect(report.proposed_update_counts_by_target).toEqual({ maui: 1, big_island: 1, lanai: 1 });
  });

  it('keeps unresolved Lanai/Molokai rows in manual review', () => {
    const report = buildApprovedIslandMappingDryRunReport([
      { ...baseRow, sheets_value: 'Lanai / Molokai' },
    ], [], '2026-05-12T00:00:00.000Z');

    expect(report.proposed_update_count).toBe(0);
    expect(report.manual_review_count).toBe(1);
  });

  it('renders both stop-gate markdown reports', () => {
    const report = buildIslandBackfillDryRunReport([baseRow], 50, '2026-05-12T00:00:00.000Z');
    const markdown = renderIslandBackfillDryRunMarkdown(report);
    const approvedReport = buildApprovedIslandMappingDryRunReport([baseRow], [], '2026-05-12T00:00:00.000Z');
    const approvedMarkdown = renderApprovedIslandMappingDryRunMarkdown(approvedReport);

    expect(markdown).toContain('Phase 2 Island Backfill Dry-Run');
    expect(markdown).toContain('STOP. Full execution must not run');
    expect(approvedMarkdown).toContain('Phase 2 Island Mapping Dry-Run #2');
    expect(approvedMarkdown).toContain('STOP. Full execution must not run');
  });
});
