import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

interface CategorizedRow {
  tenant_id?: string | null;
  run_id: string;
  wo_id: string;
  diff_class: string;
  field_name?: string | null;
  field_key: string;
  sheets_value?: string | null;
  postgres_value?: string | null;
  normalization_applied?: string | null;
  category?: string;
  remediation_lane?: string;
  rationale?: string;
}

interface CategorizationReport {
  rows: CategorizedRow[];
}

interface IslandDryRunRow {
  wo_id: string;
  field_key: string;
  before_value: string;
  requested_after_value: string;
  requested_after_is_valid_enum: boolean;
  suggested_canonical_after_value: string | null;
  suggested_requires_approval: boolean;
  status: 'ready_if_canonical_mapping_approved' | 'blocked_literal_value_invalid' | 'manual_review';
  reason: string;
}

interface IslandDryRunReport {
  generated_at: string;
  cleanup_run_id: string;
  mode: 'dry-run';
  write_confirmation: string[];
  source_rows_total: number;
  island_true_conflicts_total: number;
  island_backfill_candidates_total: number;
  island_backfill_excluded_total: number;
  dry_run_limit: number;
  dry_run_rows_count: number;
  requested_literal_valid_count: number;
  requested_literal_invalid_count: number;
  suggested_canonical_counts: Record<string, number>;
  total_candidate_suggested_canonical_counts: Record<string, number>;
  blocker: string | null;
  rows: IslandDryRunRow[];
}

const ISLAND_ENUM = new Set(['maui', 'kauai', 'oahu', 'big_island', 'lanai', 'molokai', 'unknown']);

const MAUI_AREA_VALUES = new Set([
  'kihei',
  'kahului',
  'wailuku',
  'lahaina',
  'kula/makawao',
  'haiku /hana/paia',
  'haiku /hana/paia',
  'makawao',
  'kula',
  'upcountry / haiku',
  'paia',
  'haiku',
  'hana',
  'maalaea',
]);

export function selectIslandBackfillCandidates(rows: CategorizedRow[]): CategorizedRow[] {
  return rows
    .filter(row => row.category === 'true_data_conflict')
    .filter(row => row.field_key === 'island')
    .filter(row => String(row.postgres_value || '').trim().toLowerCase() === 'unknown')
    .filter(row => Boolean(String(row.sheets_value || '').trim()))
    .sort((a, b) => a.wo_id.localeCompare(b.wo_id));
}

export function buildIslandBackfillDryRunReport(rows: CategorizedRow[], limit = 100, generatedAt = new Date().toISOString()): IslandDryRunReport {
  const islandTrueConflicts = rows
    .filter(row => row.category === 'true_data_conflict')
    .filter(row => row.field_key === 'island');
  const candidates = selectIslandBackfillCandidates(rows);
  const limited = candidates.slice(0, limit);
  const dryRunRows = limited.map(toDryRunRow);
  const allCandidateDryRows = candidates.map(toDryRunRow);
  const requestedLiteralValidCount = dryRunRows.filter(row => row.requested_after_is_valid_enum).length;
  const requestedLiteralInvalidCount = dryRunRows.length - requestedLiteralValidCount;
  const suggestedCanonicalCounts: Record<string, number> = {};
  const totalCandidateSuggestedCanonicalCounts: Record<string, number> = {};

  for (const row of dryRunRows) {
    const key = row.suggested_canonical_after_value || 'manual_review';
    suggestedCanonicalCounts[key] = (suggestedCanonicalCounts[key] || 0) + 1;
  }
  for (const row of allCandidateDryRows) {
    const key = row.suggested_canonical_after_value || 'manual_review';
    totalCandidateSuggestedCanonicalCounts[key] = (totalCandidateSuggestedCanonicalCounts[key] || 0) + 1;
  }

  return {
    generated_at: generatedAt,
    cleanup_run_id: randomUUID(),
    mode: 'dry-run',
    write_confirmation: [
      'No database writes are performed by dry-run mode.',
      'No production Sheets writes are performed.',
      'No service_work_orders schema changes are performed by this script.',
      'The audit table migration is authored separately and is not applied by dry-run mode.',
    ],
    source_rows_total: rows.length,
    island_true_conflicts_total: islandTrueConflicts.length,
    island_backfill_candidates_total: candidates.length,
    island_backfill_excluded_total: islandTrueConflicts.length - candidates.length,
    dry_run_limit: limit,
    dry_run_rows_count: dryRunRows.length,
    requested_literal_valid_count: requestedLiteralValidCount,
    requested_literal_invalid_count: requestedLiteralInvalidCount,
    suggested_canonical_counts: suggestedCanonicalCounts,
    total_candidate_suggested_canonical_counts: totalCandidateSuggestedCanonicalCounts,
    blocker: requestedLiteralInvalidCount > 0
      ? 'Requested literal update service_work_orders.island = sheets_value is not executable for these rows because service_work_orders.island is island_code enum and Sheets values are mostly Maui area/town labels. Full execution needs explicit approval to map these area labels to canonical enum values, likely maui, or a different target column/DDL decision.'
      : null,
    rows: dryRunRows,
  };
}

