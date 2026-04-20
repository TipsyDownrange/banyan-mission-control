/**
 * POST /api/admin/origin-migration
 *
 * One-shot migration: adds 'origin' header to Field_Events_V1!AG1 and
 * backfills all existing data rows in AG2:AG{n} with 'field'.
 * Safe to re-run — idempotent (overwrites same values).
 */
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getServerSession } from 'next-auth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Field_Events_V1';

export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Write header
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!AG1`,
    valueInputOption: 'RAW',
    requestBody: { values: [['origin']] },
  });

  // 2. Count existing data rows (non-empty event_id in column A)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!A2:A5000`,
  });
  const rowCount = (res.data.values || []).filter((r: string[]) => r[0]).length;

  if (rowCount === 0) {
    return NextResponse.json({ ok: true, backfilled: 0 });
  }

  // 3. Backfill with 'field'
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB}!AG2:AG${rowCount + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: Array(rowCount).fill(['field']) },
  });

  return NextResponse.json({ ok: true, backfilled: rowCount });
}
