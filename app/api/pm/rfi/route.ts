import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();
const COLS = ['rfi_id','rfi_number','kID','rfi_type','status','subject','spec_section','drawing_ref','description','created_by','created_at','submitted_at','addressed_to','response_required_by','impact_schedule','impact_cost','impact_scope','response_received_at','response_text','response_quality','responder','days_open','ball_in_court','linked_field_issue','linked_co'];

function rowToObj(row: string[]) {
  const o: Record<string,string> = {};
  COLS.forEach((c,i) => { o[c] = row[i] || ''; });
  // Calculate days open
  if (o.submitted_at && !o.response_received_at) {
    const days = Math.floor((Date.now() - new Date(o.submitted_at).getTime()) / 86400000);
    o.days_open = String(days);
  }
  return o;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kID = searchParams.get('kID') || '';
    const rfi_type = searchParams.get('type') || ''; // OUTBOUND | INBOUND
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RFI_Log!A2:Y5000' });
    let rows = (res.data.values || []).filter(r => r[0]).map(r => rowToObj(r.map(String)));
    if (kID) rows = rows.filter(r => r.kID === kID);
    if (rfi_type) rows = rows.filter(r => r.rfi_type === rfi_type);

    const overdue = rows.filter(r => r.status === 'SUBMITTED' && r.response_required_by && new Date(r.response_required_by) < new Date()).length;
    const ballInCourtGC = rows.filter(r => r.ball_in_court === 'GC' || r.ball_in_court === 'ARCHITECT').length;
    const ballInCourtUs = rows.filter(r => r.ball_in_court === 'KULA_GLASS').length;

    return NextResponse.json({ rfis: rows, summary: { overdue, ballInCourtGC, ballInCourtUs, total: rows.length } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), rfis: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { kID, rfi_type = 'OUTBOUND', subject, spec_section, drawing_ref, description, created_by, addressed_to, response_required_by, linked_field_issue } = body;
    if (!kID || !subject) return NextResponse.json({ error: 'kID and subject required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RFI_Log!A2:C5000' });
    const projectRFIs = (existing.data.values || []).filter(r => r[2] === kID).length;
    const rfi_number = rfi_type === 'INBOUND' ? `IB-RFI-${String(projectRFIs+1).padStart(3,'0')}` : `RFI-${String(projectRFIs+1).padStart(3,'0')}`;
    const rfi_id = `${kID}-${rfi_number}-${Date.now()}`;
    const now = new Date().toISOString();

    const row = [rfi_id, rfi_number, kID, rfi_type, 'DRAFT', subject, spec_section||'', drawing_ref||'', description||'', created_by||'', now, '', addressed_to||'', response_required_by||'', 'false','false','CLARIFICATION','','','','','0','KULA_GLASS', linked_field_issue||'',''];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'RFI_Log!A1',
      valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true, rfi_id, rfi_number });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { rfi_id, ...updates } = body;
    if (!rfi_id) return NextResponse.json({ error: 'rfi_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RFI_Log!A2:Y5000' });
    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === rfi_id);
    if (idx === -1) return NextResponse.json({ error: 'RFI not found' }, { status: 404 });

    const row = rows[idx].map(String);
    while (row.length < 25) row.push('');
    COLS.forEach((c,i) => { if (updates[c] !== undefined) row[i] = String(updates[c]); });

    // Auto-detect response quality if response_text provided
    if (updates.response_text && !updates.response_quality) {
      const text = updates.response_text.toLowerCase();
      if (text.includes('refer to') || text.includes('coordinate with') || text.includes('see spec')) row[19] = 'PUNTED';
      else if (text.includes('shall') || text.includes('use') || text.includes('install') || text.includes('provide')) row[19] = 'CLEAR_DIRECTIVE';
      else row[19] = 'AMBIGUOUS';
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `RFI_Log!A${idx+2}:Y${idx+2}`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
