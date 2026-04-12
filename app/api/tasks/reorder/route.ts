/**
 * POST /api/tasks/reorder
 * Body: { phase: string, order: string[] } — array of task IDs in new order
 * Updates Sort_Order (col O) for each task in the array.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Tasks';
const RANGE = `${TAB}!A2:P2000`;

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { order } = await req.json() as { phase?: string; order: string[] };
  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'order array required' }, { status: 400 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: RANGE });
    const rows = (res.data.values || []) as string[][];

    const updates: { range: string; values: string[][] }[] = [];
    order.forEach((taskId, i) => {
      const rowIdx = rows.findIndex(r => r[0] === taskId);
      if (rowIdx !== -1) {
        updates.push({ range: `${TAB}!O${rowIdx + 2}`, values: [[String(i + 1)]] });
      }
    });

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: updates },
      });
    }

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (err) {
    console.error('[tasks/reorder]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
