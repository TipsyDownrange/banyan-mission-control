import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

export type WoDriftCategory =
  | 'whitespace_trim'
  | 'case_only'
  | 'date_format_inconsistency'
  | 'date_parse_failed'
  | 'phone_format'
  | 'numeric_format'
  | 'boolean_encoding'
  | 'empty_string_vs_null'
  | 'legacy_qbo_header_remap'
  | 'missing_47_vs_32_column_data'
  | 'postgres_ahead_of_sheets'
  | 'sheets_ahead_of_postgres'
  | 'test_dummy_data_pollution'
  | 'json_structural'
  | 'true_data_conflict';

export type RemediationLane = 'auto_fix_candidate' | 'accept_or_backfill_candidate' | 'manual_review' | 'escalate';

export interface WoDriftRow {
  tenant_id?: string | null;
  run_id: string;
  wo_id: string;
  diff_class: string;
  field_name?: string | null;
  field_key: string;
  sheets_value?: string | null;
  postgres_value?: string | null;
  normalization_applied?: string | null;
}

export interface CategorizedWoDriftRow extends WoDriftRow {
  category: WoDriftCategory;
  remediation_lane: RemediationLane;
  rationale: string;
}

export interface WoDriftCategorySummary {
  category: WoDriftCategory;
  count: number;
  remediation_lane: RemediationLane;
  pct: number;
  top_fields: Array<{ field_key: string; count: number }>;
  examples: Array<Pick<CategorizedWoDriftRow, 'wo_id' | 'field_key' | 'sheets_value' | 'postgres_value' | 'normalization_applied' | 'rationale'>>;
}

export interface WoDriftCategorizationReport {
  generated_at: string;
  mode: string;
  no_write_confirmation: string[];
  total_rows: number;
  run_ids: string[];
  category_summaries: WoDriftCategorySummary[];
  field_summaries: Array<{ field_key: string; count: number }>;
  rows: CategorizedWoDriftRow[];
}

const CATEGORY_LANES: Record<WoDriftCategory, RemediationLane> = {
  whitespace_trim: 'auto_fix_candidate',
  case_only: 'auto_fix_candidate',
  date_format_inconsistency: 'auto_fix_candidate',
  date_parse_failed: 'manual_review',
  phone_format: 'auto_fix_candidate',
  numeric_format: 'auto_fix_candidate',
  boolean_encoding: 'auto_fix_candidate',
  empty_string_vs_null: 'auto_fix_candidate',
  legacy_qbo_header_remap: 'manual_review',
  missing_47_vs_32_column_data: 'manual_review',
  postgres_ahead_of_sheets: 'accept_or_backfill_candidate',
  sheets_ahead_of_postgres: 'accept_or_backfill_candidate',
  test_dummy_data_pollution: 'escalate',
  json_structural: 'manual_review',
  true_data_conflict: 'manual_review',
};

const MISSING_47_VS_32_FIELDS = new Set([
  'Customer_ID',
  'customer_id',
  'Legacy_Flag',
  'legacy_flag',
  'legacy_wo_ids',
  'requires_org_assignment',
]);

const PHONE_FIELDS = new Set(['contact_phone', 'phone', 'customer_phone']);
const BOOLEAN_FIELDS = new Set(['requires_org_assignment', 'legacy_flag']);

