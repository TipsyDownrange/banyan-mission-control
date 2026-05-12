import {
  buildWoDriftCategorizationReport,
  categorizeWoDriftRow,
  renderWoDriftCategorizationMarkdown,
  WoDriftRow,
} from '@/scripts/wo_drift_categorizer';

const baseRow: WoDriftRow = {
  tenant_id: '00000000-0000-0000-0000-000000000001',
  run_id: 'run-1',
  wo_id: 'WO-26-8300',
  diff_class: 'field_drift',
  field_name: 'customer_name',
  field_key: 'customer_name',
  sheets_value: 'Luz Ann',
  postgres_value: 'Luz Ann',
  normalization_applied: 'trim_null_empty',
};

function row(overrides: Partial<WoDriftRow>): WoDriftRow {
  return { ...baseRow, ...overrides };
}

describe('WO drift categorizer', () => {
  it('classifies BAN-186 legacy QBO remap before generic blank/ahead categories', () => {
    const result = categorizeWoDriftRow(row({
      field_key: 'created_at',
      sheets_value: '',
      postgres_value: '2026-05-09',
      normalization_applied: 'ban_186_legacy_qbo_remap',
    }));

    expect(result.category).toBe('legacy_qbo_header_remap');
    expect(result.remediation_lane).toBe('manual_review');
  });

  it('classifies SWO 47-vs-32 expansion fields as manual-review gap data', () => {
    const result = categorizeWoDriftRow(row({
      field_key: 'legacy_wo_ids',
      sheets_value: 'WO-19CA9E45',
      postgres_value: '',
      normalization_applied: 'trim_null_empty',
    }));

    expect(result.category).toBe('missing_47_vs_32_column_data');
    expect(result.remediation_lane).toBe('manual_review');
  });

  it('classifies common safe normalization buckets', () => {
    expect(categorizeWoDriftRow(row({ sheets_value: ' Maui ', postgres_value: 'Maui' })).category).toBe('whitespace_trim');
    expect(categorizeWoDriftRow(row({ sheets_value: 'Maui', postgres_value: 'maui' })).category).toBe('case_only');
    expect(categorizeWoDriftRow(row({ field_key: 'quote_total', sheets_value: '1,000.00', postgres_value: '1000', normalization_applied: 'numeric' })).category).toBe('numeric_format');
    expect(categorizeWoDriftRow(row({ field_key: 'due_date', sheets_value: '2026-05-12T08:00:00', postgres_value: '2026-05-12', normalization_applied: 'date_iso' })).category).toBe('date_format_inconsistency');
    expect(categorizeWoDriftRow(row({ field_key: 'contact_phone', sheets_value: '(808) 555-1212', postgres_value: '8085551212' })).category).toBe('phone_format');
  });

  it('distinguishes sheets-ahead, postgres-ahead, and true conflicts', () => {
    expect(categorizeWoDriftRow(row({ sheets_value: 'Lahaina', postgres_value: '' })).category).toBe('sheets_ahead_of_postgres');
    expect(categorizeWoDriftRow(row({ sheets_value: '', postgres_value: 'unknown' })).category).toBe('postgres_ahead_of_sheets');
    expect(categorizeWoDriftRow(row({ sheets_value: 'Lahaina', postgres_value: 'Kihei' })).category).toBe('true_data_conflict');
  });

  it('builds deterministic category and field summaries', () => {
    const report = buildWoDriftCategorizationReport([
      row({ field_key: 'legacy_wo_ids', sheets_value: 'WO-1', postgres_value: '' }),
      row({ field_key: 'area_of_island', sheets_value: 'Kihei', postgres_value: '' }),
      row({ field_key: 'area_of_island', sheets_value: 'Lahaina', postgres_value: '' }),
    ], '2026-05-12T00:00:00.000Z');

    expect(report.total_rows).toBe(3);
    expect(report.category_summaries.map(item => [item.category, item.count])).toEqual([
      ['sheets_ahead_of_postgres', 2],
      ['missing_47_vs_32_column_data', 1],
    ]);
    expect(report.field_summaries[0]).toEqual({ field_key: 'area_of_island', count: 2 });
  });

  it('renders markdown with the stop gate', () => {
    const report = buildWoDriftCategorizationReport([row({ sheets_value: 'Lahaina', postgres_value: '' })], '2026-05-12T00:00:00.000Z');
    const markdown = renderWoDriftCategorizationMarkdown(report);

    expect(markdown).toContain('Read-only confirmation');
    expect(markdown).toContain('Do not run cleanup/remediation until Sean approves');
  });
});
