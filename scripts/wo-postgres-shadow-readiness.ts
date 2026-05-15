import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { runServiceWorkOrdersPostgresShadowDryRun } from '@/lib/service-work-orders/postgres-shadow';

const SHEETS = [
  { label: 'staging', spreadsheetId: '1DZRiKveSJTbCHxBXdWgl_ZqQCaXOjnv02tFZNmnZJ90' },
  { label: 'production', spreadsheetId: '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU' },
] as const;

type CountMap = Record<string, number>;

function bump(map: CountMap, key: unknown) {
  const value = String(key || 'unknown');
  map[value] = (map[value] || 0) + 1;
}

function pct(count: number, total: number) {
  return total ? Number(((count / total) * 100).toFixed(1)) : 0;
}

async function main() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const generatedAt = new Date().toISOString();
  const report: Record<string, unknown> = {
    generatedAt,
    mode: 'read-only all-row SWO shadow readiness; no Postgres insert function supplied',
    noWriteConfirmation: {
      sheets: 'read-only scope only',
      postgres: 'no insert function supplied',
      qbo: 'not called',
      drive: 'not called',
      gmailCalendar: 'not called',
    },
    sheets: {},
    cutoverDeltaPlan: [
      'Capture first import snapshot timestamp/hash before any staging shadow import.',
      'Keep Sheets source-of-truth while shadow records are inspected.',
      'Immediately before real cutover, freeze WO writes or route them through one controlled lane.',
      'Capture final pre-cutover Sheet snapshot and compare by stable WO key: wo_id then wo_number.',
      'Reconcile changed fields: status, scheduled_date, assigned_to, folder_url, quote/invoice fields, org/customer identity, QA/lifecycle state.',
      'Apply final delta sync to Postgres in staging first, then production only after explicit approval.',
      'Flip reads/writes only after WO board/detail/dispatch/scheduling/FA handoff smoke passes.',
      'Keep Sheets read-only as backup through the approved backup window.',
    ],
  };

  for (const sheet of SHEETS) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheet.spreadsheetId,
      range: 'Service_Work_Orders!A1:AU2000',
    });
    const values = (res.data.values || []) as string[][];
    const header = values[0] || [];
    const rows = values.slice(1).filter(row => row.some(Boolean));

    const rowShapeCounts: CountMap = {};
    const blockedReasonCounts: CountMap = {};
    const identityResolutionCounts: CountMap = {};
    const assignmentResolutionCounts: CountMap = {};
    const siteResolutionCounts: CountMap = {};
    const confidenceCounts: CountMap = {};
    const statusCounts: CountMap = {};
    const islandCounts: CountMap = {};
    const issueCounts = {
      manualInvoiceReview: 0,
      writeCapable: 0,
      writeDisabled: 0,
      missingFolderUrl: 0,
      missingScheduledDate: 0,
      missingLegacyCustomerId: 0,
    };

    let headerShape = 'unknown';
    let headerNotes: string[] = [];

    for (const row of rows) {
      const result = await runServiceWorkOrdersPostgresShadowDryRun(
        header,
        row,
        { environment: sheet.label, dryRun: true, enabled: false, allowDriftedRows: false },
      );
      headerShape = result.headerReport.shape;
      headerNotes = result.headerReport.notes;
      bump(rowShapeCounts, result.rowReport.shape);
      for (const reason of result.blockedReasons) bump(blockedReasonCounts, reason);
      bump(identityResolutionCounts, result.candidate.metadata.identity_resolution_status);
      bump(assignmentResolutionCounts, result.candidate.metadata.assignment_resolution_status);
      bump(siteResolutionCounts, result.candidate.metadata.site_resolution_status);
      bump(confidenceCounts, result.candidate.metadata.confidence);
      bump(statusCounts, result.candidate.status);
      bump(islandCounts, result.candidate.island);

      if (result.candidate.metadata.requires_manual_invoice_review) issueCounts.manualInvoiceReview++;
      if (result.canWrite) issueCounts.writeCapable++;
      if (!result.canWrite) issueCounts.writeDisabled++;
      if (!result.candidate.folder_url) issueCounts.missingFolderUrl++;
      if (!result.candidate.scheduled_date) issueCounts.missingScheduledDate++;
      if (!result.candidate.legacy_customer_id) issueCounts.missingLegacyCustomerId++;
    }

    (report.sheets as Record<string, unknown>)[sheet.label] = {
      spreadsheetId: sheet.spreadsheetId,
      headerCount: header.length,
      totalNonEmptyRows: rows.length,
      headerShape,
      headerNotes,
      rowShapeCounts,
      blockedReasonCounts,
      identityResolutionCounts,
      assignmentResolutionCounts,
      siteResolutionCounts,
      confidenceCounts,
      statusCounts,
      islandCounts,
      issueCounts,
      issuePercentages: Object.fromEntries(Object.entries(issueCounts).map(([key, value]) => [key, pct(value, rows.length)])),
    };
  }

  const outArg = process.argv.find(arg => arg.startsWith('--out='));
  const out = outArg?.slice('--out='.length) || path.join(process.cwd(), 'wo-postgres-shadow-readiness.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(out);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
