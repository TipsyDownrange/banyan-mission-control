import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

// ─── Table Definitions ────────────────────────────────────────────────────────

const TAKEOFF_TABLES: Record<string, {
  tab: string;
  headers: string[];
  idCol: number;     // column index of the row's own ID
  bidCol: number;    // column index of Bid_Version_ID
}> = {
  assembly_summary: {
    tab: 'Assembly_Summary',
    headers: [
      'Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID', 'Location',
      'Qty_SF_DLO', 'Qty_LF', 'Qty_EA', 'Door_Package_On_Doors_Tab',
      'Qty_Status', 'Key_Assumptions', 'Drawing_Refs', 'Spec_Refs', 'Notes',
      'Access_Type', 'Complexity_Level', 'Special_Conditions', 'Install_Basis_Note',
    ],
    idCol: 0,
    bidCol: 1,
  },
  doors: {
    tab: 'Takeoff_Doors',
    headers: [
      'Door_Line_ID', 'Bid_Version_ID', 'Door_Tag', 'Door_Type',
      'System_Type_Context', 'Assembly_ID', 'Location', 'Qty_EA',
      'Glazed_Lite_YN', 'Qty_Status', 'Assumptions', 'Drawing_Refs', 'Notes',
    ],
    idCol: 0,
    bidCol: 1,
  },
  glass: {
    tab: 'Takeoff_Glass',
    headers: [
      'Glass_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID', 'Location',
      'Glass_Type_Code', 'DLO_Width_in', 'DLO_Height_in', 'Bite_Per_Side',
      'Glass_Width_in', 'Glass_Height_in', 'DLO_SF', 'Lite_Area_Tier',
      'Allowance_Pct', 'Buy_SF', 'Qty_EA', 'Total_Buy_SF',
      'Qty_Status', 'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
    idCol: 0,
    bidCol: 1,
  },
  sealant: {
    tab: 'Takeoff_Sealant',
    headers: [
      'Seal_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Joint_Bucket', 'Location', 'Sealant_Type', 'Backer_Rod_YN',
      'Joint_Size_WxD', 'Qty_LF', 'Waste_Pct', 'Qty_Status',
      'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
    idCol: 0,
    bidCol: 1,
  },
  fasteners: {
    tab: 'Takeoff_Fasteners',
    headers: [
      'Fast_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Application', 'Fastener_Type', 'Size', 'Material_Grade', 'Substrate',
      'Spacing_or_Basis', 'Qty_EA', 'Waste_Pct', 'Qty_Status',
      'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
    idCol: 0,
    bidCol: 1,
  },
  flashing: {
    tab: 'Takeoff_Flashing',
    headers: [
      'Flash_Line_ID', 'Bid_Version_ID', 'System_Type', 'Assembly_ID',
      'Item_Description', 'Profile_Dims', 'Developed_Width', 'Material',
      'Thickness', 'Finish', 'Qty_LF', 'Qty_EA', 'Waste_Pct',
      'Qty_Status', 'Drawing_Refs', 'Spec_Refs', 'Notes',
    ],
    idCol: 0,
    bidCol: 1,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowsToObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.filter(r => r.some(v => v)).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}

function objectToRow(headers: string[], obj: Record<string, string>): string[] {
  return headers.map(h => obj[h] ?? '');
}

function colLetter(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  return String.fromCharCode(65 + Math.floor(idx / 26) - 1) + String.fromCharCode(65 + (idx % 26));
}

function generateId(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

const TABLE_PREFIXES: Record<string, string> = {
  assembly_summary: 'ASM',
  doors: 'DOR',
  glass: 'GLS',
  sealant: 'SEAL',
  fasteners: 'FAST',
  flashing: 'FLASH',
};

type RouteContext = { params: Promise<{ bidVersionId: string }> };

// ─── GET — fetch all takeoff tables for a bid version ─────────────────────────

export async function GET(_req: Request, ctx: RouteContext) {
  const { bidVersionId } = await ctx.params;

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingTabs = new Set(meta.data.sheets?.map(s => s.properties?.title) ?? []);

    const results: Record<string, Record<string, string>[]> = {};

    await Promise.all(
      Object.entries(TAKEOFF_TABLES).map(async ([key, cfg]) => {
        if (!existingTabs.has(cfg.tab)) {
          results[key] = [];
          return;
        }
        try {
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${cfg.tab}!A2:Z2000`,
          });
          const rows = (res.data.values ?? []) as string[][];
          const filtered = rows.filter(r => r[cfg.bidCol] === bidVersionId);
          results[key] = rowsToObjects(cfg.headers, filtered);
        } catch {
          results[key] = [];
        }
      })
    );

    return NextResponse.json({ bidVersionId, tables: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — add a row to a takeoff table ─────────────────────────────────────

export async function POST(req: Request, ctx: RouteContext) {
  const { bidVersionId } = await ctx.params;

  try {
    const body = await req.json() as { table: string; row: Record<string, string> };
    const { table, row } = body;

    const cfg = TAKEOFF_TABLES[table];
    if (!cfg) {
      return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Generate ID and set bid version
    const prefix = TABLE_PREFIXES[table] ?? 'ROW';
    const newRow: Record<string, string> = {
      ...row,
      [cfg.headers[cfg.idCol]]: row[cfg.headers[cfg.idCol]] || generateId(prefix),
      [cfg.headers[cfg.bidCol]]: bidVersionId,
    };

    // Apply glass calculations if applicable
    if (table === 'glass') {
      const dloW = parseFloat(newRow['DLO_Width_in'] ?? '') || 0;
      const dloH = parseFloat(newRow['DLO_Height_in'] ?? '') || 0;
      const bite = parseFloat(newRow['Bite_Per_Side'] ?? '') || 0;
      const allowPct = parseFloat(newRow['Allowance_Pct'] ?? '') || 0;
      const qty = parseInt(newRow['Qty_EA'] ?? '') || 0;

      if (dloW > 0 && dloH > 0) {
        if (!newRow['Glass_Width_in'] && bite > 0) newRow['Glass_Width_in'] = String(dloW + 2 * bite);
        if (!newRow['Glass_Height_in'] && bite > 0) newRow['Glass_Height_in'] = String(dloH + 2 * bite);
        const dloSF = (dloW * dloH) / 144;
        if (!newRow['DLO_SF']) newRow['DLO_SF'] = dloSF.toFixed(2);
        const buySF = dloSF * (1 + allowPct);
        if (!newRow['Buy_SF']) newRow['Buy_SF'] = buySF.toFixed(2);
        if (!newRow['Total_Buy_SF'] && qty > 0) newRow['Total_Buy_SF'] = (buySF * qty).toFixed(2);
      }
    }

    const values = [objectToRow(cfg.headers, newRow)];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${cfg.tab}!A:A`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    return NextResponse.json({ ok: true, row: newRow });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — update a row ─────────────────────────────────────────────────────

export async function PATCH(req: Request, ctx: RouteContext) {
  const { bidVersionId } = await ctx.params;

  try {
    const body = await req.json() as {
      table: string;
      rowId: string;
      updates: Record<string, string>;
    };
    const { table, rowId, updates } = body;

    const cfg = TAKEOFF_TABLES[table];
    if (!cfg) {
      return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${cfg.tab}!A2:Z2000`,
    });
    const rows = (res.data.values ?? []) as string[][];
    const rowIndex = rows.findIndex(
      r => r[cfg.idCol] === rowId && r[cfg.bidCol] === bidVersionId
    );

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }

    const sheetRow = rowIndex + 2;

    // Apply glass calculations if updating glass dimensions
    if (table === 'glass') {
      const existingObj = rowsToObjects(cfg.headers, [rows[rowIndex]])[0];
      const merged = { ...existingObj, ...updates };
      const dloW = parseFloat(merged['DLO_Width_in'] ?? '') || 0;
      const dloH = parseFloat(merged['DLO_Height_in'] ?? '') || 0;
      const bite = parseFloat(merged['Bite_Per_Side'] ?? '') || 0;
      const allowPct = parseFloat(merged['Allowance_Pct'] ?? '') || 0;
      const qty = parseInt(merged['Qty_EA'] ?? '') || 0;

      if (dloW > 0 && dloH > 0) {
        updates['Glass_Width_in'] = String(dloW + 2 * bite);
        updates['Glass_Height_in'] = String(dloH + 2 * bite);
        const dloSF = (dloW * dloH) / 144;
        updates['DLO_SF'] = dloSF.toFixed(2);
        const buySF = dloSF * (1 + allowPct);
        updates['Buy_SF'] = buySF.toFixed(2);
        if (qty > 0) updates['Total_Buy_SF'] = (buySF * qty).toFixed(2);
      }
    }

    // Build batch update
    const updateData: { range: string; values: string[][] }[] = [];
    for (const [field, value] of Object.entries(updates)) {
      const colIdx = cfg.headers.indexOf(field);
      if (colIdx === -1) continue;
      updateData.push({
        range: `${cfg.tab}!${colLetter(colIdx)}${sheetRow}`,
        values: [[String(value)]],
      });
    }

    if (updateData.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'RAW', data: updateData },
      });
    }

    return NextResponse.json({ ok: true, updated: updateData.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — remove a row ────────────────────────────────────────────────────

export async function DELETE(req: Request, ctx: RouteContext) {
  const { bidVersionId } = await ctx.params;

  try {
    const body = await req.json() as { table: string; rowId: string };
    const { table, rowId } = body;

    const cfg = TAKEOFF_TABLES[table];
    if (!cfg) {
      return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get spreadsheet ID for this tab
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const sheetMeta = meta.data.sheets?.find(
      s => s.properties?.title === cfg.tab
    );
    const sheetId = sheetMeta?.properties?.sheetId;
    if (sheetId == null) {
      return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 });
    }

    // Find the row
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${cfg.tab}!A2:Z2000`,
    });
    const rows = (res.data.values ?? []) as string[][];
    const rowIndex = rows.findIndex(
      r => r[cfg.idCol] === rowId && r[cfg.bidCol] === bidVersionId
    );

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Row not found' }, { status: 404 });
    }

    const sheetRow = rowIndex + 1; // 0-indexed for deleteRows (row 0 = row 1 header, row 1 = first data row)

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: sheetRow + 1, // +1 for header row
              endIndex: sheetRow + 2,
            },
          },
        }],
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