function toDryRunRow(row: CategorizedRow): IslandDryRunRow {
  const requested = String(row.sheets_value || '').trim();
  const normalizedRequested = requested.toLowerCase();
  const requestedValid = ISLAND_ENUM.has(normalizedRequested);
  const suggested = requestedValid ? normalizedRequested : suggestCanonicalIsland(requested);

  let status: IslandDryRunRow['status'] = 'blocked_literal_value_invalid';
  let reason = `Requested literal value ${requested} is not valid for island_code enum.`;

  if (requestedValid) {
    status = 'ready_if_canonical_mapping_approved';
    reason = 'Requested value is already a valid island_code enum value.';
  } else if (suggested) {
    status = 'ready_if_canonical_mapping_approved';
    reason = `Requested literal value is an area/town label; suggested canonical enum mapping is ${suggested}.`;
  } else {
    status = 'manual_review';
    reason = 'Requested literal value is neither a valid island_code enum nor a known area/town mapping.';
  }

  return {
    wo_id: row.wo_id,
    field_key: row.field_key,
    before_value: String(row.postgres_value || ''),
    requested_after_value: requested,
    requested_after_is_valid_enum: requestedValid,
    suggested_canonical_after_value: suggested,
    suggested_requires_approval: !requestedValid,
    status,
    reason,
  };
}

function suggestCanonicalIsland(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (MAUI_AREA_VALUES.has(normalized)) return 'maui';
  if (normalized === 'lanai') return 'lanai';
  if (normalized === 'molokai') return 'molokai';
  if (normalized === 'hawaii') return 'big_island';
  return null;
}

export function renderIslandBackfillDryRunMarkdown(report: IslandDryRunReport): string {
  const lines: string[] = [];
  lines.push('# Packet 006 / BAN-196 — Phase 2 Island Backfill Dry-Run');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Cleanup run id: ${report.cleanup_run_id}`);
  lines.push('');
  lines.push('## Write confirmation');
  lines.push('');
  for (const item of report.write_confirmation) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Source categorization rows: ${report.source_rows_total}`);
  lines.push(`- Island true conflicts total from Phase 1: ${report.island_true_conflicts_total}`);
  lines.push(`- Island backfill candidates total where Postgres island is \`unknown\`: ${report.island_backfill_candidates_total}`);
  lines.push(`- Island conflicts excluded from requested backfill scope: ${report.island_backfill_excluded_total}`);
  lines.push(`- Dry-run limit: ${report.dry_run_limit}`);
  lines.push(`- Dry-run rows included: ${report.dry_run_rows_count}`);
  lines.push(`- Requested literal values valid for island_code enum: ${report.requested_literal_valid_count}`);
  lines.push(`- Requested literal values invalid for island_code enum: ${report.requested_literal_invalid_count}`);
  lines.push('');
  if (report.blocker) {
    lines.push('## Dry-run blocker');
    lines.push('');
    lines.push(report.blocker);
    lines.push('');
  }
  lines.push('## Suggested canonical mapping counts');
  lines.push('');
  lines.push('### Dry-run sample');
  lines.push('');
  lines.push('| Suggested canonical value | Count |');
  lines.push('|---|---:|');
  for (const [value, count] of Object.entries(report.suggested_canonical_counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${value} | ${count} |`);
  }
  lines.push('');
  lines.push('### All island backfill candidates');
  lines.push('');
  lines.push('| Suggested canonical value | Count |');
  lines.push('|---|---:|');
  for (const [value, count] of Object.entries(report.total_candidate_suggested_canonical_counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${value} | ${count} |`);
  }
  lines.push('');
  lines.push('## Dry-run row diffs');
  lines.push('');
  lines.push('| WO | Before | Requested after | Literal valid? | Suggested canonical after | Status |');
  lines.push('|---|---|---|---|---|---|');
  for (const row of report.rows) {
    lines.push(`| ${row.wo_id} | ${row.before_value} | ${row.requested_after_value} | ${row.requested_after_is_valid_enum ? 'yes' : 'no'} | ${row.suggested_canonical_after_value || 'manual_review'} | ${row.status} |`);
  }
  lines.push('');
  lines.push('## Required approval before full execution');
  lines.push('');
  lines.push('STOP. Full execution must not run until Sean approves the canonical mapping/target-column decision for island backfill.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) throw new Error('Missing --input=<categorization-report.json>.');
  const parsed = JSON.parse(fs.readFileSync(args.input, 'utf8')) as CategorizationReport;
  if (!Array.isArray(parsed.rows)) throw new Error('Input JSON must contain a rows array from wo_drift_categorizer.ts.');

  const report = buildIslandBackfillDryRunReport(parsed.rows, args.limit, new Date().toISOString());
  const out = args.out || path.join(process.cwd(), 'packet_006_phase2_island_backfill_dry_run.md');
  const jsonOut = args.jsonOut || out.replace(/\.md$/i, '.json');
  fs.writeFileSync(out, renderIslandBackfillDryRunMarkdown(report));
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    out,
    jsonOut,
    islandBackfillCandidatesTotal: report.island_backfill_candidates_total,
    dryRunRows: report.dry_run_rows_count,
    requestedLiteralInvalidCount: report.requested_literal_invalid_count,
    blocker: report.blocker,
  }, null, 2));
}

function parseArgs(argv: string[]) {
  const get = (name: string) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const limitRaw = get('limit');
  return {
    input: get('input'),
    out: get('out'),
    jsonOut: get('json-out'),
    limit: limitRaw ? Number(limitRaw) : 100,
  };
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
