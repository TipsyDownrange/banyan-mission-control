import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const COLS = ['sub_id','sub_number','kID','status','spec_section','description','submitted_to_gc_date','gc_to_arch_date','arch_reviewed_date','gc_returned_date','we_received_date','revision_number','ball_in_court','notes','drive_file_id'];

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
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Submittal_Log!A2:O5000' });
    let rows = (res.data.values || []).filter(r => r[0]).map(r => rowToObj(r.map(String)));
    if (kID) rows = rows.filter(r => r.kID === kID);

    const overdue = rows.filter(r => {
      if (r.status !== 'SUBMITTED' || !r.submitted_to_gc_date) return false;
      const daysSince = Math.floor((Date.now() - new Date(r.submitted_to_gc_date).getTime()) / 86400000);
      return daysSince > 14; // flag if no response in 14 days
    }).length;

    return NextResponse.json({ submittals: rows, summary: { overdue, total: rows.length, approved: rows.filter(r => r.status === 'APPROVED').length, pending: rows.filter(r => ['SUBMITTED','UNDER_REVIEW'].includes(r.status)).length } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), submittals: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kID, spec_section, description, drive_file_id } = body;
    if (!kID || !spec_section) return NextResponse.json({ error: 'kID and spec_section required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Submittal_Log!A2:C5000' });
    const projectSubs = (existing.data.values || []).filter(r => r[2] === kID).length;
    const sub_number = String(projectSubs + 1).padStart(3,'0');
    const sub_id = `SUB-${kID}-${sub_number}-${Date.now()}`;

    const row = [sub_id, sub_number, kID, 'PENDING', spec_section, description||'','','','','','','1','KULA_GLASS','', drive_file_id||''];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Submittal_Log!A1',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true, sub_id, sub_number });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { sub_id, ...updates } = body;
    if (!sub_id) return NextResponse.json({ error: 'sub_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Submittal_Log!A2:O5000' });
    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === sub_id);
    if (idx === -1) return NextResponse.json({ error: 'Submittal not found' }, { status: 404 });

    const row = rows[idx].map(String);
    while (row.length < 15) row.push('');
    COLS.forEach((c,i) => { if (updates[c] !== undefined) row[i] = String(updates[c]); });

    // Auto-set ball_in_court based on status
    if (updates.status) {
      const btc: Record<string,string> = { 'PENDING':'KULA_GLASS','SUBMITTED':'GC','UNDER_REVIEW':'ARCHITECT','APPROVED':'KULA_GLASS','REVISE_RESUBMIT':'KULA_GLASS','REJECTED':'KULA_GLASS' };
      if (btc[updates.status]) row[12] = btc[updates.status];
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Submittal_Log!A${idx+2}:O${idx+2}`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
