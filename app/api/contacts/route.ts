/**
 * GET  /api/contacts?org_id=xxx     — contacts for an org
 * GET  /api/contacts                 — all contacts (for search)
 * POST /api/contacts                 — create contact
 * PATCH /api/contacts                — update contact
 * DELETE /api/contacts?contact_id=  — delete contact
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// Contacts tab headers (0-based):
// 0:contact_id 1:org_id 2:name 3:title 4:role 5:email 6:phone 7:is_primary 8:notes 9:created_at
const COL = { contact_id:0, org_id:1, name:2, title:3, role:4, email:5, phone:6, is_primary:7, notes:8, created_at:9 };
const NUM_COLS = 10;

function getAuth() {
  return getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
}

function rowToContact(row: string[]) {
  return {
    contact_id: row[COL.contact_id] || '',
    org_id: row[COL.org_id] || '',
    name: row[COL.name] || '',
    title: row[COL.title] || '',
    role: row[COL.role] || '',
    email: row[COL.email] || '',
    phone: row[COL.phone] || '',
    is_primary: row[COL.is_primary] === 'TRUE' || row[COL.is_primary] === 'true',
    notes: row[COL.notes] || '',
    created_at: row[COL.created_at] || '',
  };
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id');
  const q = (searchParams.get('q') || '').toLowerCase();

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000',
    });
    const rows = (res.data.values || []) as string[][];
    let contacts = rows.filter(r => r[COL.contact_id]).map(rowToContact);

    if (orgId) contacts = contacts.filter(c => c.org_id === orgId);
    if (q) contacts = contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );

    // Sort: primary first, then by name
    contacts.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.name.localeCompare(b.name));

    return NextResponse.json({ contacts });
  } catch (err) {
    console.error('[/api/contacts GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { org_id, name, title, role, email, phone, notes, is_primary } = body;
  if (!org_id || !name?.trim()) {
    return NextResponse.json({ error: 'org_id and name required' }, { status: 400 });
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const now = new Date().toISOString();
    const contactId = 'cnt_' + Math.random().toString(36).slice(2, 18);

    // If is_primary, clear existing primary for this org
    if (is_primary) {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000',
      });
      const rows = (existing.data.values || []) as string[][];
      const updates = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r[COL.org_id] === org_id && (r[COL.is_primary] === 'TRUE' || r[COL.is_primary] === 'true'))
        .map(({ i }) => ({
          range: `Contacts!H${i + 2}`,
          values: [['FALSE']],
        }));
      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'RAW', data: updates },
        });
      }
    }

    const row = new Array(NUM_COLS).fill('');
    row[COL.contact_id] = contactId;
    row[COL.org_id] = org_id;
    row[COL.name] = name.trim();
    row[COL.title] = title || '';
    row[COL.role] = role || 'CONTACT';
    row[COL.email] = email || '';
    row[COL.phone] = phone || '';
    row[COL.is_primary] = is_primary ? 'TRUE' : 'FALSE';
    row[COL.notes] = notes || '';
    row[COL.created_at] = now;

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Contacts!A:J',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ contact_id: contactId, success: true });
  } catch (err) {
    console.error('[/api/contacts POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { contact_id, ...updates } = body;
  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Contacts!A2:J2000',
    });
    const rows = (res.data.values || []) as string[][];
    const rowIdx = rows.findIndex(r => r[COL.contact_id] === contact_id);
    if (rowIdx === -1) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    const sheetRow = rowIdx + 2;
    const now = new Date().toISOString();
    const patchData: { range: string; values: string[][] }[] = [];
    const fieldMap: Record<string, number> = { name: COL.name, title: COL.title, role: COL.role, email: COL.email, phone: COL.phone, is_primary: COL.is_primary, notes: COL.notes };

    // If setting as primary, clear others
    if (updates.is_primary === true || updates.is_primary === 'TRUE') {
      const orgId = rows[rowIdx][COL.org_id];
      const clearUpdates = rows
        .map((r, i) => ({ r, i }))
        .filter(({ r, i }) => r[COL.org_id] === orgId && i !== rowIdx && (r[COL.is_primary] === 'TRUE' || r[COL.is_primary] === 'true'))
        .map(({ i }) => ({ range: `Contacts!H${i + 2}`, values: [['FALSE']] }));
      patchData.push(...clearUpdates);
    }

    for (const [field, colIdx] of Object.entries(fieldMap)) {
      if (updates[field] !== undefined) {
        const val = field === 'is_primary'
          ? (updates[field] === true || updates[field] === 'TRUE' ? 'TRUE' : 'FALSE')
          : String(updates[field]);
        patchData.push({ range: `Contacts!${String.fromCharCode(65 + colIdx)}${sheetRow}`, values: [[val]] });
      }
    }

    if (patchData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: patchData },
      });
    }

    return NextResponse.json({ success: true, updated: now });
  } catch (err) {
    console.error('[/api/contacts PATCH]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contact_id');
  if (!contactId) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
    const contactsSheet = meta.data.sheets?.find(s => s.properties?.title === 'Contacts');
    const sheetId = contactsSheet?.properties?.sheetId;

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contacts!A2:A2000' });
    const rows = (res.data.values || []) as string[][];
    const rowIdx = rows.findIndex(r => r[0] === contactId);
    if (rowIdx === -1) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ deleteDimension: { range: { sheetId: sheetId!, dimension: 'ROWS', startIndex: rowIdx + 1, endIndex: rowIdx + 2 } } }],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[/api/contacts DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
