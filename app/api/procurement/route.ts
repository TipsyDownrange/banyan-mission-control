import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Procurement tab columns: procurement_id, wo_id, description, supplier, supplier_order_ref,
// order_method, quantity, unit_cost, total_cost, ordered_by, ordered_date, eta_date,
// tracking_number, received_date, received_by, status, created_at, updated_at
const H = {
  procurement_id: 0, wo_id: 1, description: 2, supplier: 3, supplier_order_ref: 4,
  order_method: 5, quantity: 6, unit_cost: 7, total_cost: 8, ordered_by: 9,
  ordered_date: 10, eta_date: 11, tracking_number: 12, received_date: 13,
  received_by: 14, status: 15, created_at: 16, updated_at: 17,
};

function rowToItem(r: string[]) {
  return {
    procurement_id: r[H.procurement_id],
    wo_id: r[H.wo_id],
    description: r[H.description],
    supplier: r[H.supplier],
    order_method: r[H.order_method],
    quantity: r[H.quantity],
    unit_cost: r[H.unit_cost],
    total_cost: r[H.total_cost],
    ordered_date: r[H.ordered_date],
    eta_date: r[H.eta_date],
    tracking_number: r[H.tracking_number],
    received_date: r[H.received_date],
    status: r[H.status] || 'ORDERED',
    created_at: r[H.created_at],
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
      range: 'Procurement!A2:R2000',
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
  const { procurement_id, wo_id, description, supplier, order_method, quantity, unit_cost, ordered_date, eta_date, tracking_number } = body;
  if (!wo_id || !description?.trim()) {
    return NextResponse.json({ error: 'wo_id and description required' }, { status: 400 });
  }
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();
    const procId = procurement_id || ('proc_' + Math.random().toString(36).slice(2, 14));
    const total = (Number(quantity) || 1) * (Number(unit_cost) || 0);
    const row = new Array(18).fill('');
    row[H.procurement_id] = procId;
    row[H.wo_id] = wo_id;
    row[H.description] = description.trim();
    row[H.supplier] = supplier || '';
    row[H.order_method] = order_method || 'ONLINE';
    row[H.quantity] = quantity || '1';
    row[H.unit_cost] = unit_cost || '0';
    row[H.total_cost] = String(total);
    row[H.ordered_by] = session.user.email;
    row[H.ordered_date] = ordered_date || now.slice(0, 10);
    row[H.eta_date] = eta_date || '';
    row[H.tracking_number] = tracking_number || '';
    row[H.status] = 'ORDERED';
    row[H.created_at] = now;
    row[H.updated_at] = now;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Procurement!A:R',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    return NextResponse.json({ procurement_id: procId, success: true });
  } catch (err) {
    console.error('[/api/procurement POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
