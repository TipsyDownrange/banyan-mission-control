/**
 * GET /api/estimating/bids/[bidId]/quotes
 * All GC quotes for a specific bid.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';
export async function GET(_req: Request, { params }: { params: Promise<{ bidId: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { bidId } = await params;
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: BID_LOG_ID, range: 'GC Quotes!A1:K1000' });
    const rows = (res.data.values || []) as string[][];
    const headers = rows[0] || [];
    const g = (row: string[], col: string) => row[headers.indexOf(col)] || '';
    const quotes = rows.slice(1)
      .filter(r => g(r, 'Job kID') === bidId)
      .map(r => ({
        quoteKID: g(r,'Quote kID'), jobKID: g(r,'Job kID'),
        generalContractor: g(r,'General Contractor'), contactPerson: g(r,'Contact Person'),
        contactEmail: g(r,'Contact Email'), contactPhone: g(r,'Contact Phone'),
        quotedAmount: parseFloat(g(r,'Quoted Amount').replace(/[$,]/g,''))||0,
        ourPrice: parseFloat(g(r,'Our Price').replace(/[$,]/g,''))||0,
        scopeNotes: g(r,'Scope Notes'), result: g(r,'Result'), notes: g(r,'Notes'),
      }));
    return NextResponse.json({ quotes, count: quotes.length });
  } catch (err) {
    console.error('[quotes]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
