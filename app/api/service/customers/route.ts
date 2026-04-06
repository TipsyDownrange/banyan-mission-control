import { NextResponse } from 'next/server';
import { getSSToken, getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const CUSTOMERS_TAB     = 'Customers';

const SS_SHEETS = {
  active:    '7905619916154756',
  completed: '8935301818148740',
  quoted:    '1349614456229764',
};

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
  const iNotes         = idx('Notes');

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

// ── Smartsheet fallback ───────────────────────────────────────────────────────
function toTitleCase(str: string): string {
  if (!str) return str;
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 2 && letters === letters.toUpperCase()) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

async function fetchCustomersFromSmartsheet(token: string, sheetId: string) {
  const res = await fetch(
    `https://api.smartsheet.com/2.0/sheets/${sheetId}?pageSize=500`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as {
    columns?: { id: number; title: string }[];
    rows?: { cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
  };

  const cols: Record<number, string> = {};
  for (const c of data.columns || []) cols[c.id] = c.title;

  return (data.rows || []).map(row => {
    const rd: Record<string, string> = {};
    for (const cell of row.cells || []) {
      if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || String(cell.value || '');
    }
    const name    = (rd['Task Name / Job Name'] || rd['Job Name/WO Number'] || '').split('\n')[0].substring(0, 80).trim();
    const contact = (rd['CONTACT #'] || '').split('\n')[0].substring(0, 60).trim();
    const address = (rd['ADDRESS'] || '').substring(0, 80).trim();
    const island  = rd['Area of island'] || '';

    let contactPerson = '';
    let contactPhone  = '';
    if (contact) {
      const phoneMatch = contact.match(/([\(]?808[\)]?[\s\-\.]?\d{3}[\s\-\.]?\d{4})/);
      if (phoneMatch) {
        contactPhone  = phoneMatch[1];
        contactPerson = contact.replace(phoneMatch[0], '').replace(/[\s·\|]+/g, ' ').trim();
      } else {
        contactPerson = contact;
      }
    }

    return { name, contact, contactPerson, contactPhone, address, island };
  }).filter(r => r.name);
}

async function fetchCustomersFallback(): Promise<CustomerRecord[]> {
  const token = getSSToken();
  const [active, completed, quoted] = await Promise.all([
    fetchCustomersFromSmartsheet(token, SS_SHEETS.active),
    fetchCustomersFromSmartsheet(token, SS_SHEETS.completed),
    fetchCustomersFromSmartsheet(token, SS_SHEETS.quoted),
  ]);

  const customerMap = new Map<string, CustomerRecord>();
  let autoId = 1;

  for (const row of [...active, ...quoted, ...completed]) {
    if (!row.name) continue;
    const key = row.name.toLowerCase().trim();
    if (customerMap.has(key)) {
      const existing = customerMap.get(key)!;
      existing.woCount++;
      if (!existing.contactPhone && row.contactPhone) {
        existing.contactPhone = row.contactPhone;
        existing.phone        = row.contactPhone;
        existing.contact      = row.contactPhone;
      }
      if (!existing.address && row.address) existing.address = row.address;
      if (!existing.island  && row.island)  existing.island  = row.island;
    } else {
      customerMap.set(key, {
        customerId:    `CUST-${String(autoId++).padStart(4, '0')}`,
        name:          toTitleCase(row.name),
        company:       '',
        contactPerson: row.contactPerson,
        title:         '',
        phone:         row.contactPhone,
        phone2:        '',
        email:         '',
        address:       row.address,
        island:        row.island,
        woCount:       1,
        firstWODate:   '',
        lastWODate:    '',
        source:        'smartsheet-live',
        contact:       row.contact,
        contactPhone:  row.contactPhone,
      });
    }
  }

  return [...customerMap.values()].sort((a, b) => b.woCount - a.woCount);
}

// ── GET handler ───────────────────────────────────────────────────────────────
export async function GET() {
  const now = Date.now();
  if (customersCache && now - customersCache.ts < CACHE_TTL_MS) {
    return NextResponse.json({ customers: customersCache.data, source: 'cache' });
  }

  try {
    // Primary: read from pre-parsed Customers tab (fast)
    let customers = await fetchCustomersFromGoogleSheet();
    let source = 'customers-tab';

    // Fallback: parse Smartsheet live if tab is empty
    if (customers.length === 0) {
      customers = await fetchCustomersFallback();
      source    = 'smartsheet-live';
    }

    customersCache = { data: customers, ts: now };
    return NextResponse.json({ customers, source, total: customers.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, customers: [] }, { status: 500 });
  }
}
