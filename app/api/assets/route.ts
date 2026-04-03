import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

const VEH_COLS = ['asset_id','license_plate','year','make','model','color','type','vin','island','assigned_to','registration_exp','safety_exp','insurance_exp','last_service_date','notes','status'];
const EQ_COLS  = ['asset_id','name','category','make','model','serial_number','island','assigned_to','purchase_date','last_service_date','next_service_due','notes','status'];

function rowToObj(row: string[], cols: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  cols.forEach((c, i) => { obj[c] = row[i] || ''; });
  return obj;
}

// GET — fetch vehicles and equipment
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'vehicles'; // vehicles | equipment

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const tab = type === 'equipment' ? 'Equipment' : 'Vehicles';
    const cols = type === 'equipment' ? EQ_COLS : VEH_COLS;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A2:P200`,
    });

    const rows = (res.data.values || [])
      .filter(r => r[0]) // must have asset_id
      .map(r => rowToObj(r.map(String), cols));

    return NextResponse.json({ assets: rows, type });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), assets: [] }, { status: 500 });
  }
}

// POST — add new asset
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type = 'vehicles', ...fields } = body;

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const tab = type === 'equipment' ? 'Equipment' : 'Vehicles';
    const cols = type === 'equipment' ? EQ_COLS : VEH_COLS;

    // Generate next ID
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A2:A200` });
    const ids = (existing.data.values || []).map(r => r[0]).filter(Boolean);
    const prefix = type === 'equipment' ? 'EQ-' : 'VEH-';
    const maxNum = ids.reduce((max, id) => {
      const num = parseInt(String(id).replace(prefix, '')) || 0;
      return Math.max(max, num);
    }, 0);
    const newId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

    const row = cols.map(c => c === 'asset_id' ? newId : (fields[c] || ''));

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true, asset_id: newId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// PATCH — update asset field
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { type = 'vehicles', asset_id, ...fields } = body;
    if (!asset_id) return NextResponse.json({ error: 'asset_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const tab = type === 'equipment' ? 'Equipment' : 'Vehicles';
    const cols = type === 'equipment' ? EQ_COLS : VEH_COLS;

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A2:P200` });
    const rows = res.data.values || [];
    const rowIdx = rows.findIndex(r => r[0] === asset_id);
    if (rowIdx === -1) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const existing = rows[rowIdx].map(String);
    const updated = cols.map((c, i) => fields[c] !== undefined ? fields[c] : (existing[i] || ''));

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A${rowIdx + 2}:P${rowIdx + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updated] },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
