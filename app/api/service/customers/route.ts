import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';
import { getCrosswalkSheets, loadCrosswalkByCustomer } from '@/lib/entityCrosswalk';

const BACKEND_SHEET_ID = getBackendSheetId();
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
  city?:         string;
  state?:        string;
  zip?:          string;
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
// BAN-70: Service Intake is operator-critical. New customer creation must be visible immediately.
const CACHE_TTL_MS = 0;

// ── Google Sheets reader ──────────────────────────────────────────────────────
async function fetchCustomersFromGoogleSheet(): Promise<CustomerRecord[]> {
  const auth = getGoogleAuth([
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ]);
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BACKEND_SHEET_ID,
    range:         `${CUSTOMERS_TAB}!A:Z`,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) return []; // empty or header-only

  const headers = rows[0] as string[];
  const normalizeHeader = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const idx = (...names: string[]) => {
    const wanted = new Set(names.map(normalizeHeader));
    return headers.findIndex(h => wanted.has(normalizeHeader(h)));
  };

  const iCustomerId    = idx('Customer_ID', 'Customer ID', 'customerId');
  const iCompany       = idx('Company_Name', 'Company Name', 'Name');
  const iContact       = idx('Contact_Person', 'Contact Person', 'Primary Contact');
  const iTitle         = idx('Title');
  const iPhone         = idx('Phone');
  const iPhone2        = idx('Phone2');
  const iEmail         = idx('Email');
  const iAddress       = idx('Address');
  const iCity          = idx('City', 'Town', 'Locality');
  const iState         = idx('State');
  const iZip           = idx('ZIP', 'Zip', 'Postal_Code', 'Postal Code');
  const iIsland        = idx('Island');
  const iWOCount       = idx('WO_Count');
  const iFirstDate     = idx('First_WO_Date');
  const iLastDate      = idx('Last_WO_Date');
  const iSource        = idx('Source');

  const customerRecords = rows.slice(1).map(row => {
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
      city:          get(iCity),
      state:         get(iState),
      zip:           get(iZip),
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

  const crosswalk = await loadCrosswalkByCustomer(getCrosswalkSheets(true));
  return customerRecords.map(record => {
    const entry = crosswalk.get(record.customerId);
    return entry ? { ...record, org_id: entry.org_id } : record;
  });
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
    return NextResponse.json({
      customers,
      source,
      total: customers.length,
      identity_resolution: 'entity_crosswalk',
      unresolved_org_count: customers.filter(customer => customer.customerId && !customer.org_id).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, customers: [] }, { status: 500 });
  }
}
