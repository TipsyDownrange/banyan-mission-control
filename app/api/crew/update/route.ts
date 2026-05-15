import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { normalizeAddressComponent, normalizeEmail, normalizeNameForWrite, normalizePhone } from '@/lib/normalize';

const SHEET_ID = getBackendSheetId();

const USER_ROLES_READ_RANGE = 'Users_Roles!A2:P100';
const USER_ROLES_WRITE_START_COL = 'B';
const USER_ROLES_WRITE_END_COL = 'P';

const WRITABLE_FIELDS = [
  'name',
  'role',
  'email',
  'phone',
  'island',
  'personal_email',
  'title',
  'department',
  'office',
  'home_address',
  'emergency_contact',
  'start_date',
  'notes',
  'authority_level',
  'career_track',
] as const;

type WritableField = typeof WRITABLE_FIELDS[number];
type CrewUpdateBody = { user_id?: string } & Partial<Record<WritableField, string>>;

function hasOwn(body: CrewUpdateBody, field: WritableField): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function preserveOrUpdate(body: CrewUpdateBody, field: WritableField, existing: string | undefined): string {
  if (!hasOwn(body, field)) return existing ?? '';
  const value = body[field] ?? '';
  if (field === 'name') return normalizeNameForWrite(value);
  if (field === 'email' || field === 'personal_email') return normalizeEmail(value);
  if (field === 'phone') return normalizePhone(value);
  if (field === 'home_address') return normalizeAddressComponent(value);
  return value;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CrewUpdateBody;
    const { user_id } = body;
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row for this user_id
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: USER_ROLES_READ_RANGE,
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === user_id);
    if (rowIndex === -1) return NextResponse.json({ error: `User ${user_id} not found` }, { status: 404 });

    const sheetRow = rowIndex + 2;
    const r = rows[rowIndex];
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Users_Roles!${USER_ROLES_WRITE_START_COL}${sheetRow}:${USER_ROLES_WRITE_END_COL}${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [WRITABLE_FIELDS.map((field, offset) => {
          if (field === 'island') return r[offset + 1] ?? '';
          return preserveOrUpdate(body, field, r[offset + 1]);
        })],
      },
    });

    return NextResponse.json({ ok: true, user_id, row: sheetRow });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
