import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { isStaging } from '@/lib/env';

// BAN-170: Anthropic invoice ledger sheet is env-driven so staging cannot
// append rows to the production cost sheet. Production sets
// COST_INVOICE_SHEET_ID to the prod sheet id; staging must point at a staging
// copy. With no env var configured, staging short-circuits with 502.
const PRODUCTION_COST_INVOICE_SHEET_ID = '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';

function resolveCostInvoiceSheetId(): { ok: true; id: string } | { ok: false; status: number; error: string } {
  const fromEnv = (process.env.COST_INVOICE_SHEET_ID || '').trim();
  if (isStaging()) {
    if (!fromEnv) {
      return {
        ok: false,
        status: 502,
        error: 'COST_INVOICE_SHEET_ID is not configured for staging — refusing to write to the production cost sheet',
      };
    }
    if (fromEnv === PRODUCTION_COST_INVOICE_SHEET_ID) {
      return {
        ok: false,
        status: 502,
        error: 'COST_INVOICE_SHEET_ID resolves to the production cost sheet on a staging deploy — refusing to write',
      };
    }
    return { ok: true, id: fromEnv };
  }
  // Production keeps the existing canonical id when COST_INVOICE_SHEET_ID is
  // not yet set on Vercel — preserves legacy prod behavior unchanged.
  return { ok: true, id: fromEnv || PRODUCTION_COST_INVOICE_SHEET_ID };
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { date, amount, type, notes } = await req.json();
  if (!date || !amount || !type) return NextResponse.json({ error: 'date, amount, type required' }, { status: 400 });

  const resolved = resolveCostInvoiceSheetId();
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, staging: true }, { status: resolved.status });
  }

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: resolved.id, range: 'Anthropic_Invoices!A:E',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[date, type, String(amount), type === 'invoice' ? 'paid' : 'applied', notes || '']] },
  });
  return NextResponse.json({ ok: true });
}
