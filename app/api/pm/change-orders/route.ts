import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const COLS = ['co_id','co_number','kID','status','title','description','basis','trigger_type','trigger_ref','amount_requested','amount_approved','schedule_impact_days','submitted_at','approved_at','approved_by','sov_line','exhibits','internal_notes','created_at'];

function rowToObj(row: string[]) {
  const o: Record<string,string> = {};
  COLS.forEach((c,i) => { o[c] = row[i] || ''; });
  return o;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kID = searchParams.get('kID') || '';
    const status = searchParams.get('status') || '';
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Change_Orders!A2:S5000' });
    let rows = (res.data.values || []).filter(r => r[0]).map(r => rowToObj(r.map(String)));
    if (kID) rows = rows.filter(r => r.kID === kID);
    if (status) rows = rows.filter(r => r.status === status);

    // Calculate exposure summary
    const approved = rows.filter(r => r.status === 'APPROVED').reduce((sum, r) => sum + parseFloat(r.amount_approved || '0'), 0);
    const pending = rows.filter(r => ['SUBMITTED','IN_NEGOTIATION'].includes(r.status)).reduce((sum, r) => sum + parseFloat(r.amount_requested || '0'), 0);
    const drafted = rows.filter(r => r.status === 'DRAFTED').reduce((sum, r) => sum + parseFloat(r.amount_requested || '0'), 0);
    const identified = rows.filter(r => r.status === 'IDENTIFIED').reduce((sum, r) => sum + parseFloat(r.amount_requested || '0'), 0);
    const rejected = rows.filter(r => r.status === 'REJECTED').reduce((sum, r) => sum + parseFloat(r.amount_requested || '0'), 0);

    return NextResponse.json({ cos: rows, exposure: { approved, pending, drafted, identified, rejected } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), cos: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kID, title, description, basis, trigger_type, trigger_ref, amount_requested, schedule_impact_days, sov_line, internal_notes } = body;
    if (!kID || !title) return NextResponse.json({ error: 'kID and title required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get next CO number for this project
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Change_Orders!A2:C5000' });
    const projectCOs = (existing.data.values || []).filter(r => r[2] === kID).length;
    const co_number = `CO-${String(projectCOs + 1).padStart(3,'0')}`;
    const co_id = `${kID}-${co_number}-${Date.now()}`;
    const now = new Date().toISOString();

    const row = [co_id, co_number, kID, 'IDENTIFIED', title, description || '', basis || '', trigger_type || 'PM_INITIATED', trigger_ref || '', amount_requested || '0', '0', schedule_impact_days || '0', '', '', '', sov_line || '', '', internal_notes || '', now];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Change_Orders!A1',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true, co_id, co_number });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { co_id, ...updates } = body;
    if (!co_id) return NextResponse.json({ error: 'co_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Change_Orders!A2:S5000' });
    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === co_id);
    if (idx === -1) return NextResponse.json({ error: 'CO not found' }, { status: 404 });

    const row = rows[idx].map(String);
    while (row.length < 19) row.push('');
    COLS.forEach((c,i) => { if (updates[c] !== undefined) row[i] = String(updates[c]); });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Change_Orders!A${idx+2}:S${idx+2}`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
