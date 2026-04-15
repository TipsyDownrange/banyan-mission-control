import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Actual Procurement tab columns (verified 2026-04-15 from sheet header row):
// A: proc_id | B: kID | C: item_description | D: vendor | E: activity_ref
// F: order_deadline | G: lead_time_weeks | H: ordered_date | I: po_number
// J: eta_date | K: delivered_date | L: status | M: notes
const H = {
  procurement_id: 0,    // A — proc_id
  wo_id: 1,             // B — kID
  description: 2,       // C — item_description
  supplier: 3,          // D — vendor
  supplier_order_ref: 4, // E — activity_ref
  order_deadline: 5,    // F — order_deadline
  lead_time_weeks: 6,   // G — lead_time_weeks
  ordered_date: 7,      // H — ordered_date
  tracking_number: 8,   // I — po_number
  eta_date: 9,          // J — eta_date
  received_date: 10,    // K — delivered_date
  status: 11,           // L — status
  notes: 12,            // M — notes (stores inspection result as "[RESULT] notes")
};

function colLetter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

function rowToItem(r: string[]) {
  const rawNotes = r[H.notes] || '';
  // Parse "[INSPECTION_STATUS] notes text" format written by PATCH
  const inspMatch = rawNotes.match(/^\[([A-Z_]+)\] ?([\s\S]*)/);
  const inspection_status = inspMatch ? inspMatch[1] : '';
  const inspection_notes = inspMatch ? inspMatch[2] : rawNotes;
  return {
    procurement_id: r[H.procurement_id] || '',
    wo_id: r[H.wo_id] || '',
    description: r[H.description] || '',
    supplier: r[H.supplier] || '',
    supplier_order_ref: r[H.supplier_order_ref] || '',
    order_method: r[H.order_deadline] || '',  // order_deadline col reused for display
    ordered_date: r[H.ordered_date] || '',
    tracking_number: r[H.tracking_number] || '',
    tracking_url: '',  // not in sheet; keep field for UI compat
    eta_date: r[H.eta_date] || '',
    received_date: r[H.received_date] || '',
    received_by: '',   // not in sheet; kept for UI compat
    status: r[H.status] || 'ORDERED',
    inspection_status,
    inspection_notes,
  };
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const woId = new URL(req.url).searchParams.get('wo_id');
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A2:M2000',
    });
    const rows = (res.data.values || []) as string[][];
    const items = rows
      .filter(r => r[H.procurement_id] && (!woId || r[H.wo_id] === woId))
      .map(rowToItem);
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[/api/procurement GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { procurement_id, wo_id, description, supplier, supplier_order_ref, ordered_date, eta_date, tracking_number } = body;
  if (!wo_id || !description?.trim()) {
    return NextResponse.json({ error: 'wo_id and description required' }, { status: 400 });
  }
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();
    const procId = procurement_id || ('proc_' + Math.random().toString(36).slice(2, 14));
    const row = new Array(13).fill('');
    row[H.procurement_id] = procId;
    row[H.wo_id] = wo_id;
    row[H.description] = description.trim();
    row[H.supplier] = supplier || '';
    row[H.supplier_order_ref] = supplier_order_ref || '';
    row[H.ordered_date] = ordered_date || now.slice(0, 10);
    row[H.tracking_number] = tracking_number || '';
    row[H.eta_date] = eta_date || '';
    row[H.status] = 'ORDERED';
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A:M',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    return NextResponse.json({ procurement_id: procId, success: true });
  } catch (err) {
    console.error('[/api/procurement POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json();
  const { procurement_id, ...updates } = body;
  if (!procurement_id) return NextResponse.json({ error: 'procurement_id required' }, { status: 400 });
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A2:M5000',
    });
    const rows = (res.data.values || []) as string[][];
    const idx = rows.findIndex(r => r[H.procurement_id] === procurement_id);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sheetRow = idx + 2;

    // Fields that map directly to sheet columns
    const fieldMap: Record<string, number> = {
      description: H.description,
      supplier: H.supplier,
      supplier_order_ref: H.supplier_order_ref,
      ordered_date: H.ordered_date,
      tracking_number: H.tracking_number,
      eta_date: H.eta_date,
      received_date: H.received_date,
      status: H.status,
    };

    const patchData: { range: string; values: string[][] }[] = [];

    for (const [field, colIdx] of Object.entries(fieldMap)) {
      if (updates[field] !== undefined) {
        patchData.push({
          range: `Procurement!${colLetter(colIdx)}${sheetRow}`,
          values: [[String(updates[field])]],
        });
      }
    }

    // inspection_status + inspection_notes → combined into notes col as "[STATUS] notes"
    if (updates.inspection_status !== undefined || updates.inspection_notes !== undefined) {
      const iStatus = updates.inspection_status ?? '';
      const iNotes = updates.inspection_notes ?? '';
      const combined = iStatus ? `[${iStatus}] ${iNotes}` : iNotes;
      patchData.push({
        range: `Procurement!${colLetter(H.notes)}${sheetRow}`,
        values: [[combined]],
      });
    }

    // received_by: no dedicated column — skip (status + received_date convey delivery)

    if (patchData.length === 0) return NextResponse.json({ success: true, note: 'nothing to update' });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: patchData },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/procurement PATCH]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const procurement_id = searchParams.get('procurement_id');
  const cancel_reason = searchParams.get('reason') || '';
  if (!procurement_id) return NextResponse.json({ error: 'procurement_id required' }, { status: 400 });
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A2:M5000',
    });
    const rows = (res.data.values || []) as string[][];
    const idx = rows.findIndex(r => r[H.procurement_id] === procurement_id);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sheetRow = idx + 2;
    // Soft delete: set status to CANCELLED, store reason in notes
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `Procurement!${colLetter(H.status)}${sheetRow}`, values: [['CANCELLED']] },
          { range: `Procurement!${colLetter(H.notes)}${sheetRow}`, values: [[cancel_reason ? `[CANCELLED] ${cancel_reason}` : '[CANCELLED]']] },
        ],
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/procurement DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
