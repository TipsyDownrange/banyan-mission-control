import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { normalizeAddressComponent, normalizeIsland, normalizeNameForWrite, normalizeSiteType } from '@/lib/normalize';
const SHEET_ID = getBackendSheetId();

function normalizeSiteField(field: string, value: unknown): string {
  const raw = String(value ?? '');
  if (field === 'name') return normalizeNameForWrite(raw);
  if (field === 'island') return raw.trim() ? normalizeIsland(raw) : '';
  if (field === 'site_type') return normalizeSiteType(raw);
  return normalizeAddressComponent(raw);
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const { name, address_line_1, address_line_2, city, state, zip, island, google_place_id, site_type } = await req.json();
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const siteId = 'sit_' + Math.random().toString(36).slice(2,18);
  const now = new Date().toISOString();
  try {
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Sites!A:M', valueInputOption: 'USER_ENTERED', requestBody: { values: [[siteId, orgId, normalizeNameForWrite(String(name || '')), normalizeAddressComponent(String(address_line_1 || '')), normalizeAddressComponent(String(address_line_2 || '')), normalizeAddressComponent(String(city || '')), normalizeAddressComponent(String(state || 'HI')).toUpperCase(), normalizeAddressComponent(String(zip || '')), String(island || '').trim() ? normalizeIsland(String(island)) : '', normalizeAddressComponent(String(google_place_id || '')), normalizeSiteType(String(site_type || 'OFFICE')), '', now]] } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  return NextResponse.json({ ok: true, site_id: siteId });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const { siteId, ...fields } = await req.json();
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Sites!A2:M5000' });
  const rows = res.data.values || [];
  const idx = rows.findIndex(r => r[0] === siteId && r[1] === orgId);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const rowNum = idx + 2;
  const COL: Record<string,number> = { name:2, address_line_1:3, address_line_2:4, city:5, state:6, zip:7, island:8, google_place_id:9, site_type:10, notes:11 };
  let updates: { range: string; values: string[][] }[];
  try {
    updates = Object.entries(fields).filter(([k]) => COL[k]!==undefined).map(([k,v]) => ({ range:`Sites!${String.fromCharCode(65+COL[k])}${rowNum}`, values:[[normalizeSiteField(k, v)]] }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  if (updates.length === 0) return NextResponse.json({ error: 'No site fields to update' }, { status: 400 });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption:'USER_ENTERED', data: updates } });
  return NextResponse.json({ ok: true, site_id: siteId });
}