export function categorizeWoDriftRow(row: WoDriftRow): CategorizedWoDriftRow {
  const sheetsRaw = row.sheets_value ?? '';
  const pgRaw = row.postgres_value ?? '';
  const sheets = String(sheetsRaw);
  const pg = String(pgRaw);
  const sheetsTrimmed = sheets.trim();
  const pgTrimmed = pg.trim();
  const normalization = String(row.normalization_applied || '');
  const fieldKey = String(row.field_key || row.field_name || 'unknown');

  let category: WoDriftCategory;
  let rationale: string;

  if (isLikelyTestData(row.wo_id, sheets, pg)) {
    category = 'test_dummy_data_pollution';
    rationale = 'WO id or value appears to be staging/test/dummy data.';
  } else if (normalization === 'json_structural' || looksJsonish(sheetsTrimmed) || looksJsonish(pgTrimmed)) {
    category = 'json_structural';
    rationale = 'JSON/structural value differs and needs shape-aware review.';
  } else if (normalization.includes('ban_186_legacy_qbo_remap')) {
    category = 'legacy_qbo_header_remap';
    rationale = 'Diff came from known BAN-186 legacy QBO/header remap normalization.';
  } else if (normalization === 'date_parse_failed') {
    category = 'date_parse_failed';
    rationale = 'Date normalization failed; needs row-level review.';
  } else if (MISSING_47_VS_32_FIELDS.has(fieldKey)) {
    category = 'missing_47_vs_32_column_data';
    rationale = 'Field belongs to the SWO 47-column expansion / Postgres 32-column gap surface.';
  } else if (isBlankish(sheets) && isBlankish(pg)) {
    category = 'empty_string_vs_null';
    rationale = 'Both sides are blank-ish but represented differently.';
  } else if (sheetsTrimmed && !pgTrimmed) {
    category = 'sheets_ahead_of_postgres';
    rationale = 'Sheets has a value and Postgres is blank; treat as backfill/acceptance decision, not a pure format fix.';
  } else if (!sheetsTrimmed && pgTrimmed) {
    category = 'postgres_ahead_of_sheets';
    rationale = 'Postgres has a value and Sheets is blank; treat as acceptance/backfill decision, not a pure format fix.';
  } else if (PHONE_FIELDS.has(fieldKey) && looksPhonePair(sheetsTrimmed, pgTrimmed)) {
    category = 'phone_format';
    rationale = 'Both sides have phone-field values that differ by phone formatting.';
  } else if (BOOLEAN_FIELDS.has(fieldKey) || isBooleanPair(sheetsTrimmed, pgTrimmed)) {
    category = 'boolean_encoding';
    rationale = 'Boolean-like values differ by encoding.';
  } else if (sheetsTrimmed === pgTrimmed && sheets !== pg) {
    category = 'whitespace_trim';
    rationale = 'Values match after trim.';
  } else if (sheetsTrimmed.toLowerCase() === pgTrimmed.toLowerCase() && sheetsTrimmed !== pgTrimmed) {
    category = 'case_only';
    rationale = 'Values match case-insensitively.';
  } else if (normalization === 'numeric' || numericEquivalent(sheetsTrimmed, pgTrimmed)) {
    category = 'numeric_format';
    rationale = 'Both sides have numeric values that differ only by numeric formatting/precision.';
  } else if (normalization === 'date_iso' || dateEquivalent(sheetsTrimmed, pgTrimmed)) {
    category = 'date_format_inconsistency';
    rationale = 'Both sides have date-like values that differ by format or timezone normalization.';
  } else {
    category = 'true_data_conflict';
    rationale = 'Both sides have materially different non-empty values.';
  }

  return {
    ...row,
    category,
    remediation_lane: CATEGORY_LANES[category],
    rationale,
  };
}

export function buildWoDriftCategorizationReport(rows: WoDriftRow[], generatedAt = new Date().toISOString()): WoDriftCategorizationReport {
  const categorized = rows.map(categorizeWoDriftRow);
  const total = categorized.length;
  const byCategory = new Map<WoDriftCategory, CategorizedWoDriftRow[]>();
  const byField = new Map<string, number>();

  for (const row of categorized) {
    const bucket = byCategory.get(row.category) || [];
    bucket.push(row);
    byCategory.set(row.category, bucket);
    byField.set(row.field_key, (byField.get(row.field_key) || 0) + 1);
  }

  const category_summaries = Array.from(byCategory.entries())
    .map(([category, bucket]) => ({
      category,
      count: bucket.length,
      remediation_lane: CATEGORY_LANES[category],
      pct: pct(bucket.length, total),
      top_fields: topCounts(bucket.map(row => row.field_key), 10).map(([field_key, count]) => ({ field_key, count })),
      examples: bucket.slice(0, 5).map(row => ({
        wo_id: row.wo_id,
        field_key: row.field_key,
        sheets_value: row.sheets_value,
        postgres_value: row.postgres_value,
        normalization_applied: row.normalization_applied,
        rationale: row.rationale,
      })),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  const field_summaries = Array.from(byField.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field_key, count]) => ({ field_key, count }));

  return {
    generated_at: generatedAt,
    mode: 'READ ONLY categorization of existing wo_drift_row_diffs evidence; no DB/Sheets writes',
    no_write_confirmation: [
      'SELECT-only when --database-url/env DB mode is used.',
      'No INSERT/UPDATE/DELETE statements are present in this script.',
      'No Google Sheets, QBO, Drive, Gmail, or Calendar mutation APIs are called.',
      'Output is local report files only; Drive filing is performed by Kai after review.',
    ],
    total_rows: total,
    run_ids: Array.from(new Set(categorized.map(row => row.run_id))).sort(),
    category_summaries,
    field_summaries,
    rows: categorized,
  };
}

export function renderWoDriftCategorizationMarkdown(report: WoDriftCategorizationReport): string {
  const lines: string[] = [];
  lines.push('# Packet 006 / BAN-196 — WO Drift Categorization Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push('## Read-only confirmation');
  lines.push('');
  for (const item of report.no_write_confirmation) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total drift rows categorized: ${report.total_rows}`);
  lines.push(`- Run IDs: ${report.run_ids.join(', ') || 'none'}`);
  lines.push('');
  lines.push('| Category | Count | % | Lane | Top fields |');
  lines.push('|---|---:|---:|---|---|');
  for (const summary of report.category_summaries) {
    lines.push(`| ${summary.category} | ${summary.count} | ${summary.pct} | ${summary.remediation_lane} | ${summary.top_fields.map(item => `${item.field_key} (${item.count})`).join(', ')} |`);
  }
  lines.push('');
  lines.push('## Field counts');
  lines.push('');
  lines.push('| Field | Count |');
  lines.push('|---|---:|');
  for (const field of report.field_summaries) lines.push(`| ${field.field_key} | ${field.count} |`);
  lines.push('');
  lines.push('## Category examples');
  lines.push('');
  for (const summary of report.category_summaries) {
    lines.push(`### ${summary.category}`);
    lines.push('');
    lines.push(`Lane: ${summary.remediation_lane}; Count: ${summary.count}`);
    lines.push('');
    for (const example of summary.examples) {
      lines.push(`- ${example.wo_id} / ${example.field_key}: Sheets=${quote(example.sheets_value)} Postgres=${quote(example.postgres_value)} normalization=${quote(example.normalization_applied)} — ${example.rationale}`);
    }
    lines.push('');
  }
  lines.push('## Stop / approval gate');
  lines.push('');
  lines.push('This is Phase 1 read-only categorization only. Do not run cleanup/remediation until Sean approves per-category remediation.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const rows = args.input ? readRowsFromJson(args.input) : await readRowsFromDatabase(args.databaseUrl);
  const report = buildWoDriftCategorizationReport(rows, generatedAt);
  const out = args.out || path.join(process.cwd(), 'wo_drift_categorization_report.md');
  const jsonOut = args.jsonOut || out.replace(/\.md$/i, '.json');
  fs.writeFileSync(out, renderWoDriftCategorizationMarkdown(report));
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ rows: report.total_rows, out, jsonOut, categories: report.category_summaries.map(s => ({ category: s.category, count: s.count })) }, null, 2));
}

