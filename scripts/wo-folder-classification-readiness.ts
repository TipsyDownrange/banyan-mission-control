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
type Sample = { rowNumber: number; woId: string; woNumber: string; name: string; island: string; customerName: string; folderUrl: string; classification: WOFolderClassification };
const BUCKETS: Bucket[] = ['empty','unparseable','inaccessible','trashed','my_drive','shared_drive_canonical','shared_drive_missing_subfolders'];
function clean(v: unknown) { return String(v || '').trim(); }
function pct(n: number, d: number) { return d ? Number(((n/d)*100).toFixed(1)) : 0; }
function makeUrlFromId(id: string) { return `https://drive.google.com/drive/folders/${id}`; }

async function main() {
  const sheetsAuth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });
  const drive = getWODriveClient(); // Drive reads only; classifier uses files.get/list.
  const report: Record<string, any> = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only all-row WO folder classification readiness',
    noWriteConfirmation: 'Sheets readonly; Drive metadata/list only through classifyWOFolder; no create/update/delete/permission/write calls; no Postgres/QBO/Gmail/calendar calls',
    sheets: {},
  };

  for (const sheet of SHEETS) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheet.spreadsheetId, range: 'Service_Work_Orders!A1:AU2000' });
    const rows = ((res.data.values || []) as string[][]).slice(1).filter(r => r.some(Boolean));
    const counts = Object.fromEntries(BUCKETS.map(b => [b, 0])) as Record<Bucket, number>;
    const samples = Object.fromEntries(BUCKETS.map(b => [b, [] as Sample[]])) as Record<Bucket, Sample[]>;
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
      counts[classification.kind]++;
      if (samples[classification.kind].length < 12) {
        samples[classification.kind].push({
          rowNumber: i + 2,
          woId: clean(r[COL.wo_id]),
          woNumber: clean(r[COL.wo_number]),
          name: clean(r[COL.name]),
          island: clean(r[COL.island]),
          customerName: clean(r[COL.customer_name]),
          folderUrl,
          classification,
        });
      }
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
      nextActions: {
        shared_drive_canonical: 'attach/import folder_id + folder_url into Postgres candidate metadata',
        shared_drive_missing_subfolders: 'import as existing folder with remediation task to ensure subfolders after approval',
        empty: 'create canonical folder via migration task only after approval or preserve unresolved status',
        unparseable: 'manual review or create canonical folder via approved task; preserve raw value',
        my_drive: 'manual review/wrong-drive bucket; do not move/delete automatically',
        trashed: 'manual review; restore or approve replacement',
        inaccessible: 'permission/manual review bucket',
      },
    };
  }

  const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(process.cwd(), 'wo-folder-classification-readiness.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  const md = out.replace(/\.json$/, '.md');
  const lines = ['# BAN-193.A WO Folder Classification Readiness — 2026-05-07 HST', '', 'No writes performed.', ''];
  for (const [label, s] of Object.entries(report.sheets)) {
    const sheetReport = s as any;
    lines.push(`## ${label}`, `- Rows: ${sheetReport.rows}`, `- Folder URL present: ${sheetReport.folderUrlPresent}`, `- Folder URL missing: ${sheetReport.folderUrlMissing}`, `- Unique folder URL values: ${sheetReport.uniqueFolderUrlValues}`, '', 'Buckets:');
    for (const b of BUCKETS) lines.push(`- ${b}: ${sheetReport.counts[b]} (${sheetReport.percentages[b]}%)`);
    lines.push('', 'Sample rows by non-happy bucket:');
    for (const b of BUCKETS.filter(x => x !== 'shared_drive_canonical')) {
      const sampleList = sheetReport.samples[b] as Sample[];
      if (!sampleList.length) continue;
      lines.push(`### ${b}`);
      for (const sample of sampleList.slice(0, 8)) lines.push(`- row ${sample.rowNumber} ${sample.woId || sample.woNumber || '(no id)'} ${sample.customerName || sample.name || ''} — ${sample.classification.kind}`);
    }
    lines.push('');
  }
  fs.writeFileSync(md, lines.join('\n'));
  console.log(out); console.log(md);
}

main().catch(err => { console.error(err); process.exit(1); });
