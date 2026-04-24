import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { checkPermission } from '@/lib/permissions';
import { invalidateCache } from '@/app/api/service/route';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

// Column indices in Service_Work_Orders (0-based)
const COL_WO_ID        = 0;
const COL_CUSTOMER_NAME = 12; // M
const COL_ORG_ID       = 42; // AQ
const COL_CUSTOMER_ID  = 43; // AR — GC-D053
const COL_LEGACY_FLAG  = 44; // AS — GC-D053

function colLetter(idx: number): string {
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

// POST — run backfill. Admin-gated: Sean + Jody only.
// Returns a JSON report and writes it to Drive governance folder.
export async function POST(req: Request) {
  const { allowed, email: userEmail } = await checkPermission(req, 'admin:backfill');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: admin:backfill required (Sean / Jody only)' }, { status: 403 });

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Fetch WOs and Customers in parallel
    const [woRes, custRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: 'Service_Work_Orders!A2:AS5000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: 'Customers!A:N',
      }),
    ]);

    const woRows = woRes.data.values || [];
    const custRows = custRes.data.values || [];
    const custHeaders = (custRows[0] || []) as string[];
    const cidIdx    = custHeaders.indexOf('Customer_ID');
    const cNameIdx  = custHeaders.indexOf('Company_Name');

    if (cidIdx < 0) {
      return NextResponse.json({ error: 'Customers table missing Customer_ID column' }, { status: 500 });
    }

    // Build case-insensitive company-name → customer_id map
    const nameToCustomers = new Map<string, string[]>();
    for (const r of custRows.slice(1)) {
      const cid  = (r[cidIdx]   || '').trim();
      const name = (r[cNameIdx] || '').trim().toLowerCase();
      if (!cid || !name) continue;
      const existing = nameToCustomers.get(name) || [];
      existing.push(cid);
      nameToCustomers.set(name, existing);
    }

    const linked: string[]   = [];
    const legacy: string[]   = [];
    const ambiguous: string[]= [];
    const batchUpdates: { range: string; values: string[][] }[] = [];

    for (let i = 0; i < woRows.length; i++) {
      const row = woRows[i] as string[];
      const woId       = (row[COL_WO_ID]        || '').trim();
      const customerId = (row[COL_CUSTOMER_ID]  || '').trim();
      const legacyFlag = (row[COL_LEGACY_FLAG]  || '').trim();
      if (!woId) continue;

      // Skip rows that already have customer_id populated
      if (customerId) continue;
      // Skip rows already marked legacy
      if (legacyFlag === 'true') continue;

      const sheetRow = i + 2;
      const rawName = (row[COL_CUSTOMER_NAME] || '').trim();
      const nameLower = rawName.toLowerCase();
      const matches = nameToCustomers.get(nameLower) || [];

      if (matches.length === 1) {
        // Unique match — link and clear legacy flag
        batchUpdates.push({
          range: `Service_Work_Orders!${colLetter(COL_CUSTOMER_ID)}${sheetRow}:${colLetter(COL_LEGACY_FLAG)}${sheetRow}`,
          values: [[matches[0], 'false']],
        });
        linked.push(`${woId} → ${matches[0]} (${rawName})`);
      } else if (matches.length === 0) {
        // No match — mark legacy
        batchUpdates.push({
          range: `Service_Work_Orders!${colLetter(COL_LEGACY_FLAG)}${sheetRow}`,
          values: [['true']],
        });
        legacy.push(`${woId} (customer_name: "${rawName}" — no Customers match)`);
      } else {
        // Ambiguous — mark legacy, flag for manual review
        batchUpdates.push({
          range: `Service_Work_Orders!${colLetter(COL_LEGACY_FLAG)}${sheetRow}`,
          values: [['true']],
        });
        ambiguous.push(`${woId} (customer_name: "${rawName}" — ${matches.length} matches: ${matches.join(', ')})`);
      }
    }

    // Write all updates
    if (batchUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: BACKEND_SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: batchUpdates },
      });
    }

    invalidateCache();

    // Build report
    const now = new Date().toISOString();
    const report = [
      `GC-D053 Backfill Report — ${now}`,
      `Run by: ${userEmail || 'unknown'}`,
      '',
      `LINKED (${linked.length} WOs successfully linked to Customers table):`,
      ...linked.map(s => `  ${s}`),
      '',
      `LEGACY (${legacy.length} WOs marked legacy — no Customers table match):`,
      ...legacy.map(s => `  ${s}`),
      '',
      `AMBIGUOUS (${ambiguous.length} WOs marked legacy — multiple Customers matches, manual review required):`,
      ...ambiguous.map(s => `  ${s}`),
    ].join('\n');

    // Write report to Drive governance folder
    let driveFileId = '';
    try {
      const { Readable } = await import('stream');
      const govFolderSearch = await drive.files.list({
        q: `name = 'Governance' and mimeType = 'application/vnd.google-apps.folder' and '${BANYAN_DRIVE_ID}' in parents and trashed = false`,
        driveId: BANYAN_DRIVE_ID,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'drive',
        fields: 'files(id)',
      });
      const govFolderId = govFolderSearch.data.files?.[0]?.id || BANYAN_DRIVE_ID;
      const reportFile = await drive.files.create({
        requestBody: {
          name: `GC-D053-Backfill-Report-${now.replace(/[:.]/g, '-')}.txt`,
          parents: [govFolderId],
          mimeType: 'text/plain',
        },
        media: { mimeType: 'text/plain', body: Readable.from([report]) },
        supportsAllDrives: true,
        fields: 'id,webViewLink',
      });
      driveFileId = reportFile.data.id || '';
    } catch (driveErr) {
      console.error('[backfill] Drive report write failed (non-fatal):', driveErr);
    }

    return NextResponse.json({
      ok: true,
      summary: { linked: linked.length, legacy: legacy.length, ambiguous: ambiguous.length, total: batchUpdates.length },
      linked,
      legacy,
      ambiguous,
      driveFileId,
      report,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
