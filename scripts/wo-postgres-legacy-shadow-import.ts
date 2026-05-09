import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { eq } from 'drizzle-orm';
import { getGoogleAuth } from '@/lib/gauth';
import { buildServiceWorkOrderPostgresCandidate } from '@/lib/service-work-orders/postgres-shadow';
import {
  buildLegacyShadowImportRow,
  buildUserAliasMap,
  resolveAssignment,
  type LegacyShadowImportRow,
} from '@/lib/service-work-orders/legacy-shadow-import';

const SHEETS = {
  staging: '1DZRiKveSJTbCHxBXdWgl_ZqQCaXOjnv02tFZNmnZJ90',
  production: '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU',
} as const;

type SourceName = keyof typeof SHEETS;
type CountMap = Record<string, number>;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(a => a.startsWith(prefix))?.slice(prefix.length);
}
function hasFlag(name: string): boolean { return process.argv.includes(`--${name}`); }
function bump(map: CountMap, key: unknown) { const k = String(key || 'blank'); map[k] = (map[k] || 0) + 1; }
function sha256(value: unknown): string { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function pct(n: number, d: number) { return d ? Number(((n / d) * 100).toFixed(1)) : 0; }
function top(map: CountMap, limit = 20) { return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0, limit).map(([value,count])=>({value,count})); }

function parseSource(): SourceName {
  const source = (arg('source') || 'staging') as SourceName;
  if (!['staging', 'production'].includes(source)) throw new Error('--source must be staging or production');
  return source;
}

function toDbValues(row: LegacyShadowImportRow) {
  return {
    wo_number: row.values.wo_number,
    kid: row.values.kid,
    name: row.values.name,
    description: row.values.description,
    status: row.values.status as any,
    island: row.values.island as any,
    org_id: row.values.org_id,
    assigned_to: row.values.assigned_to,
    assigned_crew: row.values.assigned_crew,
    system_type: row.values.system_type,
    scheduled_date: row.values.scheduled_date,
    quote_total: row.values.quote_total,
    folder_id: row.values.folder_id,
    folder_url: row.values.folder_url,
    legacy_customer_id: row.values.legacy_customer_id,
    legacy_payload: row.values.legacy_payload,
    metadata: row.values.metadata,
    updated_at: new Date(),
  };
}

async function existingKeys(rows: LegacyShadowImportRow[]) {
  if (!process.env.DATABASE_URL) return { available: false, existing: new Set<string>() };
  const { db, service_work_orders } = await import('@/db');
  const existing = new Set<string>();
  for (const row of rows) {
    if (!row.values.kid) continue;
    const hit = await db.select({ kid: service_work_orders.kid }).from(service_work_orders).where(eq(service_work_orders.kid, row.values.kid)).limit(1);
    if (hit.length) existing.add(row.values.kid);
  }
  return { available: true, existing };
}

async function executeUpsert(rows: LegacyShadowImportRow[]) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for --execute');
  const { db, service_work_orders } = await import('@/db');
  let insertedOrUpdated = 0;
  for (const row of rows) {
    if (!row.values.kid) throw new Error(`Missing kid for stable key ${row.stableKey}`);
    await db.insert(service_work_orders)
      .values(toDbValues(row))
      .onConflictDoUpdate({
        target: service_work_orders.kid,
        set: toDbValues(row),
      });
    insertedOrUpdated++;
  }
  return insertedOrUpdated;
}

