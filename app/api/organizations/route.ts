/**
 * GET /api/organizations?q={search}&types={filter}&limit={n}
 * Search Organizations table. Returns orgs with their primary contact and primary site.
 * Replaces /api/service/customers for the autocomplete flow.
 *
 * POST /api/organizations
 * Create a new Organization (with optional contact and site).
 *
 * PATCH /api/organizations/:org_id
 * Update an Organization. GC-D021: updates are written to Organizations table and any linked WO display fields.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

// Column indices (0-based)
const ORG_COL = { org_id:0, name:1, types:2, entity_type:3, default_island:4, tax_id:5, payment_terms:6, avg_days_to_pay:7, notes:8, source:9, created_at:10, updated_at:11 };
const CNT_COL = { contact_id:0, org_id:1, name:2, title:3, role:4, email:5, phone:6, is_primary:7, notes:8, created_at:9 };
const SITE_COL = { site_id:0, org_id:1, name:2, address_line_1:3, address_line_2:4, city:5, state:6, zip:7, island:8, google_place_id:9, site_type:10, notes:11, created_at:12 };
const CUSTOMER_HEADERS = [
  'Customer_ID',
  'Company_Name',
  'Contact_Person',
  'Title',
  'Phone',
  'Phone2',
  'Email',
  'Address',
  'Island',
  'WO_Count',
  'First_WO_Date',
  'Last_WO_Date',
  'Source',
  'Notes',
];

function getAuth() {
  return getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
}

function normalize(s: string): string {
  return (s||'').toLowerCase().replace(/[,\.]/g,'').replace(/\b(inc|llc|corp|ltd|co)\b/g,'').replace(/\s+/g,' ').trim();
}

export type OrgRecord = {
  org_id: string;
  name: string;
  types: string[];
  entity_type: 'COMPANY' | 'INDIVIDUAL';
  default_island: string;
  notes?: string;
  source?: string;
  // Joined from Contacts + Sites
  primary_contact?: {
    contact_id: string;
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    role?: string;
  };
  primary_site?: {
    site_id: string;
    address_line_1?: string;
    city?: string;
    state?: string;
    zip?: string;
    island?: string;
    site_type?: string;
    google_place_id?: string;
  };
  // Legacy compat for autocomplete
  company: string;
  contactPerson: string;
  contactPhone: string;
  email: string;
  address: string;
  island: string;
  woCount: number;
};

async function fetchAll() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const [orgsRes, contactsRes, sitesRes, woRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Organizations!A2:L5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Sites!A2:M5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!AQ2:AQ5000' }),
  ]);

  const orgRows = (orgsRes.data.values || []).filter(r => r[0]) as string[][];
  const cntRows = (contactsRes.data.values || []).filter(r => r[0]) as string[][];
  const siteRows = (sitesRes.data.values || []).filter(r => r[0]) as string[][];
  const woRows = (woRes.data.values || []) as string[][];

  // Index contacts and sites by org_id
  const contactsByOrg = new Map<string, string[]>();
  for (const r of cntRows) {
    const orgId = r[CNT_COL.org_id];
    if (!orgId) continue;
    const isPrimary = (r[CNT_COL.is_primary]||'').toUpperCase() === 'TRUE';
    if (isPrimary && !contactsByOrg.has(orgId)) contactsByOrg.set(orgId, r);
    else if (!contactsByOrg.has(orgId)) contactsByOrg.set(orgId, r); // fallback first contact
  }
  const sitesByOrg = new Map<string, string[]>();
  for (const r of siteRows) {
    const orgId = r[SITE_COL.org_id];
    if (orgId && !sitesByOrg.has(orgId)) sitesByOrg.set(orgId, r);
  }
  const woCountByOrg = new Map<string, number>();
  for (const r of woRows) {
    const orgId = (r[0] || '').trim();
    if (!orgId) continue;
    woCountByOrg.set(orgId, (woCountByOrg.get(orgId) || 0) + 1);
  }

  const orgs: OrgRecord[] = orgRows.map(r => {
    const orgId = r[ORG_COL.org_id];
    const cnt = contactsByOrg.get(orgId);
    const site = sitesByOrg.get(orgId);
    const types = (r[ORG_COL.types]||'').split(',').map(s=>s.trim()).filter(Boolean);
    const address = site ? [site[SITE_COL.address_line_1], site[SITE_COL.city]].filter(Boolean).join(', ') : '';
    const island = site?.[SITE_COL.island] || r[ORG_COL.default_island] || '';

    return {
      org_id: orgId,
      name: r[ORG_COL.name] || '',
      types,
      entity_type: (r[ORG_COL.entity_type] || 'COMPANY') as 'COMPANY' | 'INDIVIDUAL',
      default_island: r[ORG_COL.default_island] || '',
      notes: r[ORG_COL.notes] || '',
      source: r[ORG_COL.source] || '',
      primary_contact: cnt ? {
        contact_id: cnt[CNT_COL.contact_id],
        name:  cnt[CNT_COL.name] || '',
        title: cnt[CNT_COL.title] || '',
        email: cnt[CNT_COL.email] || '',
        phone: cnt[CNT_COL.phone] || '',
        role:  cnt[CNT_COL.role] || '',
      } : undefined,
      primary_site: site ? {
        site_id:       site[SITE_COL.site_id],
        address_line_1: site[SITE_COL.address_line_1] || '',
        city:          site[SITE_COL.city] || '',
        state:         site[SITE_COL.state] || 'HI',
        zip:           site[SITE_COL.zip] || '',
        island:        site[SITE_COL.island] || '',
        site_type:     site[SITE_COL.site_type] || '',
        google_place_id: site[SITE_COL.google_place_id] || '',
      } : undefined,
      // Legacy compat fields for autocomplete
      company:       r[ORG_COL.name] || '',
      contactPerson: cnt?.[CNT_COL.name] || '',
      contactPhone:  cnt?.[CNT_COL.phone] || '',
      email:         cnt?.[CNT_COL.email] || '',
      address,
      island,
      woCount:       woCountByOrg.get(orgId) || 0,
    };
  });

  return orgs;
}

// Cache for 10 minutes
let cache: { data: OrgRecord[]; ts: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q      = (searchParams.get('q') || '').toLowerCase().trim();
  const types  = searchParams.get('types')?.split(',').map(s=>s.trim()).filter(Boolean) || [];
  const requestedLimit  = parseInt(searchParams.get('limit') || '5000');
  const limit = q.length >= 2 ? requestedLimit : Math.max(requestedLimit, 5000);
  const noCache = searchParams.get('nocache') === '1';

  try {
    if (!cache || Date.now() - cache.ts > CACHE_TTL || noCache) {
      cache = { data: await fetchAll(), ts: Date.now() };
    }

    let results = cache.data;

    // Filter by search query
    if (q.length >= 2) {
      const qNorm = normalize(q);
      results = results.filter(org => {
        const n = normalize(org.name);
        return n.includes(qNorm) ||
          normalize(org.primary_contact?.name||'').includes(qNorm) ||
          (org.primary_contact?.email||'').toLowerCase().includes(q);
      });
    }

    // Filter by types
    if (types.length > 0) {
      results = results.filter(org => types.some(t => org.types.includes(t)));
    }

    return NextResponse.json({ organizations: results.slice(0, limit), total: results.length });
  } catch (err) {
    console.error('[/api/organizations GET]', err);
    return NextResponse.json({ error: String(err), organizations: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, types, entity_type, island, contact_name, contact_email, contact_phone, address, google_place_id, notes, source } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const now = new Date().toISOString();
  const orgId = 'org_' + Math.random().toString(36).slice(2,18);
  const cleanName = name.trim();
  const cleanContactName = (contact_name || '').trim();
  const cleanPhone = (contact_phone || '').trim();
  const cleanEmail = (contact_email || '').trim();
  const cleanAddress = (address || '').trim();
  const cleanIsland = (island || '').trim();
  const cleanNotes = (notes || '').trim();
  const cleanSource = (source || 'MANUAL_ENTRY').trim() || session.user.email || 'MANUAL_ENTRY';

  const customerHeaderRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Customers!A1:N1',
  });
  const customerHeaders = (customerHeaderRes.data.values?.[0] || []) as string[];
  const headerMismatch = CUSTOMER_HEADERS.some((header, idx) => customerHeaders[idx] !== header);
  if (headerMismatch) {
    return NextResponse.json(
      { error: `Customers header mismatch. Expected A:N ${CUSTOMER_HEADERS.join(', ')}` },
      { status: 500 }
    );
  }

  const customerIdsRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Customers!A2:A',
  });
  const existingCustomerIds = new Set((customerIdsRes.data.values || []).flat().filter(Boolean));
  let customerId = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = Math.floor(Math.random() * 36 ** 8).toString(36).toUpperCase().padStart(8, '0');
    const candidate = `CUST-${token}`;
    if (!existingCustomerIds.has(candidate)) {
      customerId = candidate;
      break;
    }
  }
  if (!customerId) {
    return NextResponse.json({ error: 'Could not generate unique Customer_ID' }, { status: 500 });
  }

  const isIndividual = entity_type === 'INDIVIDUAL';
  const customerRow = [
    customerId,
    isIndividual ? '' : cleanName,
    cleanContactName || cleanName,
    '',
    cleanPhone,
    '',
    cleanEmail,
    cleanAddress,
    cleanIsland,
    '0',
    '',
    '',
    cleanSource,
    cleanNotes,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Customers!A:N',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [customerRow] },
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Organizations!A:L',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[orgId, cleanName, (types||['RESIDENTIAL']).join(','), entity_type||'COMPANY', cleanIsland, '', '', '', cleanNotes, session.user.email, now, now]] },
  });

  let contactId: string | null = null;
  if (cleanContactName || cleanEmail || cleanPhone) {
    contactId = 'cnt_' + Math.random().toString(36).slice(2,18);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Contacts!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[contactId, orgId, cleanContactName || cleanName, '', 'PRIMARY', cleanEmail, cleanPhone, 'TRUE', '', now]] },
    });
  }

  let siteId: string | null = null;
  if (cleanAddress || google_place_id) {
    siteId = 'sit_' + Math.random().toString(36).slice(2,18);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Sites!A:M',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[siteId, orgId, '', cleanAddress, '', '', 'HI', '', cleanIsland, google_place_id||'', 'OFFICE', '', now]] },
    });
  }

  // Invalidate cache
  cache = null;

  const organization: OrgRecord = {
    org_id: orgId,
    name: cleanName,
    types: (types || ['RESIDENTIAL']) as string[],
    entity_type: (entity_type || 'COMPANY') as 'COMPANY' | 'INDIVIDUAL',
    default_island: cleanIsland,
    notes: cleanNotes,
    source: session.user.email || '',
    primary_contact: contactId ? {
      contact_id: contactId,
      name: cleanContactName || cleanName,
      title: '',
      email: cleanEmail,
      phone: cleanPhone,
      role: 'PRIMARY',
    } : undefined,
    primary_site: siteId ? {
      site_id: siteId,
      address_line_1: cleanAddress,
      city: '',
      state: 'HI',
      zip: '',
      island: cleanIsland,
      site_type: 'OFFICE',
      google_place_id: google_place_id || '',
    } : undefined,
    company: cleanName,
    contactPerson: cleanContactName || (contactId ? cleanName : ''),
    contactPhone: cleanPhone,
    email: cleanEmail,
    address: cleanAddress,
    island: cleanIsland,
    woCount: 0,
  };

  return NextResponse.json({ ok: true, org_id: orgId, customer_id: customerId, contact_id: contactId, site_id: siteId, organization });
}
