import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const CUSTOMER_DB = '1ZJtlJPM0GBogzdIRlC50JpNpi96bSY7tS7xnIn08d6A';

async function getSheetData(tab: string, search = '') {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const range = tab === 'gc' ? 'GC_Contacts!A1:J500' : tab === 'gc_people' ? 'GC_People!A1:G500' : 'Customers!A1:N500';
  const result = await sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_DB, range });
  const rows = result.data.values || [];
  if (rows.length < 2) return { headers: [], records: [] };
  const headers = rows[0] as string[];
  const records = rows.slice(1).map(row => {
    const r: Record<string, string> = {};
    headers.forEach((h, i) => { r[h] = row[i] || ''; });
    return r;
  }).filter(r => {
    if (!search) return true;
    return Object.values(r).some(v => v.toLowerCase().includes(search.toLowerCase()));
  });
  return { headers, records };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab') || 'customers';
  const search = searchParams.get('search') || '';
  try {
    const { records } = await getSheetData(tab, search);
    return NextResponse.json({ records, total: records.length });
  } catch (err) {
    return NextResponse.json({ error: String(err), records: [], total: 0 }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { tab, id, data } = await req.json();
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const idKey = tab === 'gc' ? 'GC ID' : 'Customer ID';
    const range = tab === 'gc' ? 'GC_Contacts!A1:J500' : tab === 'gc_people' ? 'GC_People!A1:G500' : 'Customers!A1:N500';

    const result = await sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_DB, range });
    const rows = result.data.values || [];
    const headers = rows[0] as string[];
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[headers.indexOf(idKey)] === id);
    if (rowIndex === -1) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

    // Build updated row
    const updatedRow = headers.map(h => data[h] !== undefined ? data[h] : (rows[rowIndex][headers.indexOf(h)] || ''));
    const sheetName = tab === 'gc' ? 'GC_Contacts' : tab === 'gc_people' ? 'GC_People' : 'Customers';
    await sheets.spreadsheets.values.update({
      spreadsheetId: CUSTOMER_DB,
      range: `${sheetName}!A${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [updatedRow] },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { tab, data } = await req.json();
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const sheetName = tab === 'gc' ? 'GC_Contacts' : tab === 'gc_people' ? 'GC_People' : 'Customers';
    const range = `${sheetName}!A1:J1`;
    const headerRes = await sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_DB, range: `${sheetName}!A1:N1` });
    const headers = headerRes.data.values?.[0] as string[] || [];

    // Get next ID
    const allRes = await sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_DB, range: `${sheetName}!A:A` });
    const count = (allRes.data.values?.length || 1);
    const prefix = tab === 'gc' ? 'GC' : 'CUS';
    const newId = `${prefix}-${String(count).padStart(4, '0')}`;

    const idKey = tab === 'gc' ? 'GC ID' : 'Customer ID';
    const newRow = headers.map(h => h === idKey ? newId : (data[h] || ''));
    await sheets.spreadsheets.values.append({
      spreadsheetId: CUSTOMER_DB,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    });

    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = newRow[i]; });
    return NextResponse.json({ record });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
