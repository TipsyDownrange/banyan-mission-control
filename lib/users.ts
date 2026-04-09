import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export type SheetUser = {
  user_id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  island: string;
  title: string;
};

export async function getUsers(): Promise<SheetUser[]> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Users_Roles!A2:R200',
  });

  return (res.data.values || [])
    .filter(row => row[0] || row[1] || row[3])
    .map(row => ({
      user_id: row[0] || '',
      name: row[1] || '',
      role: row[2] || '',
      email: (row[3] || '').toLowerCase(),
      phone: row[4] || '',
      island: row[5] || '',
      title: row[7] || '',
    }));
}

export async function getPreparedByUser(email?: string | null) {
  const normalized = (email || '').toLowerCase().trim();
  if (!normalized) return null;
  const users = await getUsers();
  return users.find(user => user.email === normalized) || null;
}
