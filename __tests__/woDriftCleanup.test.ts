import {
  buildIslandBackfillDryRunReport,
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
  it('selects only approved island backfill candidates', () => {
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

  it('renders stop gate markdown', () => {
    const report = buildIslandBackfillDryRunReport([baseRow], 50, '2026-05-12T00:00:00.000Z');
    const markdown = renderIslandBackfillDryRunMarkdown(report);

    expect(markdown).toContain('Phase 2 Island Backfill Dry-Run');
    expect(markdown).toContain('STOP. Full execution must not run');
  });
});
