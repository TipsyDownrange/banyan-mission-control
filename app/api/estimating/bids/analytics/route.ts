/**
 * GET /api/estimating/bids/analytics
 * Aggregated analytics from the full Bid Log.
 * Powers Estimating Dashboard and Gold Dataset calibration.
 * GC-D021: fresh read every request.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';

function winRate(wins: number, losses: number): number {
  const d = wins + losses;
  return d > 0 ? Math.round((wins / d) * 100) : 0;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item) || 'Unknown';
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export async function GET(_req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const [bidsRes, quotesRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: BID_LOG_ID, range: 'Bids!A1:AD1000' }),
      sheets.spreadsheets.values.get({ spreadsheetId: BID_LOG_ID, range: 'GC Quotes!A1:K1000' }),
    ]);
    const bRows = (bidsRes.data.values || []) as string[][];
    const qRows = (quotesRes.data.values || []) as string[][];
    const bH = bRows[0] || [];
    const qH = qRows[0] || [];
    const bg = (row: string[], col: string) => row[bH.indexOf(col)] || '';
    const qg = (row: string[], col: string) => row[qH.indexOf(col)] || '';

    type BidRow = { kID:string; jobName:string; island:string; type:string; assignedTo:string; winLoss:string; contractValue:number; receivedDate:string; estLow:number; estHigh:number };
    const bids: BidRow[] = bRows.slice(1).filter(r => bg(r,'kID')).map(r => ({
      kID:           bg(r,'kID'),
      jobName:       bg(r,'Job Name'),
      island:        bg(r,'Island'),
      type:          bg(r,'Project Type'),
      assignedTo:    bg(r,'Assigned To'),
      winLoss:       bg(r,'Win / Loss').toUpperCase(),
      contractValue: parseFloat(bg(r,'Contract Value').replace(/[$,]/g,'')) || 0,
      receivedDate:  bg(r,'Received Date'),
      estLow:        parseFloat(bg(r,'Est Value (Low)').replace(/[$,]/g,'')) || 0,
      estHigh:       parseFloat(bg(r,'Est Value (High)').replace(/[$,]/g,'')) || 0,
    }));

    type QuoteRow = { jobKID:string; gc:string; result:string; quotedAmount:number; ourPrice:number };
    const quotes: QuoteRow[] = qRows.slice(1).filter(r=>qg(r,'Quote kID')).map(r=>({
      jobKID:       qg(r,'Job kID'),
      gc:           qg(r,'General Contractor'),
      result:       qg(r,'Result').toUpperCase(),
      quotedAmount: parseFloat(qg(r,'Quoted Amount').replace(/[$,]/g,''))||0,
      ourPrice:     parseFloat(qg(r,'Our Price').replace(/[$,]/g,''))||0,
    }));

    // ── By estimator ──
    const byEstimator = Object.entries(groupBy(bids, b => b.assignedTo)).map(([name, bidsForEst]) => {
      const w = bidsForEst.filter(b=>b.winLoss==='WON').length;
      const l = bidsForEst.filter(b=>b.winLoss==='LOST').length;
      const totalValue = bidsForEst.filter(b=>b.winLoss==='WON').reduce((s,b)=>s+b.contractValue,0);
      return { name, total:bidsForEst.length, won:w, lost:l, winRate:winRate(w,l), totalContractValue:totalValue };
    }).sort((a,b)=>b.total-a.total);

    // ── By island ──
    const byIsland = Object.entries(groupBy(bids, b => b.island)).map(([island, bidsForIsland]) => {
      const w = bidsForIsland.filter(b=>b.winLoss==='WON').length;
      const l = bidsForIsland.filter(b=>b.winLoss==='LOST').length;
      const avgContractValue = w > 0 ? Math.round(bidsForIsland.filter(b=>b.winLoss==='WON').reduce((s,b)=>s+b.contractValue,0)/w) : 0;
      return { island, total:bidsForIsland.length, won:w, lost:l, winRate:winRate(w,l), avgContractValue };
    }).sort((a,b)=>b.total-a.total);

    // ── By project type ──
    const byType = Object.entries(groupBy(bids, b => b.type || 'Unknown')).map(([type, bidsForType]) => {
      const w = bidsForType.filter(b=>b.winLoss==='WON').length;
      const l = bidsForType.filter(b=>b.winLoss==='LOST').length;
      const avgEst = Math.round(bidsForType.reduce((s,b)=>s+(b.estLow+b.estHigh)/2,0)/bidsForType.length);
      return { type, total:bidsForType.length, won:w, lost:l, winRate:winRate(w,l), avgEstValue:avgEst };
    }).sort((a,b)=>b.total-a.total);

    // ── By GC (win rate against each GC) ──
    const byGC = Object.entries(groupBy(quotes, q => q.gc)).map(([gc, quotesForGC]) => {
      const won = quotesForGC.filter(q=>q.result==='WON').length;
      const lost = quotesForGC.filter(q=>q.result==='LOST').length;
      const avgOurPrice = quotesForGC.length > 0 ? Math.round(quotesForGC.reduce((s,q)=>s+q.ourPrice,0)/quotesForGC.length) : 0;
      return { gc, total:quotesForGC.length, won, lost, winRate:winRate(won,lost), avgOurPrice };
    }).sort((a,b)=>b.total-a.total).slice(0,20);

    // ── Bid volume by month ──
    const byMonth: Record<string, {total:number; won:number; lost:number; pending:number}> = {};
    for (const b of bids) {
      const month = b.receivedDate?.slice(0,7) || 'Unknown';
      if (!byMonth[month]) byMonth[month] = { total:0, won:0, lost:0, pending:0 };
      byMonth[month].total++;
      if (b.winLoss==='WON') byMonth[month].won++;
      else if (b.winLoss==='LOST') byMonth[month].lost++;
      else byMonth[month].pending++;
    }
    const bidVolume = Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).map(([month,d])=>({month,...d}));

    // ── Overall summary ──
    const totalWon  = bids.filter(b=>b.winLoss==='WON').length;
    const totalLost = bids.filter(b=>b.winLoss==='LOST').length;
    const totalContractValue = bids.filter(b=>b.winLoss==='WON').reduce((s,b)=>s+b.contractValue,0);
    const avgContractValue = totalWon > 0 ? Math.round(totalContractValue/totalWon) : 0;

    return NextResponse.json({
      summary: {
        totalBids:         bids.length,
        won:               totalWon,
        lost:              totalLost,
        pending:           bids.filter(b=>!b.winLoss||b.winLoss==='PENDING').length,
        overallWinRate:    winRate(totalWon, totalLost),
        totalContractValue,
        avgContractValue,
        totalGCQuotes:     quotes.length,
      },
      byEstimator,
      byIsland,
      byType,
      byGC,
      bidVolume,
    });
  } catch (err) {
    console.error('[/api/estimating/bids/analytics]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
