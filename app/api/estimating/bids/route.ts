import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

const JOBS_TAB = 'Jobs';
const JOBS_HEADERS = [
  'Job_ID', 'Project_Name', 'Client_GC_Name', 'Architect', 'Island',
  'Job_Status', 'Job_Type', 'Bid_Due_Date', 'Project_Folder_URL',
  'Created_At', 'Notes',
];

const BIDS_TAB = 'Bid_Versions';
const BIDS_HEADERS = [
  'Bid_Version_ID', 'Job_ID', 'Version_Number', 'Status', 'Estimator',
  'Bid_Date', 'Total_Estimate', 'Markup_Pct', 'GET_Rate',
  'Overhead_Method', 'Profit_Pct', 'Proposal_DOC_URL', 'Created_At', 'Notes',
];

async function ensureTab(
  sheets: ReturnType<typeof google.sheets>,
  tabName: string,
  headers: string[]
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }
}

function rowToJob(r: string[]) {
  return {
    job_id: r[0] || '',
    project_name: r[1] || '',
    client_gc_name: r[2] || '',
    architect: r[3] || '',
    island: r[4] || '',
    job_status: r[5] || '',
    job_type: r[6] || '',
    bid_due_date: r[7] || '',
    project_folder_url: r[8] || '',
    created_at: r[9] || '',
    notes: r[10] || '',
  };
}

function rowToBidVersion(r: string[]) {
  return {
    bid_version_id: r[0] || '',
    job_id: r[1] || '',
    version_number: r[2] || '',
    status: r[3] || 'Draft',
    estimator: r[4] || '',
    bid_date: r[5] || '',
    total_estimate: r[6] || '',
    markup_pct: r[7] || '',
    get_rate: r[8] || '0.045',
    overhead_method: r[9] || 'LABOR_EQUAL',
    profit_pct: r[10] || '0.10',
    proposal_doc_url: r[11] || '',
    created_at: r[12] || '',
    notes: r[13] || '',
  };
}

// GET /api/estimating/bids — List all bids (joined Jobs + Bid_Versions)
export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureTab(sheets, JOBS_TAB, JOBS_HEADERS);
    await ensureTab(sheets, BIDS_TAB, BIDS_HEADERS);

    const [jobsRes, bidsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${JOBS_TAB}!A2:K2000`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${BIDS_TAB}!A2:N2000`,
      }),
    ]);

    const jobs = (jobsRes.data.values || []).filter(r => r[0]).map(rowToJob);
    const bidVersions = (bidsRes.data.values || []).filter(r => r[0]).map(rowToBidVersion);

    // Join: each bid version gets the job's project_name
    const jobMap = new Map(jobs.map(j => [j.job_id, j]));
    const bids = bidVersions.map(bv => {
      const job = jobMap.get(bv.job_id);
      return {
        bidVersionId: bv.bid_version_id,
        jobId: bv.job_id,
        projectName: job?.project_name || '',
        island: job?.island || '',
        clientGC: job?.client_gc_name || '',
        estimator: bv.estimator,
        bidDate: bv.bid_date,
        status: bv.status || 'Draft',
        totalEstimate: bv.total_estimate,
        getRate: bv.get_rate,
        overheadMethod: bv.overhead_method,
        profitPct: bv.profit_pct,
        version: bv.version_number,
        notes: bv.notes,
        bidFolderUrl: job?.project_folder_url || '',
      };
    });

    return NextResponse.json({ bids, total: bids.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, bids: [] }, { status: 500 });
  }
}

// POST /api/estimating/bids — Create a new bid (Job + Bid_Version row)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      project_name,
      client_gc_name = '',
      architect = '',
      island = 'Maui',
      job_type = 'Commercial',
      bid_due_date = '',
      project_folder_url = '',
      estimator = '',
      notes = '',
    } = body;

    if (!project_name) {
      return NextResponse.json({ error: 'project_name is required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    await ensureTab(sheets, JOBS_TAB, JOBS_HEADERS);
    await ensureTab(sheets, BIDS_TAB, BIDS_HEADERS);

    const now = new Date().toISOString();
    const dateStr = now.split('T')[0];

    // Generate IDs
    const jobId = `JOB-${Date.now()}`;
    const bidVersionId = `BID-${Date.now()}-v1`;

    // Write Job row
    const jobRow = [
      jobId, project_name, client_gc_name, architect, island,
      'BID', job_type, bid_due_date, project_folder_url, now, notes,
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${JOBS_TAB}!A:K`,
      valueInputOption: 'RAW',
      requestBody: { values: [jobRow] },
    });

    // Write Bid_Version row
    const bidRow = [
      bidVersionId, jobId, '1', 'Draft', estimator,
      dateStr, '', '', '0.045',
      'LABOR_EQUAL', '0.10', '', now, notes,
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${BIDS_TAB}!A:N`,
      valueInputOption: 'RAW',
      requestBody: { values: [bidRow] },
    });

    return NextResponse.json({
      ok: true,
      job_id: jobId,
      bid_version_id: bidVersionId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