async function main() {
  const source = parseSource();
  const execute = hasFlag('execute');
  const confirm = arg('confirm');
  const out = arg('out') || path.join(process.cwd(), `wo-postgres-legacy-shadow-import-${source}.json`);

  if (execute) {
    if (source !== 'staging') throw new Error('Production execution is blocked. Use staging only.');
    if (confirm !== 'IMPORT_WO_SHADOW') throw new Error('--execute requires --confirm=IMPORT_WO_SHADOW');
  }

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const [woRes, usersRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEETS[source], range: 'Service_Work_Orders!A1:AU2000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEETS[source], range: 'Users_Roles!A2:R500' }).catch(() => ({ data: { values: [] } })),
  ]);

  const values = (woRes.data.values || []) as string[][];
  const header = values[0] || [];
  const sourceRows = values.slice(1).filter(row => row.some(Boolean));
  const aliases = buildUserAliasMap((usersRes.data.values || []) as string[][]);

  const rows: LegacyShadowImportRow[] = [];
  const statusCounts: CountMap = {};
  const assignmentCounts: CountMap = {};
  const identityCounts: CountMap = {};
  const manualReviewRows: string[] = [];
  const rejected: Array<{ stableKey: string; reason: string }> = [];

  for (const sourceRow of sourceRows) {
    const candidate = buildServiceWorkOrderPostgresCandidate(header, sourceRow);
    const stableKey = candidate.kid || (candidate.wo_number ? `WO-${candidate.wo_number}` : 'unknown');
    if (!candidate.folder_url) {
      rejected.push({ stableKey, reason: 'missing folder_url' });
      continue;
    }
    if (!candidate.status) {
      rejected.push({ stableKey, reason: 'missing status' });
      continue;
    }
    const assignment = resolveAssignment(candidate.assigned_to_raw, aliases);
    const row = buildLegacyShadowImportRow(candidate, assignment);
    rows.push(row);
    bump(statusCounts, row.values.status);
    bump(assignmentCounts, assignment.status);
    bump(identityCounts, candidate.metadata.identity_resolution_status);
    if (row.manualReview) manualReviewRows.push(row.stableKey);
  }

  const hashInput = rows.map(row => ({ stableKey: row.stableKey, values: row.payloadHashInput }));
  const payloadHash = sha256(hashInput);
  const existing = await existingKeys(rows);
  const updatePreviewCount = existing.available ? rows.filter(row => row.values.kid && existing.existing.has(row.values.kid)).length : null;
  const insertPreviewCount = existing.available ? rows.length - (updatePreviewCount || 0) : rows.length;

  let executedCount = 0;
  if (execute) executedCount = await executeUpsert(rows);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: execute ? 'staging_execute' : 'dry_run',
    source,
    spreadsheetId: SHEETS[source],
    noWriteConfirmation: execute
      ? 'Staging Postgres upsert executed; Sheets readonly; no Drive/QBO/Gmail/calendar calls.'
      : 'Dry run only; Sheets readonly; no Postgres/Drive/QBO/Gmail/calendar writes.',
    sourceRowCount: sourceRows.length,
    candidateCount: rows.length,
    rejectedCount: rejected.length,
    rejected,
    payloadHash,
    insertPreviewCount,
    updatePreviewCount,
    existingDbCheckAvailable: existing.available,
    executedCount,
    manualReview: {
      count: manualReviewRows.length,
      percent: pct(manualReviewRows.length, rows.length),
      sampleStableKeys: manualReviewRows.slice(0, 50),
    },
    statusCounts,
    assignmentCounts,
    identityCounts,
    topUnresolvedAssignmentTokens: top(rows.reduce((acc, row) => {
      const tokens = (row.values.metadata.assigned_unresolved_tokens || []) as string[];
      for (const token of tokens) bump(acc, token);
      return acc;
    }, {} as CountMap)),
    sampleRows: rows.slice(0, 5).map(row => ({ stableKey: row.stableKey, values: row.values })),
    stopConditions: [
      'Production execution is blocked in this script.',
      'Execute requires --source=staging --execute --confirm=IMPORT_WO_SHADOW.',
      'Missing folder_url rows are rejected instead of imported.',
      'Invoice/manual-review ambiguity remains in legacy_payload/metadata only.',
    ],
  };

  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const md = out.replace(/\.json$/, '.md');
  fs.writeFileSync(md, [
    `# WO Postgres Legacy Shadow Import ${execute ? 'Execute' : 'Dry-Run'} — ${source}`,
    '',
    `- Source rows: ${report.sourceRowCount}`,
    `- Candidates: ${report.candidateCount}`,
    `- Rejected: ${report.rejectedCount}`,
    `- Payload hash: \`${report.payloadHash}\``,
    `- Insert preview: ${report.insertPreviewCount}`,
    `- Update preview: ${report.updatePreviewCount === null ? 'not checked (DATABASE_URL unavailable)' : report.updatePreviewCount}`,
    `- Manual-review rows: ${report.manualReview.count} (${report.manualReview.percent}%)`,
    '',
    '## Assignment',
    ...Object.entries(report.assignmentCounts).map(([k,v]) => `- ${k}: ${v}`),
    '',
    '## Identity',
    ...Object.entries(report.identityCounts).map(([k,v]) => `- ${k}: ${v}`),
    '',
    '## Stop conditions',
    ...report.stopConditions.map(s => `- ${s}`),
  ].join('\n'));

  console.log(out);
  console.log(md);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
