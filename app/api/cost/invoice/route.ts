import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { date, amount, type, notes } = await req.json();
  if (!date || !amount || !type) return NextResponse.json({ error: 'date, amount, type required' }, { status: 400 });
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Anthropic_Invoices!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[date, type, String(amount), type === 'invoice' ? 'paid' : 'applied', notes || '']] },
  });
  return NextResponse.json({ ok: true });
}
