import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Step_Templates!A2:F500',
    });
    const rows = res.data.values || [];
    
    // Group by template name
    const templates: Record<string, { step_name: string; default_hours: number; category: string; notes: string }[]> = {};
    for (const r of rows) {
      if (!r[0]) continue;
      const name = r[0];
      if (!templates[name]) templates[name] = [];
      templates[name].push({
        step_name: r[2] || '',
        default_hours: parseFloat(r[3]) || 0,
        category: r[4] || '',
        notes: r[5] || '',
      });
    }
    
    return NextResponse.json({ ok: true, templates });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load templates', detail: String(err) }, { status: 500 });
  }
}
