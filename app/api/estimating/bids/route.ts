/**
 * GET /api/estimating/bids
 * Query the BanyanOS Bid Log — list and search bids.
 *
 * Query params:
 *   q         — search by Job Name (case-insensitive contains)
 *   island    — filter by Island
 *   status    — filter by Status
 *   assigned  — filter by Assigned To
 *   result    — filter by Win/Loss (WON, LOST, PENDING, NO_BID)
 *   type      — filter by Project Type
 *   from      — received date range start (ISO date)
 *   to        — received date range end (ISO date)
 *   limit     — page size (default 50)
 *   offset    — pagination offset (default 0)
 *
 * GC-D021: fresh read every request — no caching.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';
const BIDS_TAB   = 'Bids';

export type BidRecord = {
  kID: string;
  jobName: string;
  island: string;
  projectType: string;
  bidSource: string;
  assignedTo: string;
  status: string;
  receivedDate: string;
  dueDate: string;
  siteVisitDone: string;
  docsAvailable: string;
  productsSpecs: string;
  gcCount: string;
  estValueLow: number;
  estValueHigh: number;
  submitted: string;
  submittedDate: string;
  decisionDate: string;
  winLoss: string;
  winReason: string;
  lossReason: string;
  competitor: string;
  contractValue: number;
  linkedProjectKID: string;
  estimatingFolderPath: string;
  notes: string;
  createdAt: string;
  modifiedAt: string;
  projectAddress: string;
  bidPlatformURL: string;
};

function rowToRecord(headers: string[], row: string[]): BidRecord {
  const g = (col: string) => row[headers.indexOf(col)] || '';
  const gn = (col: string) => parseFloat(g(col).replace(/[$,]/g,'')) || 0;
  return {
    kID:                g('kID'),
    jobName:            g('Job Name'),
    island:             g('Island'),
    projectType:        g('Project Type'),
    bidSource:          g('Bid Source'),
    assignedTo:         g('Assigned To'),
    status:             g('Status'),
    receivedDate:       g('Received Date'),
    dueDate:            g('Due Date'),
    siteVisitDone:      g('Site Visit Done'),
    docsAvailable:      g('Docs Available'),
    productsSpecs:      g('Products / Specs'),
    gcCount:            g('GC Count'),
    estValueLow:        gn('Est Value (Low)'),
    estValueHigh:       gn('Est Value (High)'),
    submitted:          g('Submitted'),
    submittedDate:      g('Submitted Date'),
    decisionDate:       g('Decision Date'),
    winLoss:            g('Win / Loss'),
    winReason:          g('Win Reason'),
    lossReason:         g('Loss Reason'),
    competitor:         g('Competitor'),
    contractValue:      gn('Contract Value'),
    linkedProjectKID:   g('Linked Project kID'),
    estimatingFolderPath: g('Estimating Folder Path'),
    notes:              g('Notes'),
    createdAt:          g('Created At'),
    modifiedAt:         g('Modified At'),
    projectAddress:     g('Project Address'),
    bidPlatformURL:     g('Bid Platform URL'),
  };
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q        = (searchParams.get('q') || '').toLowerCase().trim();
  const island   = (searchParams.get('island') || '').toLowerCase();
  const status   = (searchParams.get('status') || '').toLowerCase();
  const assigned = (searchParams.get('assigned') || '').toLowerCase();
  const result   = (searchParams.get('result') || '').toLowerCase();
  const type     = (searchParams.get('type') || '').toLowerCase();
  const from     = searchParams.get('from') || '';
  const to       = searchParams.get('to') || '';
  const limit    = Math.min(parseInt(searchParams.get('limit') || '50'), 500);
  const offset   = parseInt(searchParams.get('offset') || '0');

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BID_LOG_ID,
      range: `${BIDS_TAB}!A1:AD1000`,
    });

    const rows = (res.data.values || []) as string[][];
    if (rows.length < 2) return NextResponse.json({ bids: [], meta: { total: 0, win: 0, loss: 0, winRate: 0 } });

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r[headers.indexOf('kID')]);

    const records = dataRows.map(r => rowToRecord(headers, r));

    // Apply filters
    const filtered = records.filter(b => {
      if (q         && !b.jobName.toLowerCase().includes(q)) return false;
      if (island    && b.island.toLowerCase() !== island) return false;
      if (status    && b.status.toLowerCase() !== status) return false;
      if (assigned  && !b.assignedTo.toLowerCase().includes(assigned)) return false;
      if (result    && b.winLoss.toLowerCase() !== result) return false;
      if (type      && !b.projectType.toLowerCase().includes(type)) return false;
      if (from      && b.receivedDate && b.receivedDate < from) return false;
      if (to        && b.receivedDate && b.receivedDate > to) return false;
      return true;
    });

    // Summary stats
    const wins   = filtered.filter(b => b.winLoss.toUpperCase() === 'WON').length;
    const losses = filtered.filter(b => b.winLoss.toUpperCase() === 'LOST').length;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

    const page = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      bids: page,
      meta: {
        total:   filtered.length,
        offset,
        limit,
        hasMore: offset + limit < filtered.length,
        win:     wins,
        loss:    losses,
        pending: filtered.filter(b => !b.winLoss || b.winLoss.toUpperCase() === 'PENDING').length,
        winRate,
      },
    });

  } catch (err) {
    console.error('[/api/estimating/bids]', err);
    return NextResponse.json({ error: String(err), bids: [] }, { status: 500 });
  }
}
