import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { classifyWOFolder, getWODriveClient, type WOFolderClassification } from '@/lib/drive-wo-folder';

const SHEETS = [
  { label: 'staging', spreadsheetId: '1DZRiKveSJTbCHxBXdWgl_ZqQCaXOjnv02tFZNmnZJ90' },
  { label: 'production', spreadsheetId: '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU' },
] as const;
const COL = { wo_id: 0, wo_number: 1, name: 2, island: 5, customer_name: 12, folder_url: 23 } as const;
type Bucket = WOFolderClassification['kind'];
type RepairAction = 'noop' | 'create_canonical_folder' | 'ensure_subfolders' | 'manual_review_required';
type Sample = {
  rowNumber: number;
  woId: string;
  woNumber: string;
  name: string;
  island: string;
  customerName: string;
  folderUrl: string;
  classification: WOFolderClassification;
};
const BUCKETS: Bucket[] = ['empty','unparseable','inaccessible','trashed','my_drive','shared_drive_canonical','shared_drive_missing_subfolders'];
const MUTATION_ELIGIBLE_ACTIONS: RepairAction[] = ['create_canonical_folder', 'ensure_subfolders'];
function clean(v: unknown) { return String(v || '').trim(); }
function pct(n: number, d: number) { return d ? Number(((n/d)*100).toFixed(1)) : 0; }
function repairActionFor(kind: Bucket): RepairAction {
  switch (kind) {
    case 'shared_drive_canonical': return 'noop';
    case 'shared_drive_missing_subfolders': return 'ensure_subfolders';
    case 'empty':
    case 'unparseable':
    case 'my_drive': return 'create_canonical_folder';
    case 'trashed':
    case 'inaccessible': return 'manual_review_required';
  }
}
function repairReasonFor(classification: WOFolderClassification): string {
  if (classification.kind === 'shared_drive_missing_subfolders') {
    return `Canonical folder is missing standard subfolders: ${classification.missingSubfolders.join(', ')}`;
  }
  if (classification.kind === 'inaccessible') {
    return `folder metadata is inaccessible: ${classification.reason}`;
  }
  return repairReasonForBucket(classification.kind);
}
function repairReasonForBucket(kind: Bucket): string {
  switch (kind) {
    case 'shared_drive_canonical': return 'Folder is already canonical.';
    case 'shared_drive_missing_subfolders': return 'Canonical folder is missing at least one standard subfolder.';
    case 'empty': return 'folder_url is empty; approved repair would create a fresh canonical folder and write folder_url.';
    case 'unparseable': return 'folder_url is not parseable; approved repair would create a fresh canonical folder and replace folder_url.';
    case 'my_drive': return 'folder_url points outside the Banyan shared drive; approved repair would create a fresh canonical folder and replace folder_url without moving/deleting the old folder.';
    case 'trashed': return 'folder is trashed; manual operator decision required before replacement.';
    case 'inaccessible': return 'folder metadata is inaccessible; permission/manual review required.';
  }
}
function summarizeRepairBuckets(counts: Record<Bucket, number>) {
  const byAction = {
    noop: counts.shared_drive_canonical,
    ensure_subfolders: counts.shared_drive_missing_subfolders,
    create_canonical_folder: counts.empty + counts.unparseable + counts.my_drive,
    manual_review_required: counts.trashed + counts.inaccessible,
  } satisfies Record<RepairAction, number>;
  return {
    byAction,
    mutationEligibleAfterApproval: MUTATION_ELIGIBLE_ACTIONS.reduce((sum, action) => sum + byAction[action], 0),
    noWriteDryRunOnly: true,
    approvalRequiredForMutation: 'Mutation is not performed by this script. Live repair remains gated by /api/admin/wo-folder-repair with dryRun=false and confirm=true, preferably staging-first and batch-capped.',
  };
}

