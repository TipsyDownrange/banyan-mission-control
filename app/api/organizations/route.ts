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

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Column indices (0-based)
const ORG_COL = { org_id:0, name:1, types:2, entity_type:3, default_island:4, tax_id:5, payment_terms:6, avg_days_to_pay:7, notes:8, source:9, created_at:10, updated_at:11 };
const CNT_COL = { contact_id:0, org_id:1, name:2, title:3, role:4, email:5, phone:6, is_primary:7, notes:8, created_at:9 };
const SITE_COL = { site_id:0, org_id:1, name:2, address_line_1:3, address_line_2:4, city:5, state:6, zip:7, island:8, google_place_id:9, site_type:10, notes:11, created_at:12 };

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

  const [orgsRes, contactsRes, sitesRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Organizations!A2:L5000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Sites!A2:M5000' }),
  ]);

  const orgRows = (orgsRes.data.values || []).filter(r => r[0]) as string[][];
  const cntRows = (contactsRes.data.values || []).filter(r => r[0]) as string[][];
  const siteRows = (sitesRes.data.values || []).filter(r => r[0]) as string[][];

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
      woCount:       0,
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
  const limit  = parseInt(searchParams.get('limit') || '20');
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
  const { name, types, entity_type, island, contact_name, contact_email, contact_phone, address, google_place_id } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const now = new Date().toISOString();
  const orgId = 'org_' + Math.random().toString(36).slice(2,18);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Organizations!A:L',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[orgId, name.trim(), (types||['RESIDENTIAL']).join(','), entity_type||'COMPANY', island||'', '', '', '', '', session.user.email, now, now]] },
  });

  let contactId: string | null = null;
  if (contact_name || contact_email || contact_phone) {
    contactId = 'cnt_' + Math.random().toString(36).slice(2,18);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Contacts!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[contactId, orgId, contact_name||name, '', 'PRIMARY', contact_email||'', contact_phone||'', 'TRUE', '', now]] },
    });
  }

  let siteId: string | null = null;
  if (address || google_place_id) {
    siteId = 'sit_' + Math.random().toString(36).slice(2,18);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Sites!A:M',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[siteId, orgId, '', address||'', '', '', 'HI', '', island||'', google_place_id||'', 'OFFICE', '', now]] },
    });
  }

  // Invalidate cache
  cache = null;

  return NextResponse.json({ ok: true, org_id: orgId, contact_id: contactId, site_id: siteId });
}
