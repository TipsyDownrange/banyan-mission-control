/**
 * /api/service/wo-list
 * Lightweight work order list for the Dispatch Board WO picker.
 * Tries the full Smartsheet-backed service API first, then falls back
 * to the WO_Folder_Links tab in the backend Google Sheet.
 */
import { NextResponse } from 'next/server';
import { getSSToken, getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

type WorkOrder = { id: string; name: string; island: string; status: string; contact: string };

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

const SS_SHEETS: Record<string, string> = {
  active:    '7905619916154756',
  quoted:    '1349614456229764',
};

async function fetchSSWorkOrders(): Promise<WorkOrder[]> {
  const token = getSSToken();
  const results: WorkOrder[] = [];

  for (const [lane, sheetId] of Object.entries(SS_SHEETS)) {
    try {
      const res = await fetch(
        `https://api.smartsheet.com/2.0/sheets/${sheetId}?pageSize=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json() as {
        columns?: { id: number; title: string }[];
        rows?: { cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
      };
      const cols: Record<number, string> = {};
      for (const c of data.columns || []) cols[c.id] = c.title;

      for (const row of data.rows || []) {
        const rd: Record<string, string> = {};
        for (const cell of row.cells || []) {
          if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || String(cell.value || '');
        }
        const name = (rd['Task Name / Job Name'] || rd['Job Name/WO Number'] || '').split('\n')[0].substring(0, 80);
        const rawStatus = (rd['Status'] || '').toUpperCase();
        if (name && rawStatus !== 'COMPLETED' && rawStatus !== 'LOST' && rawStatus !== 'REJECTED') {
          results.push({
            id: rd['WORK ORDER #'] || rd['Job Name/WO Number'] || '',
            name,
            island: rd['Area of island'] || '',
            status: lane,
            contact: (rd['CONTACT #'] || '').split('\n')[0].substring(0, 60),
          });
        }
      }
    } catch {
      // continue to next sheet
    }
  }

  return results;
}

async function fetchFolderLinkWOs(): Promise<WorkOrder[]> {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'WO_Folder_Links!A:D',
  });
  const rows = res.data.values || [];
  const headers = rows[0] || [];
  const nameIdx = headers.indexOf('folder_name');
  if (nameIdx === -1) return [];

  return rows.slice(1)
    .filter(r => r[nameIdx])
    .map(r => ({
      id: '',
      name: r[nameIdx] as string,
      island: '',
      status: 'active',
      contact: '',
    }));
}

export async function GET() {
  try {
    // Try Smartsheet first
    const ssWOs = await fetchSSWorkOrders();
    if (ssWOs.length > 0) {
      // Deduplicate by name
      const seen = new Set<string>();
      const deduped = ssWOs.filter(w => {
        if (seen.has(w.name)) return false;
        seen.add(w.name);
        return true;
      });
      return NextResponse.json({ workOrders: deduped, source: 'smartsheet' });
    }
  } catch {
    // fall through to fallback
  }

  try {
    // Fallback: WO_Folder_Links tab
    const folderWOs = await fetchFolderLinkWOs();
    return NextResponse.json({ workOrders: folderWOs, source: 'folder_links' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, workOrders: [] }, { status: 500 });
  }
}
