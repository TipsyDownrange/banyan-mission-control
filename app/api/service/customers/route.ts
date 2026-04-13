import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const CUSTOMERS_TAB     = 'Customers';

// ── Types ────────────────────────────────────────────────────────────────────
export type CustomerRecord = {
  customerId:    string;
  name:          string;   // job/WO name (legacy compat)
  company:       string;
  contactPerson: string;
  title:         string;
  phone:         string;
  phone2:        string;
  email:         string;
  address:       string;
  island:        string;
  woCount:       number;
  firstWODate:   string;
  lastWODate:    string;
  source:        string;
  // Legacy fields kept for backwards compatibility
  contact:       string;
  contactPhone:  string;
  // Phase 2: Organizations link
  org_id?:       string;
};

// ── Cache ────────────────────────────────────────────────────────────────────
let customersCache: { data: CustomerRecord[]; ts: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// ── Google Sheets reader ──────────────────────────────────────────────────────
async function fetchCustomersFromGoogleSheet(): Promise<CustomerRecord[]> {
  const auth = getGoogleAuth([
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ]);
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BACKEND_SHEET_ID,
    range:         `${CUSTOMERS_TAB}!A:N`,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return []; // empty or header-only

  const headers = rows[0] as string[];
  const idx = (name: string) => headers.indexOf(name);

  const iCustomerId    = idx('Customer_ID');
  const iCompany       = idx('Company_Name');
  const iContact       = idx('Contact_Person');
  const iTitle         = idx('Title');
  const iPhone         = idx('Phone');
  const iPhone2        = idx('Phone2');
  const iEmail         = idx('Email');
  const iAddress       = idx('Address');
  const iIsland        = idx('Island');
  const iWOCount       = idx('WO_Count');
  const iFirstDate     = idx('First_WO_Date');
  const iLastDate      = idx('Last_WO_Date');
  const iSource        = idx('Source');

  return rows.slice(1).map(row => {
    const get = (i: number) => (i >= 0 ? (row[i] || '') : '');
    const phone = get(iPhone);
    return {
      customerId:    get(iCustomerId),
      name:          get(iContact) || get(iCompany),  // compat: name = contact person or company
      company:       get(iCompany),
      contactPerson: get(iContact),
      title:         get(iTitle),
      phone,
      phone2:        get(iPhone2),
      email:         get(iEmail),
      address:       get(iAddress),
      island:        get(iIsland),
      woCount:       parseInt(get(iWOCount)) || 1,
      firstWODate:   get(iFirstDate),
      lastWODate:    get(iLastDate),
      source:        get(iSource),
      // Legacy compat fields
      contact:       phone,
      contactPhone:  phone,
    };
  }).filter(r => r.contactPerson || r.company);
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET() {
  const now = Date.now();
  if (customersCache && now - customersCache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ customers: customersCache.data, source: 'cache' });
  }

  try {
    const customers = await fetchCustomersFromGoogleSheet();
    const source = 'customers-tab';

    customersCache = { data: customers, ts: now };
    return NextResponse.json({ customers, source, total: customers.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, customers: [] }, { status: 500 });
  }
}
