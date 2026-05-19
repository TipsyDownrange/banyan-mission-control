import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth';
import { getBackendSheetId } from '@/lib/backend-config';
import { getCrosswalkSheets, loadCrosswalkByCustomer } from '@/lib/entityCrosswalk';
import { passPermissionGate } from '@/lib/permissions';

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

const normalizeHeader = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const headerIndex = (headers: string[], ...names: string[]) => {
  const wanted = new Set(names.map(normalizeHeader));
  return headers.findIndex(h => wanted.has(normalizeHeader(h)));
};

function hstYearSuffix() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Honolulu',
    year: '2-digit',
  }).format(new Date());
}

function nextCustomerId(headers: string[], rows: unknown[][]) {
  const iCustomerId = headerIndex(headers, 'Customer_ID', 'Customer ID', 'customerId');
  const yy = hstYearSuffix();
  let max = 0;
  if (iCustomerId >= 0) {
    for (const row of rows) {
      const value = String(row[iCustomerId] || '').trim();
      const match = value.match(new RegExp(`^CUS-${yy}-(\\d{4})$`));
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `CUS-${yy}-${String(max + 1).padStart(4, '0')}`;
}

function parseWOCount(value: string) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

function rowToCustomerRecord(headers: string[], row: unknown[]): CustomerRecord {
  const idx = (...names: string[]) => headerIndex(headers, ...names);
  const get = (i: number) => (i >= 0 ? String(row[i] || '') : '');

  const iCustomerId = idx('Customer_ID', 'Customer ID', 'customerId');
  const iCompany = idx('Company_Name', 'Company Name', 'Name');
  const iContact = idx('Contact_Person', 'Contact Person', 'Primary Contact');
  const iTitle = idx('Title');
  const iPhone = idx('Phone');
  const iPhone2 = idx('Phone2');
  const iEmail = idx('Email');
  const iAddress = idx('Address');
  const iCity = idx('City', 'Town', 'Locality');
  const iState = idx('State');
  const iZip = idx('ZIP', 'Zip', 'Postal_Code', 'Postal Code');
  const iIsland = idx('Island');
  const iWOCount = idx('WO_Count');
  const iFirstDate = idx('First_WO_Date');
  const iLastDate = idx('Last_WO_Date');
  const iSource = idx('Source');

  const phone = get(iPhone);
  return {
    customerId: get(iCustomerId),
    name: get(iContact) || get(iCompany),
    company: get(iCompany),
    contactPerson: get(iContact),
    title: get(iTitle),
    phone,
    phone2: get(iPhone2),
    email: get(iEmail),
    address: get(iAddress),
    city: get(iCity),
    state: get(iState),
    zip: get(iZip),
    island: get(iIsland),
    woCount: parseWOCount(get(iWOCount)),
    firstWODate: get(iFirstDate),
    lastWODate: get(iLastDate),
    source: get(iSource),
    contact: phone,
    contactPhone: phone,
  };
}

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
  const customerRecords = rows.slice(1)
    .map(row => rowToCustomerRecord(headers, row))
    .filter(r => r.contactPerson || r.company);

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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = passPermissionGate(session, 'CONTACTS_WRITE');
  if (!gate.ok) return gate.response;

  try {
    const body = await req.json();
    const company = String(body.company || '').trim();
    if (!company) {
      return NextResponse.json({ error: 'company is required' }, { status: 400 });
    }

    const auth = getGoogleAuth([
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ]);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${CUSTOMERS_TAB}!A:Z`,
    });

    const rows = (res.data.values || []) as unknown[][];
    const headers = (rows[0] || []) as string[];
    if (headers.length === 0) {
      return NextResponse.json({ error: 'Customers header row is missing' }, { status: 500 });
    }

    const valuesByHeader: Record<string, string> = {
      customerid: nextCustomerId(headers, rows.slice(1)),
      companyname: company,
      contactperson: String(body.contactPerson || '').trim(),
      title: '',
      phone: String(body.phone || '').trim(),
      phone2: '',
      email: String(body.email || '').trim(),
      address: String(body.address || '').trim(),
      city: String(body.city || '').trim(),
      state: String(body.state || '').trim(),
      zip: String(body.zip || '').trim(),
      island: String(body.island || '').trim(),
      wocount: '0',
      firstwodate: '',
      lastwodate: '',
      source: String(body.source || '').trim() || 'service_intake_inline',
    };

    const row = headers.map(header => valuesByHeader[normalizeHeader(header)] ?? '');

    await sheets.spreadsheets.values.append({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${CUSTOMERS_TAB}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    customersCache = null;
    return NextResponse.json(
      { ok: true, customer: rowToCustomerRecord(headers, row) },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
