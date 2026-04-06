import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

// All tables related to a bid version
const BID_TABLES: Record<string, { tab: string; range: string; idCol: number }> = {
  assembly_summary: { tab: 'Assembly_Summary', range: 'A2:Z2000', idCol: 1 }, // Bid_Version_ID is col B (index 1)
  estimate_lines:   { tab: 'Estimate_Lines',   range: 'A2:Z2000', idCol: 1 },
  labor_lines:      { tab: 'Labor_Lines',      range: 'A2:Z2000', idCol: 1 },
  gap_log:          { tab: 'Gap_Log',          range: 'A2:Z2000', idCol: 1 },
  quote_headers:    { tab: 'Quote_Header',     range: 'A2:Z2000', idCol: 1 },
  quote_lines:      { tab: 'Quote_Lines',      range: 'A2:Z2000', idCol: 0 }, // join via Quote_Header
  takeoff_doors:    { tab: 'Takeoff_Doors',    range: 'A2:Z2000', idCol: 1 },
  takeoff_glass:    { tab: 'Takeoff_Glass',    range: 'A2:Z2000', idCol: 1 },
  takeoff_sealant:  { tab: 'Takeoff_Sealant',  range: 'A2:Z2000', idCol: 1 },
  takeoff_fasteners:{ tab: 'Takeoff_Fasteners',range: 'A2:Z2000', idCol: 1 },
  takeoff_flashing: { tab: 'Takeoff_Flashing', range: 'A2:Z2000', idCol: 1 },
  method_comparison:{ tab: 'Method_Comparison',range: 'A2:Z2000', idCol: 1 },
  system_compliance:{ tab: 'System_Compliance',range: 'A2:Z2000', idCol: 1 },
  spec_requirements:{ tab: 'Spec_Requirements',range: 'A2:Z2000', idCol: 1 },
};

function rowsToObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.filter(r => r.some(v => v)).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i] || ''; });
    return obj;
  });
}

type RouteContext = { params: Promise<{ bidVersionId: string }> };

// GET /api/estimating/bids/[bidVersionId] — Full bid data
export async function GET(_req: Request, ctx: RouteContext) {
  const { bidVersionId } = await ctx.params;

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch bid version record
    const bidRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Bid_Versions!A2:N2000',
    });
    const bidRows = (bidRes.data.values || []).filter(r => r[0]);
    const bidRow = bidRows.find(r => r[0] === bidVersionId);
    if (!bidRow) {
      return NextResponse.json({ error: 'Bid version not found' }, { status: 404 });
    }

    // Fetch job record
    const jobRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Jobs!A2:K2000',
    });
    const jobRows = (jobRes.data.values || []).filter(r => r[0]);
    const jobId = bidRow[1];
    const jobRow = jobRows.find(r => r[0] === jobId);

    // Get spreadsheet meta to see which tabs exist
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingTabs = new Set(meta.data.sheets?.map(s => s.properties?.title) || []);

    // Fetch all related tables in parallel (only tabs that exist)
    const tableRequests = Object.entries(BID_TABLES)
      .filter(([, cfg]) => existingTabs.has(cfg.tab))
      .map(async ([key, cfg]) => {
        try {
          // Get headers first
          const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${cfg.tab}!1:1`,
          });
          const headers = headerRes.data.values?.[0] || [];

          const dataRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${cfg.tab}!${cfg.range}`,
          });
          const rows = (dataRes.data.values || []) as string[][];

          // Filter rows by bid_version_id
          const filtered = rows.filter(r => r[cfg.idCol] === bidVersionId);
          return [key, rowsToObjects(headers as string[], filtered)] as [string, Record<string, string>[]];
        } catch {
          return [key, []] as [string, Record<string, string>[]];
        }
      });

    const tableResults = await Promise.all(tableRequests);
    const tables = Object.fromEntries(tableResults);

    const bid = {
      bid_version_id: bidRow[0],
      job_id: bidRow[1],
      version_number: bidRow[2],
      status: bidRow[3],
      estimator: bidRow[4],
      bid_date: bidRow[5],
      total_estimate: bidRow[6],
      markup_pct: bidRow[7],
      get_rate: bidRow[8],
      overhead_method: bidRow[9],
      profit_pct: bidRow[10],
      proposal_doc_url: bidRow[11],
      created_at: bidRow[12],
      notes: bidRow[13],
    };

    const job = jobRow ? {
      job_id: jobRow[0],
      project_name: jobRow[1],
      client_gc_name: jobRow[2],
      architect: jobRow[3],
      island: jobRow[4],
      job_status: jobRow[5],
      job_type: jobRow[6],
      bid_due_date: jobRow[7],
      project_folder_url: jobRow[8],
    } : null;

    return NextResponse.json({ bid, job, tables });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/estimating/bids/[bidVersionId] — Update bid fields
export async function PATCH(req: Request, ctx: RouteContext) {
  const { bidVersionId } = await ctx.params;

  try {
    const body = await req.json();

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Bid_Versions!A2:N2000',
    });
    const rows = (res.data.values || []) as string[][];
    const rowIndex = rows.findIndex(r => r[0] === bidVersionId);

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Bid version not found' }, { status: 404 });
    }

    const sheetRow = rowIndex + 2; // +1 for 0-index, +1 for header row

    // Column mapping for Bid_Versions
    const FIELD_COL: Record<string, number> = {
      version_number: 2,
      status: 3,
      estimator: 4,
      bid_date: 5,
      total_estimate: 6,
      markup_pct: 7,
      get_rate: 8,
      overhead_method: 9,
      profit_pct: 10,
      proposal_doc_url: 11,
      notes: 13,
    };

    function colLetter(idx: number): string {
      if (idx < 26) return String.fromCharCode(65 + idx);
      return String.fromCharCode(65 + Math.floor(idx / 26) - 1) + String.fromCharCode(65 + (idx % 26));
    }

    const updateData: { range: string; values: string[][] }[] = [];
    for (const [key, val] of Object.entries(body)) {
      const col = FIELD_COL[key];
      if (col !== undefined && val !== undefined) {
        updateData.push({
          range: `Bid_Versions!${colLetter(col)}${sheetRow}`,
          values: [[String(val)]],
        });
      }
    }

    // Also update job fields if passed
    if (body.project_name || body.island || body.client_gc_name || body.bid_due_date) {
      const jobId = rows[rowIndex][1];
      const jobRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Jobs!A2:K2000',
      });
      const jobRows = (jobRes.data.values || []) as string[][];
      const jobRowIndex = jobRows.findIndex(r => r[0] === jobId);

      if (jobRowIndex !== -1) {
        const jobSheetRow = jobRowIndex + 2;
        const JOB_FIELD_COL: Record<string, number> = {
          project_name: 1, client_gc_name: 2, architect: 3, island: 4,
          job_status: 5, job_type: 6, bid_due_date: 7, project_folder_url: 8, notes: 10,
        };
        for (const [key, val] of Object.entries(body)) {
          const col = JOB_FIELD_COL[key];
          if (col !== undefined && val !== undefined) {
            updateData.push({
              range: `Jobs!${colLetter(col)}${jobSheetRow}`,
              values: [[String(val)]],
            });
          }
        }
      }
    }

    if (updateData.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data: updateData },
    });

    return NextResponse.json({ ok: true, updated: updateData.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