function parseArgs(argv: string[]) {
  const get = (name: string) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return {
    input: get('input'),
    out: get('out'),
    jsonOut: get('json-out'),
    databaseUrl: get('database-url') || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL,
  };
}

function readRowsFromJson(input: string): WoDriftRow[] {
  const parsed = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`Expected ${input} to contain an array of wo_drift_row_diffs rows.`);
  return parsed as WoDriftRow[];
}

async function readRowsFromDatabase(databaseUrl?: string): Promise<WoDriftRow[]> {
  if (!databaseUrl) throw new Error('Missing --input or --database-url/DATABASE_URL/SUPABASE_DB_URL/POSTGRES_URL.');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<WoDriftRow>(`
      select tenant_id::text, run_id::text, wo_id, diff_class, field_name, field_key, sheets_value, postgres_value, normalization_applied
      from public.wo_drift_row_diffs
      order by wo_id, field_key
    `);
    return result.rows;
  } finally {
    await client.end();
  }
}

function topCounts(values: string[], limit: number): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function pct(count: number, total: number): number {
  return total ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function quote(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `\`${text.replace(/`/g, '\\`').slice(0, 120)}\``;
}

function isBlankish(value: string): boolean {
  return value === '' || value.trim() === '' || /^null$/i.test(value.trim());
}

function numericEquivalent(left: string, right: string): boolean {
  if (!left || !right) return false;
  const a = Number(left.replace(/[,$]/g, ''));
  const b = Number(right.replace(/[,$]/g, ''));
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.000001 && left !== right;
}

function dateEquivalent(left: string, right: string): boolean {
  if (!left || !right) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const day = 24 * 60 * 60 * 1000;
  return Math.abs(a - b) < day;
}

function looksPhonePair(left: string, right: string): boolean {
  const a = digits(left);
  const b = digits(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

function isBooleanPair(left: string, right: string): boolean {
  const a = normalizeBoolean(left);
  const b = normalizeBoolean(right);
  return a !== null && b !== null && a === b && left !== right;
}

function normalizeBoolean(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (['true', 't', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'f', 'no', 'n', '0'].includes(v)) return false;
  return null;
}

function looksJsonish(value: string): boolean {
  return (value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'));
}

function isLikelyTestData(...values: string[]): boolean {
  return values.some(value => /\b(test|dummy|sample|fake)\b/i.test(value) || /WO-STAGE/i.test(value));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
