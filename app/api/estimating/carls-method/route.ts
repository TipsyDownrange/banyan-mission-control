import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Carls_Method';
const HEADERS = ['CM_ID', 'Bid_Version_ID', 'Data_JSON', 'Updated_At'];

async function getSheets() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  return google.sheets({ version: 'v4', auth });
}

async function ensureTab(sheets: ReturnType<typeof google.sheets>) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

// GET /api/estimating/carls-method?bidVersionId=xxx
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bidVersionId = url.searchParams.get('bidVersionId');
  if (!bidVersionId) {
    return NextResponse.json({ error: 'bidVersionId required' }, { status: 400 });
  }

  try {
    const sheets = await getSheets();
    await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A2:D2000`,
    });
    const rows = (res.data.values || []) as string[][];
    const row = rows.find(r => r[1] === bidVersionId);
    if (!row) {
      return NextResponse.json({ data: null });
    }

    try {
      const data = JSON.parse(row[2] || '{}');
      return NextResponse.json({ data, updatedAt: row[3] });
    } catch {
      return NextResponse.json({ data: null });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/estimating/carls-method — Save (upsert) Carl's Method data
export async function POST(req: Request) {
  try {
    const { bidVersionId, data } = await req.json();
    if (!bidVersionId) {
      return NextResponse.json({ error: 'bidVersionId required' }, { status: 400 });
    }

    const sheets = await getSheets();
    await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A2:D2000`,
    });
    const rows = (res.data.values || []) as string[][];
    const rowIndex = rows.findIndex(r => r[1] === bidVersionId);
    const now = new Date().toISOString();
    const jsonStr = JSON.stringify(data);

    if (rowIndex === -1) {
      // Insert new row
      const cmId = `CM-${Date.now()}`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A:D`,
        valueInputOption: 'RAW',
        requestBody: { values: [[cmId, bidVersionId, jsonStr, now]] },
      });
    } else {
      // Update existing row
      const sheetRow = rowIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!C${sheetRow}:D${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[jsonStr, now]] },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
