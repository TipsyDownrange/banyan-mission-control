import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const CUSTOMER_DB = '1ZJtlJPM0GBogzdIRlC50JpNpi96bSY7tS7xnIn08d6A';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab') || 'customers';
  const search = searchParams.get('search') || '';

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const range = tab === 'gc' ? 'GC_Contacts!A1:J500' : 'Customers!A1:N500';
    const result = await sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_DB, range });
    const rows = result.data.values || [];
    if (rows.length < 2) return NextResponse.json({ records: [], total: 0 });

    const headers = rows[0];
    const records = rows.slice(1).map(row => {
      const r: Record<string, string> = {};
      headers.forEach((h, i) => { r[h as string] = row[i] || ''; });
      return r;
    }).filter(r => {
      if (!search) return true;
      const s = search.toLowerCase();
      return Object.values(r).some(v => v.toLowerCase().includes(s));
    });

    return NextResponse.json({ records, total: records.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, records: [], total: 0 }, { status: 500 });
  }
}
