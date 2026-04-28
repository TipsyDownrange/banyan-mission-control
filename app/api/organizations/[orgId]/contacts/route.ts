import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
const SHEET_ID = getBackendSheetId();
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = await params;
  const { name, title, role, email, phone, is_primary } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const contactId = 'cnt_' + Math.random().toString(36).slice(2,18);
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'Contacts!A:J', valueInputOption: 'USER_ENTERED', requestBody: { values: [[contactId, orgId, name, title||'', role||'PRIMARY', email||'', phone||'', is_primary?'TRUE':'FALSE', '', now]] } });
  return NextResponse.json({ ok: true, contact_id: contactId });
}
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { contactId, ...fields } = await req.json();
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000' });
  const rows = res.data.values || [];
  const idx = rows.findIndex(r => r[0] === contactId);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const rowNum = idx + 2;
  const COL: Record<string,number> = { name:2, title:3, role:4, email:5, phone:6, is_primary:7, notes:8 };
  const updates = Object.entries(fields).filter(([k]) => COL[k]!==undefined).map(([k,v]) => ({ range:`Contacts!${String.fromCharCode(65+COL[k])}${rowNum}`, values:[[String(v)]] }));
  if (updates.length > 0) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption:'USER_ENTERED', data: updates } });
  return NextResponse.json({ ok: true });
}
