import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { checkPermission } from '@/lib/permissions';

const CUSTOMER_DB = getBackendSheetId();
const LEGACY_WRITE_DISABLED = {
  error: 'Legacy /api/customers writes are disabled. Use canonical organization/customer flows.',
  canonical_path: '/api/organizations',
};

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
  const { allowed } = await checkPermission(req, 'wo:view');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:view required' }, { status: 403 });

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

export async function PATCH() {
  return NextResponse.json(LEGACY_WRITE_DISABLED, { status: 410 });
}

export async function POST() {
  return NextResponse.json(LEGACY_WRITE_DISABLED, { status: 410 });
}
