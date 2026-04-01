import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';
const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '100');

  try {
    const key = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: BID_LOG_ID,
      range: `Bids!A1:Z${limit + 1}`,
    });

    const rows = result.data.values || [];
    if (rows.length === 0) return NextResponse.json({ bids: [], total: 0 });

    const headers = rows[0];
    const bids = rows.slice(1).map(row => {
      const b: Record<string, string> = {};
      headers.forEach((h, i) => { b[h as string] = row[i] || ''; });
      return b;
    });

    return NextResponse.json({ bids, total: bids.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), bids: [] }, { status: 500 });
  }
}
