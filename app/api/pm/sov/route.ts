import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const COLS = ['sov_id','kID','line_number','description','scheduled_value','previous_periods','this_period','stored_materials','retainage_pct','total_pct','balance_to_finish','version','locked','created_at'];

function rowToObj(row: string[]) {
  const o: Record<string,string> = {};
  COLS.forEach((c,i) => { o[c] = row[i] || ''; });
  return o;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kID = searchParams.get('kID') || '';
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Schedule_of_Values!A2:N5000' });
    let rows = (res.data.values || []).filter(r => r[0]).map(r => rowToObj(r.map(String)));
    if (kID) rows = rows.filter(r => r.kID === kID);
    // Sort by line number
    rows.sort((a, b) => parseInt(a.line_number) - parseInt(b.line_number));
    return NextResponse.json({ sov: rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), sov: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kID, lines } = body; // lines: array of {line_number, description, scheduled_value, retainage_pct}
    if (!kID || !lines?.length) return NextResponse.json({ error: 'kID and lines required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();
    const version = '1';

    const rows = lines.map((line: Record<string,string>, idx: number) => {
      const sov_id = `SOV-${kID}-${String(idx+1).padStart(3,'0')}`;
      return [sov_id, kID, line.line_number || String(idx+1), line.description, line.scheduled_value || '0', '0','0','0', line.retainage_pct || '5', '0', line.scheduled_value || '0', version, 'false', now];
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Schedule_of_Values!A1',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { sov_id, ...updates } = body;
    if (!sov_id) return NextResponse.json({ error: 'sov_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Schedule_of_Values!A2:N5000' });
    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === sov_id);
    if (idx === -1) return NextResponse.json({ error: 'SOV line not found' }, { status: 404 });

    const row = rows[idx].map(String);
    while (row.length < 14) row.push('');
    COLS.forEach((c, i) => { if (updates[c] !== undefined) row[i] = String(updates[c]); });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Schedule_of_Values!A${idx+2}:N${idx+2}`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
