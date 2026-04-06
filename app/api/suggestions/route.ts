import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { description, email, name } = await req.json();
  if (!description) return NextResponse.json({ error: 'No description' }, { status: 400 });

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const id = `SUG-${Date.now().toString(36)}`;
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Suggestions!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          id,
          email || session.user?.email || '',
          name || session.user?.name || '',
          description,
          '', // kai_interpretation (to be filled by Kai)
          '', // category
          'New',
          new Date().toISOString(),
          '',
          '',
        ]],
      },
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Suggestions!A2:J500' });
    const rows = (res.data.values || []).map(r => ({
      id: r[0], email: r[1], name: r[2], description: r[3],
      kai_interpretation: r[4], category: r[5], status: r[6],
      created_at: r[7], reviewed_at: r[8], notes: r[9],
    }));
    return NextResponse.json({ suggestions: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err), suggestions: [] }, { status: 500 });
  }
}
