import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { normalizeAddressComponent, normalizeNameForWrite } from '@/lib/normalize';

const SHEET_ID = getBackendSheetId();

// Procurement_Items tab — 25-column schema (A-Y)
// A:procurement_id | B:wo_id | C:vendor_org_id | D:vendor_name | E:item_description
// F:quantity | G:unit | H:unit_cost | I:line_total | J:status | K:order_method
// L:order_ref | M:quote_date | N:quote_valid_until | O:order_date | P:eta_date
// Q:tracking_number | R:tracking_url | S:received_date | T:received_by
// U:inspection_status | V:inspection_notes | W:notes | X:created_at | Y:updated_at
const H = {
  procurement_id: 0,
  wo_id: 1,
  vendor_org_id: 2,
  vendor_name: 3,
  item_description: 4,
  quantity: 5,
  unit: 6,
  unit_cost: 7,
  line_total: 8,
  status: 9,
  order_method: 10,
  order_ref: 11,
  quote_date: 12,
  quote_valid_until: 13,
  order_date: 14,
  eta_date: 15,
  tracking_number: 16,
  tracking_url: 17,
  received_date: 18,
  received_by: 19,
  inspection_status: 20,
  inspection_notes: 21,
  notes: 22,
  created_at: 23,
  updated_at: 24,
  quote_document_url: 25,  // Z
  quote_document_name: 26, // AA
};

