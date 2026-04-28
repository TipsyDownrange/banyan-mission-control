/**
 * GET /api/admin/backfill-user-names
 *
 * One-time admin endpoint: resolves USR- IDs in Field_Events_V1
 * columns F (performed_by) and G (recorded_by) to display names.
 * Only accessible to sean@kulaglass.com.
 *
 * Returns: { updated: number, rows_scanned: number, dry_run: boolean }
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const TAB = 'Field_Events_V1';

export async function GET(req: Request) {
  const session = await getServerSession();
  if (session?.user?.email !== 'sean@kulaglass.com') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const dry = new URL(req.url).searchParams.get('dry') === 'true';

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Load user name map
    const usersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Users_Roles!A2:D100',
    });
    const userNameMap: Record<string, string> = {};
    for (const u of (usersRes.data.values || []) as string[][]) {
      if (u[0] && u[1]) userNameMap[u[0]] = u[1];       // USR-xxx → name
      if (u[3] && u[1]) userNameMap[u[3].toLowerCase()] = u[1]; // email → name
    }
    console.log(`[backfill] Loaded ${Object.keys(userNameMap).length} user entries`);

    // Fetch all event rows (cols A-G: event_id through recorded_by)
    const eventsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A2:G2000`,
    });
    const rows = (eventsRes.data.values || []) as string[][];
    console.log(`[backfill] Scanning ${rows.length} rows`);

    const updates: { range: string; values: string[][] }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, data starts row 2
      const performedBy = rows[i][5] || '';
      const recordedBy  = rows[i][6] || '';

      // Resolve performed_by (col F = index 5)
      const resolvedPerformed = userNameMap[performedBy] || userNameMap[performedBy.toLowerCase()];
      if (performedBy && resolvedPerformed && resolvedPerformed !== performedBy) {
        updates.push({ range: `${TAB}!F${rowNum}`, values: [[resolvedPerformed]] });
      }

      // Resolve recorded_by (col G = index 6)
      const resolvedRecorded = userNameMap[recordedBy] || userNameMap[recordedBy.toLowerCase()];
      if (recordedBy && resolvedRecorded && resolvedRecorded !== recordedBy) {
        updates.push({ range: `${TAB}!G${rowNum}`, values: [[resolvedRecorded]] });
      }
    }

    console.log(`[backfill] Found ${updates.length} cells to update`);

    if (!dry && updates.length > 0) {
      // batchUpdate in chunks of 500 to stay under API limits
      const chunkSize = 500;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: chunk },
        });
      }
      console.log(`[backfill] Updated ${updates.length} cells`);
    }

    return NextResponse.json({
      ok: true,
      rows_scanned: rows.length,
      updated: dry ? 0 : updates.length,
      would_update: updates.length,
      dry_run: dry,
      samples: updates.slice(0, 5).map(u => ({ range: u.range, value: u.values[0][0] })),
    });

  } catch (err) {
    console.error('[backfill] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
