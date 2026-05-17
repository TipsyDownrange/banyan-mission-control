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

interface AmbiguousLookupRow {
  kid: string;
  wo_number?: string | null;
  wo_id?: string | null;
  name?: string | null;
  description?: string | null;
  location_notes?: string | null;
  legacy_payload?: Record<string, unknown> | null;
  site_name?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  site_island?: string | null;
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

interface ApprovedIslandMappingRow {
  wo_id: string;
  before_value: string;
  sheets_value: string;
  action: 'update' | 'leave_unknown' | 'manual_review';
  after_value: 'maui' | 'kauai' | 'oahu' | 'big_island' | 'lanai' | 'molokai' | 'unknown' | null;
  reason: string;
  lookup_evidence?: string;
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

interface ApprovedIslandMappingDryRunReport {
  generated_at: string;
  cleanup_run_id: string;
  mode: 'approved-mapping-dry-run';
  write_confirmation: string[];
  source_rows_total: number;
  island_true_conflicts_total: number;
  proposed_update_count: number;
  leave_unknown_count: number;
  manual_review_count: number;
  proposed_update_counts_by_target: Record<string, number>;
  expected_count_reconciliation: string[];
  rows: ApprovedIslandMappingRow[];
}

const ISLAND_ENUM = new Set(['maui', 'kauai', 'oahu', 'big_island', 'lanai', 'molokai', 'unknown']);

const MAUI_AREA_VALUES = new Set([
  'kihei',
  'kahului',
  'wailuku',
  'lahaina',
  'kula/makawao',
  'haiku/hana/paia',
  'makawao',
  'kula',
  'upcountry/haiku',
  'paia',
  'haiku',
  'hana',
  'maalaea',
]);

const JUNK_PICKUP_VALUES = new Set(['pick up only', 'customer pick up', 'for pick up']);

export function selectIslandBackfillCandidates(rows: CategorizedRow[]): CategorizedRow[] {
  return rows
    .filter(row => row.category === 'true_data_conflict')
    .filter(row => row.field_key === 'island')
    .filter(row => String(row.postgres_value || '').trim().toLowerCase() === 'unknown')
    .filter(row => Boolean(String(row.sheets_value || '').trim()))
    .sort((a, b) => a.wo_id.localeCompare(b.wo_id));
}

export function selectIslandTrueConflicts(rows: CategorizedRow[]): CategorizedRow[] {
  return rows
    .filter(row => row.category === 'true_data_conflict')
    .filter(row => row.field_key === 'island')
    .filter(row => Boolean(String(row.sheets_value || '').trim()))
    .sort((a, b) => a.wo_id.localeCompare(b.wo_id));
}

export function buildIslandBackfillDryRunReport(rows: CategorizedRow[], limit = 100, generatedAt = new Date().toISOString()): IslandDryRunReport {
  const islandTrueConflicts = selectIslandTrueConflicts(rows);
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
    write_confirmation: noWriteConfirmation(),
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

export function buildApprovedIslandMappingDryRunReport(
  rows: CategorizedRow[],
  lookupRows: AmbiguousLookupRow[] = [],
  generatedAt = new Date().toISOString(),
): ApprovedIslandMappingDryRunReport {
  const lookupByKid = new Map(lookupRows.map(row => [row.kid, row]));
  const islandRows = selectIslandTrueConflicts(rows);
  const dryRows = islandRows.map(row => toApprovedMappingRow(row, lookupByKid.get(row.wo_id)));
  const proposedUpdateCountsByTarget: Record<string, number> = {};

  for (const row of dryRows) {
    if (row.action === 'update' && row.after_value) {
      proposedUpdateCountsByTarget[row.after_value] = (proposedUpdateCountsByTarget[row.after_value] || 0) + 1;
    }
  }

  return {
    generated_at: generatedAt,
    cleanup_run_id: randomUUID(),
    mode: 'approved-mapping-dry-run',
    write_confirmation: noWriteConfirmation(),
    source_rows_total: rows.length,
    island_true_conflicts_total: islandRows.length,
    proposed_update_count: dryRows.filter(row => row.action === 'update').length,
    leave_unknown_count: dryRows.filter(row => row.action === 'leave_unknown').length,
    manual_review_count: dryRows.filter(row => row.action === 'manual_review').length,
    proposed_update_counts_by_target: proposedUpdateCountsByTarget,
    expected_count_reconciliation: [
      'Sean expected 523 valid updates: 522 maui + 1 big_island, 5 manual_review, 3 junk leave-alone.',
      'Live Phase 1 evidence counts the approved Maui area-label list at 521 rows, not 522.',
      'All 5 Lanai / Molokai rows contain Lanai evidence in address/name fields and therefore resolve to lanai under Sean’s disambiguation rule.',
      'Dry-run #2 therefore proposes 527 updates: 521 maui + 1 big_island + 5 lanai; 3 junk pickup labels remain unknown; 0 manual_review remain after lookup.',
    ],
    rows: dryRows,
  };
}

function noWriteConfirmation(): string[] {
  return [
    'No database writes are performed by dry-run mode.',
    'No production Sheets writes are performed.',
    'No service_work_orders schema changes are performed by this script.',
    'The audit table migration is authored separately and is not applied by dry-run mode.',
  ];
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

function toApprovedMappingRow(row: CategorizedRow, lookup?: AmbiguousLookupRow): ApprovedIslandMappingRow {
  const sheetsValue = String(row.sheets_value || '').trim();
  const normalized = normalizeLabel(sheetsValue);
  const before = String(row.postgres_value || '');

  if (MAUI_AREA_VALUES.has(normalized)) {
    return approvedUpdate(row, before, sheetsValue, 'maui', 'Approved Maui area/town label mapping.');
  }

  if (normalized === 'hawaii') {
    return approvedUpdate(row, before, sheetsValue, 'big_island', 'Approved Hawaii → big_island mapping.');
  }

  if (JUNK_PICKUP_VALUES.has(normalized)) {
    return {
      wo_id: row.wo_id,
      before_value: before,
      sheets_value: sheetsValue,
      action: 'leave_unknown',
      after_value: 'unknown',
      reason: 'Pickup-mode text in island field; leave staging enum as unknown and surface for manual Sheets cleanup.',
    };
  }

  if (normalized === 'lanai/molokai') {
    const evidence = lookupEvidence(lookup);
    const island = resolveLanaiMolokai(evidence);
    if (island) {
      return {
        ...approvedUpdate(row, before, sheetsValue, island, `Disambiguated Lanai/Molokai from address/site/name evidence → ${island}.`),
        lookup_evidence: evidence,
      };
    }
    return {
      wo_id: row.wo_id,
      before_value: before,
      sheets_value: sheetsValue,
      action: 'manual_review',
      after_value: null,
      reason: 'Lanai/Molokai label could not be disambiguated from address/site/name evidence.',
      lookup_evidence: evidence,
    };
  }

  const fallback = suggestCanonicalIsland(sheetsValue);
  if (fallback) return approvedUpdate(row, before, sheetsValue, fallback, 'Fallback canonical island mapping.');

  return {
    wo_id: row.wo_id,
    before_value: before,
    sheets_value: sheetsValue,
    action: 'manual_review',
    after_value: null,
    reason: 'No approved mapping rule matched.',
  };
}

function approvedUpdate(row: CategorizedRow, before: string, sheetsValue: string, after: NonNullable<ApprovedIslandMappingRow['after_value']>, reason: string): ApprovedIslandMappingRow {
  return {
    wo_id: row.wo_id,
    before_value: before,
    sheets_value: sheetsValue,
    action: 'update',
    after_value: after,
    reason,
  };
}

function suggestCanonicalIsland(value: string): ApprovedIslandMappingRow['after_value'] | null {
  const normalized = normalizeLabel(value);
  if (MAUI_AREA_VALUES.has(normalized)) return 'maui';
  if (normalized === 'lanai') return 'lanai';
  if (normalized === 'molokai') return 'molokai';
  if (normalized === 'hawaii') return 'big_island';
  return null;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ');
}

function lookupEvidence(lookup?: AmbiguousLookupRow): string {
  if (!lookup) return '';
  const legacy = lookup.legacy_payload || {};
  return [
    lookup.name,
    lookup.description,
    lookup.location_notes,
    lookup.site_name,
    lookup.site_address,
    lookup.site_city,
    lookup.site_island,
    typeof legacy.address_raw === 'string' ? legacy.address_raw : null,
  ].filter(Boolean).join(' | ');
}

function resolveLanaiMolokai(evidence: string): 'lanai' | 'molokai' | null {
  const normalized = evidence.toLowerCase();
  const hasLanai = /lanai|l[ƒāa][åa]na|fslanai|keomoku|manele|koele/.test(normalized);
  const hasMolokai = /molokai|kaunakakai|hoolehua/.test(normalized);
  if (hasLanai && !hasMolokai) return 'lanai';
  if (hasMolokai && !hasLanai) return 'molokai';
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

export function renderApprovedIslandMappingDryRunMarkdown(report: ApprovedIslandMappingDryRunReport): string {
  const lines: string[] = [];
  lines.push('# Packet 006 / BAN-196 — Phase 2 Island Mapping Dry-Run #2');
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
  lines.push(`- Island true conflicts total: ${report.island_true_conflicts_total}`);
  lines.push(`- Proposed UPDATE count: ${report.proposed_update_count}`);
  lines.push(`- Leave at \`unknown\` count: ${report.leave_unknown_count}`);
  lines.push(`- Manual review count after lookup: ${report.manual_review_count}`);
  lines.push('');
  lines.push('## Proposed update counts by target enum');
  lines.push('');
  lines.push('| Target island_code | Count |');
  lines.push('|---|---:|');
  for (const [value, count] of Object.entries(report.proposed_update_counts_by_target).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`| ${value} | ${count} |`);
  }
  lines.push('');
  lines.push('## Count reconciliation');
  lines.push('');
  for (const item of report.expected_count_reconciliation) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Rows requiring non-update handling');
  lines.push('');
  lines.push('| WO | Sheets value | Action | After | Reason | Evidence |');
  lines.push('|---|---|---|---|---|---|');
  for (const row of report.rows.filter(item => item.action !== 'update')) {
    lines.push(`| ${row.wo_id} | ${row.sheets_value} | ${row.action} | ${row.after_value || ''} | ${row.reason} | ${truncate(row.lookup_evidence || '')} |`);
  }
  lines.push('');
  lines.push('## Lanai/Molokai disambiguation results');
  lines.push('');
  lines.push('| WO | Action | After | Evidence |');
  lines.push('|---|---|---|---|');
  for (const row of report.rows.filter(item => normalizeLabel(item.sheets_value) === 'lanai/molokai')) {
    lines.push(`| ${row.wo_id} | ${row.action} | ${row.after_value || ''} | ${truncate(row.lookup_evidence || '')} |`);
  }
  lines.push('');
  lines.push('## Required approval before full execution');
  lines.push('');
  lines.push('STOP. Full execution must not run until Sean approves dry-run #2 counts and the final update set.');
  return `${lines.join('\n')}\n`;
}

function truncate(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 160).replace(/\|/g, '/');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) throw new Error('Missing --input=<categorization-report.json>.');
  const parsed = JSON.parse(fs.readFileSync(args.input, 'utf8')) as CategorizationReport;
  if (!Array.isArray(parsed.rows)) throw new Error('Input JSON must contain a rows array from wo_drift_categorizer.ts.');

  const lookupRows = args.lookup ? JSON.parse(fs.readFileSync(args.lookup, 'utf8')) as AmbiguousLookupRow[] : [];
  const report = args.approvedMapping
    ? buildApprovedIslandMappingDryRunReport(parsed.rows, lookupRows, new Date().toISOString())
    : buildIslandBackfillDryRunReport(parsed.rows, args.limit, new Date().toISOString());
  const out = args.out || path.join(process.cwd(), 'packet_006_phase2_island_backfill_dry_run.md');
  const jsonOut = args.jsonOut || out.replace(/\.md$/i, '.json');
  fs.writeFileSync(out, args.approvedMapping ? renderApprovedIslandMappingDryRunMarkdown(report as ApprovedIslandMappingDryRunReport) : renderIslandBackfillDryRunMarkdown(report as IslandDryRunReport));
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    out,
    jsonOut,
    mode: report.mode,
    ...(args.approvedMapping
      ? {
        proposedUpdateCount: (report as ApprovedIslandMappingDryRunReport).proposed_update_count,
        leaveUnknownCount: (report as ApprovedIslandMappingDryRunReport).leave_unknown_count,
        manualReviewCount: (report as ApprovedIslandMappingDryRunReport).manual_review_count,
        proposedUpdateCountsByTarget: (report as ApprovedIslandMappingDryRunReport).proposed_update_counts_by_target,
      }
      : {
        islandBackfillCandidatesTotal: (report as IslandDryRunReport).island_backfill_candidates_total,
        dryRunRows: (report as IslandDryRunReport).dry_run_rows_count,
        requestedLiteralInvalidCount: (report as IslandDryRunReport).requested_literal_invalid_count,
        blocker: (report as IslandDryRunReport).blocker,
      }),
  }, null, 2));
}

function parseArgs(argv: string[]) {
  const get = (name: string) => argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const limitRaw = get('limit');
  return {
    input: get('input'),
    lookup: get('lookup'),
    approvedMapping: argv.includes('--approved-mapping'),
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
