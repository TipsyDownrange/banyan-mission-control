/**
 * GET /api/estimating/bids/[bidId]
 * Single bid detail — returns bid + all GC quotes for that bid.
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
    const [bidsRes, quotesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: BID_LOG_ID, range: 'Bids!A1:AD1000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: BID_LOG_ID, range: 'GC Quotes!A1:K1000' }),
    ]);
    const bRows = (bidsRes.data.values || []) as string[][];
    const qRows = (quotesRes.data.values || []) as string[][];
    const bHeaders = bRows[0] || [];
    const qHeaders = qRows[0] || [];
    const bg = (row: string[], col: string) => row[bHeaders.indexOf(col)] || '';
    const qg = (row: string[], col: string) => row[qHeaders.indexOf(col)] || '';
    const bidRow = bRows.slice(1).find(r => r[bHeaders.indexOf('kID')] === bidId);
    if (!bidRow) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    const bid: Record<string, string | number> = {};
    bHeaders.forEach((h, i) => { bid[h] = bidRow[i] || ''; });
    const quotes = qRows.slice(1)
      .filter(r => qg(r, 'Job kID') === bidId)
      .map(r => ({
        quoteKID:         qg(r, 'Quote kID'),
        jobKID:           qg(r, 'Job kID'),
        generalContractor: qg(r, 'General Contractor'),
        contactPerson:    qg(r, 'Contact Person'),
        contactEmail:     qg(r, 'Contact Email'),
        contactPhone:     qg(r, 'Contact Phone'),
        quotedAmount:     parseFloat(qg(r, 'Quoted Amount').replace(/[$,]/g,'')) || 0,
        ourPrice:         parseFloat(qg(r, 'Our Price').replace(/[$,]/g,'')) || 0,
        scopeNotes:       qg(r, 'Scope Notes'),
        result:           qg(r, 'Result'),
        notes:            qg(r, 'Notes'),
      }));
    return NextResponse.json({ bid, quotes });
  } catch (err) {
    console.error('[/api/estimating/bids/[bidId]]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
