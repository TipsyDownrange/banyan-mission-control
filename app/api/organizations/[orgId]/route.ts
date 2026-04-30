/**
 * GET  /api/organizations/[orgId] — detail with joined contacts, sites, linked WOs/projects
 * PATCH /api/organizations/[orgId] — update org fields
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

const ALLOWED_EDIT_TYPES = ['GC', 'COMMERCIAL', 'RESIDENTIAL', 'VENDOR', 'GOVERNMENT', 'PROPERTY_MGMT'];
const ALLOWED_EDIT_STATUSES = ['active', 'inactive'];

function getAuth() { return getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']); }

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const [orgsRes, cntRes, siteRes, woRes, ceRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Organizations!A2:P5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Sites!A2:M5000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:AQ2000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Core_Entities!A2:L200' }),
    ]);
    const orgRow = (orgsRes.data.values || []).find(r => r[0] === orgId);
    if (!orgRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const contacts = (cntRes.data.values || []).filter(r => r[1] === orgId).map(r => ({
      contact_id: r[0], org_id: r[1], name: r[2], title: r[3], role: r[4], email: r[5], phone: r[6], is_primary: r[7]==='TRUE', notes: r[8], created_at: r[9],
    }));
    const sites = (siteRes.data.values || []).filter(r => r[1] === orgId).map(r => ({
      site_id: r[0], org_id: r[1], name: r[2], address_line_1: r[3], address_line_2: r[4], city: r[5], state: r[6], zip: r[7], island: r[8], google_place_id: r[9], site_type: r[10], notes: r[11],
    }));
    // col 42 = org_id (AQ); col 12 = customer_name (M) fallback for old records
    const linkedWOs = (woRes.data.values || []).filter(r => r[42] === orgId || r[12] === orgId).map(r => ({
      id: r[0], woNumber: r[1], name: r[2], status: r[4], island: r[5],
    })).slice(0, 20);
    const linkedProjects = (ceRes.data.values || []).filter(r => r[9]===orgId || r[10]===orgId || r[11]===orgId).map(r => ({
      kID: r[0], type: r[1], name: r[2], status: r[3], role: r[9]===orgId?'GC':r[10]===orgId?'Owner':'Architect',
    })).slice(0, 10);
    return NextResponse.json({
      org: { org_id: orgRow[0], name: orgRow[1], types: (orgRow[2]||'').split(',').map((s:string)=>s.trim()).filter(Boolean), entity_type: orgRow[3], default_island: orgRow[4], tax_id: orgRow[5], payment_terms: orgRow[6], avg_days_to_pay: orgRow[7], notes: orgRow[8], source: orgRow[9], created_at: orgRow[10], updated_at: orgRow[11], status: orgRow[12] || '', merged_into_org_id: orgRow[13] || '', merged_at: orgRow[14] || '', merged_by: orgRow[15] || '' },
      contacts, sites, linkedWOs, linkedProjects,
    });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const body = await req.json();

  if (body.types !== undefined) {
    const types: string[] = Array.isArray(body.types)
      ? body.types
      : String(body.types).split(',').map((s: string) => s.trim()).filter(Boolean);
    const invalid = types.filter((t: string) => !ALLOWED_EDIT_TYPES.includes(t));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Invalid organization types: ${invalid.join(', ')}. Allowed: ${ALLOWED_EDIT_TYPES.join(', ')}` }, { status: 400 });
    }
  }

  if (body.status !== undefined) {
    const status = String(body.status).trim().toLowerCase();
    if (!ALLOWED_EDIT_STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}. Use active or inactive. Merged status is set only by the merge workflow.` }, { status: 400 });
    }
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Organizations!A2:P5000' });
    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === orgId);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const rowNum = idx + 2;
    const now = new Date().toISOString();
    const updates: {range:string;values:string[][]}[] = [{ range:`Organizations!L${rowNum}`, values:[[now]] }];
    const COL: Record<string,number> = { name:1, types:2, entity_type:3, default_island:4, tax_id:5, payment_terms:6, avg_days_to_pay:7, notes:8, status:12 };
    for (const [k,v] of Object.entries(body)) {
      const col = COL[k];
      if (col !== undefined) updates.push({ range:`Organizations!${String.fromCharCode(65+col)}${rowNum}`, values:[[Array.isArray(v)?v.join(','):String(v)]] });
    }
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption:'USER_ENTERED', data: updates } });
    return NextResponse.json({ ok: true });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
}
