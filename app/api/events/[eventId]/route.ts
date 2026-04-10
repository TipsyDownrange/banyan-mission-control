/**
 * PATCH /api/events/[eventId]
 *
 * Update a Field_Events_V1 record (e.g., resolve an issue).
 *
 * Body: { issue_status?: 'RESOLVED' | 'CLOSED' | 'OPEN' }
 *
 * Finds the row by event_id (col A) and patches the matching columns.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Field_Events_V1';

const COL_INDEX = {
  event_id: 0,
  issue_status: 31,
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventId } = await params;
  const body = await req.json().catch(() => ({}));
  const { issue_status } = body as { issue_status?: string };

  if (!issue_status) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Read all event_ids to find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A2:A5000`,
    });

    const rows = (res.data.values || []) as string[][];
    const rowIdx = rows.findIndex(r => r[0] === eventId);

    if (rowIdx === -1) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Sheets row = rowIdx + 2 (1-indexed, skip header)
    const sheetRow = rowIdx + 2;

    // Update issue_status column (col AF = index 31 → col letters: A=1, so col 32 = AF)
    const colLetter = 'AF'; // column 32 (issue_status at index 31)
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!${colLetter}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[issue_status]] },
    });

    return NextResponse.json({ ok: true, event_id: eventId, issue_status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('PATCH /api/events/[eventId] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
