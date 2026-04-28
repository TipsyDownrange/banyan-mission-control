import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SHEET_ID = getBackendSheetId();
const USERS_TAB = 'Users_Roles';

type UserRecord = {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  island: string;
  status: string;
  // Backward compatibility for current ActivityTimeline consumer.
  name: string;
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function resolveRequiredHeader(headers: string[], field: string, aliases: string[] = []) {
  const wanted = [field, ...aliases].map(normalizeHeader);
  const index = headers.findIndex((header) => wanted.includes(normalizeHeader(header)));
  if (index === -1) {
    throw new Error(
      `Users_Roles is missing required column "${field}". Headers found: ${headers.join(', ')}`
    );
  }
  return index;
}

async function fetchUsersFresh(): Promise<UserRecord[]> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${USERS_TAB}!A1:ZZ5000`,
  });

  const rows = (response.data.values || []) as string[][];
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0] || [];
  const userIdIdx = resolveRequiredHeader(headers, 'user_id');
  const displayNameIdx = resolveRequiredHeader(headers, 'display_name', ['name']);
  const emailIdx = resolveRequiredHeader(headers, 'email');
  const roleIdx = resolveRequiredHeader(headers, 'role');
  const islandIdx = resolveRequiredHeader(headers, 'island');
  const statusIdx = resolveRequiredHeader(headers, 'status');

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || '').trim()))
    .map((row) => {
      const display_name = String(row[displayNameIdx] || '').trim();
      const email = String(row[emailIdx] || '').trim().toLowerCase();
      const status = String(row[statusIdx] || '').trim();

      return {
        user_id: String(row[userIdIdx] || '').trim(),
        display_name,
        email,
        role: String(row[roleIdx] || '').trim(),
        island: String(row[islandIdx] || '').trim(),
        status,
        name: display_name,
      };
    })
    .filter((user) => user.user_id || user.display_name || user.email)
    .filter((user) => {
      const normalizedStatus = user.status.toLowerCase();
      return normalizedStatus !== 'inactive' && normalizedStatus !== 'archived';
    });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = await fetchUsersFresh();
    return NextResponse.json(users);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('GET /api/users error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