async function main() {
  const includeFullRows = process.argv.includes('--full');
  const sheetsAuth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
  const drive = getWODriveClient(); // Drive reads only; classifier uses metadata/list calls.
  const report: Record<string, any> = {
    generatedAt: new Date().toISOString(),
    mode: includeFullRows ? 'read-only all-row WO folder classification + full repair dry-run plan' : 'read-only all-row WO folder classification readiness',
    noWriteConfirmation: 'Sheets readonly; Drive metadata/list only through classifyWOFolder; no create/delete/permission/write calls; no Postgres/QBO/Gmail/calendar calls',
    fullRowsIncluded: includeFullRows,
    sheets: {},
  };

  for (const sheet of SHEETS) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Service_Work_Orders!A1:AU2000' });
    const rows = ((res.data.values || []) as string[][]).slice(1).filter(r => r.some(Boolean));
    const counts = Object.fromEntries(BUCKETS.map(b => [b, 0])) as Record<Bucket, number>;
    const samples = Object.fromEntries(BUCKETS.map(b => [b, [] as Sample[]])) as Record<Bucket, Sample[]>;
    const fullRows = Object.fromEntries(BUCKETS.map(b => [b, [] as Sample[]])) as Record<Bucket, Sample[]>;
    const cache = new Map<string, WOFolderClassification>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const folderUrl = clean(r[COL.folder_url]);
      const key = folderUrl || '__EMPTY__';
      let classification = cache.get(key);
      if (!classification) {
        classification = await classifyWOFolder(drive, folderUrl);
        cache.set(key, classification);
      }
      const rowSummary: Sample = {
        rowNumber: i + 2,
        woId: clean(r[COL.wo_id]),
        woNumber: clean(r[COL.wo_number]),
        name: clean(r[COL.name]),
        island: clean(r[COL.island]),
        customerName: clean(r[COL.customer_name]),
        folderUrl,
        classification,
      };
      counts[classification.kind]++;
      if (samples[classification.kind].length < 12) samples[classification.kind].push(rowSummary);
      if (includeFullRows) fullRows[classification.kind].push(rowSummary);
    }

    report.sheets[sheet.label] = {
      spreadsheetId: sheet.spreadsheetId,
      rows: rows.length,
      folderUrlPresent: rows.filter(r => clean(r[COL.folder_url])).length,
      folderUrlMissing: rows.filter(r => !clean(r[COL.folder_url])).length,
      uniqueFolderUrlValues: new Set(rows.map(r => clean(r[COL.folder_url])).filter(Boolean)).size,
      counts,
      percentages: Object.fromEntries(BUCKETS.map(b => [b, pct(counts[b], rows.length)])),
      samples,
      repairDryRun: summarizeRepairBuckets(counts),
      repairPlanByBucket: Object.fromEntries(BUCKETS.map(b => [b, {
        action: repairActionFor(b),
        reason: samples[b][0] ? repairReasonFor(samples[b][0].classification) : repairReasonForBucket(b),
        requiresExplicitMutationApproval: repairActionFor(b) !== 'noop',
      }])),
      ...(includeFullRows ? { fullRows } : {}),
      nextActions: {
        shared_drive_canonical: 'attach/import folder_id + folder_url into Postgres candidate metadata',
        shared_drive_missing_subfolders: 'after approval, ensure standard subfolders only; do not update folder_url',
        empty: 'after approval, create canonical folder and write folder_url',
        unparseable: 'manual review or approved canonical replacement; preserve raw value in report',
        my_drive: 'after approval, create fresh canonical folder and repoint folder_url; do not move/delete old folder',
        trashed: 'manual review; restore or explicitly approve replacement in a separate batch',
        inaccessible: 'permission/manual review bucket',
      },
    };
  }

  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(process.cwd(), 'wo-folder-classification-readiness.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const md = out.replace(/\.json$/, '.md');
  const lines = ['# BAN-193.A WO Folder Classification Readiness — 2026-05-08 HST', '', 'No writes performed.', includeFullRows ? 'Full row details included in JSON.' : 'Sample rows only; rerun with `--full` for every row in each bucket.', ''];
  for (const [label, s] of Object.entries(report.sheets)) {
    const sheetReport = s as any;
    lines.push(`## ${label}`, `- Rows: ${sheetReport.rows}`, `- Folder URL present: ${sheetReport.folderUrlPresent}`, `- Folder URL missing: ${sheetReport.folderUrlMissing}`, `- Unique folder URL values: ${sheetReport.uniqueFolderUrlValues}`, '', 'Buckets:');
    for (const b of BUCKETS) lines.push(`- ${b}: ${sheetReport.counts[b]} (${sheetReport.percentages[b]}%)`);
    lines.push('', 'Dry-run repair actions:');
    for (const [action, count] of Object.entries(sheetReport.repairDryRun.byAction)) lines.push(`- ${action}: ${count}`);
    lines.push(`- mutation eligible after explicit approval: ${sheetReport.repairDryRun.mutationEligibleAfterApproval}`, '', 'Sample rows by non-happy bucket:');
    for (const b of BUCKETS.filter(x => x !== 'shared_drive_canonical')) {
      const sampleList = sheetReport.samples[b] as Sample[];
      if (!sampleList.length) continue;
      lines.push(`### ${b}`);
      for (const sample of sampleList.slice(0, 8)) lines.push(`- row ${sample.rowNumber} ${sample.woId || sample.woNumber || '(no id)'} ${sample.customerName || sample.name || ''} — ${sample.classification.kind} → ${repairActionFor(sample.classification.kind)}`);
    }
    lines.push('');
  }
  fs.writeFileSync(md, lines.join('\n'));
  console.log(out); console.log(md);
}

main().catch(err => { console.error(err); process.exit(1); });
