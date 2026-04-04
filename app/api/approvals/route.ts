import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB_NAME = 'Approvals';
const HEADERS = ['approval_id', 'timestamp', 'action', 'detail', 'risk', 'status', 'source', 'notes'];

async function ensureTab(sheets: ReturnType<typeof google.sheets>) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB_NAME);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A2:H500`,
    });

    const rows = res.data.values || [];
    const approvals = rows
      .filter(r => r[0])
      .map(r => ({
        id: r[0] || '',
        ts: r[1] || '',
        action: r[2] || '',
        detail: r[3] || '',
        risk: (r[4] || 'low') as 'low' | 'medium' | 'high',
        status: (r[5] || 'pending') as 'pending' | 'approved' | 'denied',
        source: r[6] || '',
        notes: r[7] || '',
      }));

    return NextResponse.json({ approvals });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, approvals: [] }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { approval_id, status, notes } = await req.json();
    if (!approval_id || !status) {
      return NextResponse.json({ error: 'approval_id and status required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB_NAME}!A2:H500`,
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === approval_id);
    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
    }

    const sheetRow = rowIndex + 2; // 1-indexed + header
    const updates: { range: string; values: string[][] }[] = [
      { range: `${TAB_NAME}!F${sheetRow}`, values: [[status]] },
    ];
    if (notes !== undefined) {
      updates.push({ range: `${TAB_NAME}!H${sheetRow}`, values: [[notes]] });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
