import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { GET_PASS_ON_RATE, getGETRate } from '@/lib/tax-rates';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Carls_Method';
const HEADERS = ['CM_ID', 'Bid_Version_ID', 'Data_JSON', 'Updated_At'];

// WO estimates use "WO-<id>" as the Bid_Version_ID to namespace them separately
// from project bids which use their own bid version IDs.

function woKey(woId: string): string {
  return woId.startsWith('WO-') ? woId : `WO-${woId}`;
}

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

async function getWOIsland(sheets: ReturnType<typeof google.sheets>, woId: string): Promise<string> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Service_Work_Orders!A2:F5000',
  });
  const normalized = woId.trim();
  const stripped = normalized.replace(/^WO-/i, '');
  const row = (res.data.values || []).find((current) => {
    const currentWoId = (current[0] || '').trim();
    const currentWoNumber = (current[1] || '').trim();
    return currentWoId === normalized || currentWoId === `WO-${stripped}` || currentWoNumber === stripped;
  });
  return (row?.[5] || '').trim();
}

// GET /api/service/estimate?wo=<woId>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const woId = url.searchParams.get('wo');
  if (!woId) {
    return NextResponse.json({ error: 'wo parameter required' }, { status: 400 });
  }

  const bidVersionId = woKey(woId);

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
      const island = await getWOIsland(sheets, woId);
      // taxRate always from lib/tax-rates.ts — JSON value ignored to prevent stale data
      data.taxRate = String(getGETRate(island || '') || GET_PASS_ON_RATE);
      return NextResponse.json({ data, updatedAt: row[3] });
    } catch {
      return NextResponse.json({ data: null });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/service/estimate — upsert estimate data for a WO
export async function POST(req: Request) {
  try {
    const { woId, data } = await req.json();
    if (!woId) {
      return NextResponse.json({ error: 'woId required' }, { status: 400 });
    }

    const bidVersionId = woKey(woId);
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
      const cmId = `CM-WO-${Date.now()}`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${TAB}!A:D`,
        valueInputOption: 'RAW',
        requestBody: { values: [[cmId, bidVersionId, jsonStr, now]] },
      });
    } else {
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