function colLetter(idx: number): string {
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

function normalizeProcurementField(field: string, value: unknown): string {
  const raw = String(value ?? '');
  if (field === 'vendor_name' || field === 'received_by' || field === 'quote_document_name') {
    return normalizeNameForWrite(raw);
  }
  return normalizeAddressComponent(raw);
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
      range: 'Procurement!A2:AA5000',
    });
    const rows = (res.data.values || []) as string[][];
    const orders: Record<string, {
      procurement_id: string; wo_id: string; vendor_org_id: string; vendor_name: string;
      status: string; order_method: string; order_ref: string; quote_date: string;
      quote_valid_until: string; order_date: string; eta_date: string;
      tracking_number: string; tracking_url: string; received_date: string;
      received_by: string; inspection_status: string; inspection_notes: string;
      quote_document_url: string; quote_document_name: string;
      notes: string; line_items: any[]; total_cost: number;
    }> = {};
    for (const r of rows.filter(r => r[H.procurement_id] && (!woId || r[H.wo_id] === woId))) {
      const procId = r[H.procurement_id];
      if (!orders[procId]) {
        orders[procId] = {
          procurement_id: procId,
          wo_id: r[H.wo_id],
          vendor_org_id: r[H.vendor_org_id] || '',
          vendor_name: r[H.vendor_name] || '',
          status: r[H.status] || 'VENDOR_QUOTED',
          order_method: r[H.order_method] || '',
          order_ref: r[H.order_ref] || '',
          quote_date: r[H.quote_date] || '',
          quote_valid_until: r[H.quote_valid_until] || '',
          order_date: r[H.order_date] || '',
          eta_date: r[H.eta_date] || '',
          tracking_number: r[H.tracking_number] || '',
          tracking_url: r[H.tracking_url] || '',
          received_date: r[H.received_date] || '',
          received_by: r[H.received_by] || '',
          inspection_status: r[H.inspection_status] || '',
          inspection_notes: r[H.inspection_notes] || '',
          quote_document_url: r[H.quote_document_url] || '',
          quote_document_name: r[H.quote_document_name] || '',
          notes: r[H.notes] || '',
          line_items: [],
          total_cost: 0,
        };
      }
      const lineTotal = Number(r[H.line_total]) || ((Number(r[H.quantity]) || 0) * (Number(r[H.unit_cost]) || 0));
      orders[procId].line_items.push({
        description: r[H.item_description] || '',
        quantity: r[H.quantity] || '',
        unit: r[H.unit] || 'EA',
        unit_cost: r[H.unit_cost] || '',
        line_total: lineTotal,
      });
      orders[procId].total_cost += lineTotal;
    }
    return NextResponse.json({ orders: Object.values(orders) });
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
  const { wo_id, vendor_org_id, vendor_name, line_items, quote_date, quote_valid_until, notes, quote_document_url, quote_document_name } = body;
  if (!wo_id || !Array.isArray(line_items) || line_items.length === 0) {
    return NextResponse.json({ error: 'wo_id and line_items required' }, { status: 400 });
  }
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();
    const procId = 'proc_' + Math.random().toString(36).slice(2, 14);
    const rows = line_items.map((item: any) => {
      const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0);
      const row = new Array(25).fill('');
      row[H.procurement_id] = procId;
      row[H.wo_id] = wo_id;
      row[H.vendor_org_id] = vendor_org_id || '';
      row[H.vendor_name] = normalizeNameForWrite(String(vendor_name || ''));
      row[H.item_description] = normalizeAddressComponent(String(item.description || ''));
      row[H.quantity] = String(item.quantity || 1);
      row[H.unit] = normalizeAddressComponent(String(item.unit || 'EA'));
      row[H.unit_cost] = String(item.unit_cost || 0);
      row[H.line_total] = String(lineTotal);
      row[H.status] = 'VENDOR_QUOTED';
      row[H.quote_date] = quote_date || now.slice(0, 10);
      row[H.quote_valid_until] = quote_valid_until || '';
      row[H.notes] = normalizeAddressComponent(String(notes || ''));
      row[H.quote_document_url] = normalizeAddressComponent(String(quote_document_url || ''));
      row[H.quote_document_name] = normalizeNameForWrite(String(quote_document_name || ''));
      row[H.created_at] = now;
      row[H.updated_at] = now;
      return row;
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A:AA',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
    return NextResponse.json({ procurement_id: procId, success: true, line_count: rows.length });
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
      range: 'Procurement!A2:AA5000',
    });
    const rows = (res.data.values || []) as string[][];
    const now = new Date().toISOString();

    // Find ALL rows matching procurement_id (multi-line-item orders)
    const matchingIndices = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r[H.procurement_id] === procurement_id)
      .map(({ i }) => i);

    if (matchingIndices.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fields that apply to all rows with matching procurement_id
    const fieldMap: Record<string, number> = {
      status: H.status,
      order_method: H.order_method,
      order_ref: H.order_ref,
      order_date: H.order_date,
      eta_date: H.eta_date,
      tracking_number: H.tracking_number,
      tracking_url: H.tracking_url,
      received_date: H.received_date,
      received_by: H.received_by,
      inspection_status: H.inspection_status,
      inspection_notes: H.inspection_notes,
      quote_document_url: H.quote_document_url,
      quote_document_name: H.quote_document_name,
      notes: H.notes,
    };

    const patchData: { range: string; values: string[][] }[] = [];

    for (const rowIdx of matchingIndices) {
      const sheetRow = rowIdx + 2; // 1-indexed + 1 for header
      for (const [field, colIdx] of Object.entries(fieldMap)) {
        if (updates[field] !== undefined) {
          patchData.push({
            range: `Procurement!${colLetter(colIdx)}${sheetRow}`,
            values: [[normalizeProcurementField(field, updates[field])]],
          });
        }
      }
      // Always stamp updated_at
      patchData.push({
        range: `Procurement!${colLetter(H.updated_at)}${sheetRow}`,
        values: [[now]],
      });
    }

    if (patchData.length === 0) {
      return NextResponse.json({ success: true, note: 'nothing to update' });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: patchData },
    });
    return NextResponse.json({ success: true, rows_updated: matchingIndices.length });
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
  if (!procurement_id) return NextResponse.json({ error: 'procurement_id required' }, { status: 400 });
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A2:AA5000',
    });
    const rows = (res.data.values || []) as string[][];
    const now = new Date().toISOString();

    // Soft delete: set status=CANCELLED on all rows with matching procurement_id
    const matchingIndices = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r[H.procurement_id] === procurement_id)
      .map(({ i }) => i);

    if (matchingIndices.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const patchData = matchingIndices.flatMap(rowIdx => {
      const sheetRow = rowIdx + 2;
      return [
        { range: `Procurement!${colLetter(H.status)}${sheetRow}`, values: [['CANCELLED']] },
        { range: `Procurement!${colLetter(H.updated_at)}${sheetRow}`, values: [[now]] },
      ];
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: patchData },
    });
    return NextResponse.json({ success: true, rows_cancelled: matchingIndices.length });
  } catch (err) {
    console.error('[/api/procurement DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
