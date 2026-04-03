import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export async function POST(req: Request) {
  try {
    const { user_id, name, role, email, phone, personal_email } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row for this user_id
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Users_Roles!A2:G100',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === user_id);
    if (rowIndex === -1) return NextResponse.json({ error: `User ${user_id} not found` }, { status: 404 });

    const sheetRow = rowIndex + 2; // 1-indexed, +1 for header
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Users_Roles!B${sheetRow}:G${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          name   ?? rows[rowIndex][1] ?? '',
          role   ?? rows[rowIndex][2] ?? '',
          email  ?? rows[rowIndex][3] ?? '',
          phone  ?? rows[rowIndex][4] ?? '',
          rows[rowIndex][5] ?? '', // island — don't change from UI
          personal_email ?? rows[rowIndex][6] ?? '',
        ]],
      },
    });

    return NextResponse.json({ ok: true, user_id, row: sheetRow });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
