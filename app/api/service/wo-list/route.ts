/**
 * /api/service/wo-list
 * Lightweight work order list for the Dispatch Board WO picker.
 * Reads from Service_Work_Orders tab in the backend Google Sheet.
 */
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';

type WorkOrder = { id: string; name: string; island: string; status: string; contact: string };

const SHEET_ID = getBackendSheetId();

// Column indices in Service_Work_Orders tab (0-based)
const COL = {
  wo_id:          0,
  wo_number:      1,
  name:           2,
  status:         4,
  island:         5,
  contact_person: 8,
  contact_phone:  10,
};

const TERMINAL_STATUSES = new Set(['closed', 'lost', 'completed', 'rejected']);

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Service_Work_Orders!A2:AB2000',
    });
    const rows = res.data.values || [];

    const workOrders: WorkOrder[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      if (!row || row.length < 3) continue;
      const g = (i: number) => (row[i] || '') as string;

      const woId     = g(COL.wo_id);
      const woNumber = g(COL.wo_number);
      const name     = g(COL.name).split('\n')[0].substring(0, 80);
      const status   = g(COL.status) || 'active';
      const island   = g(COL.island);
      const contact  = [g(COL.contact_person), g(COL.contact_phone)].filter(Boolean).join(' · ').substring(0, 60);

      if (!name) continue;
      if (TERMINAL_STATUSES.has(status.toLowerCase())) continue;

      const key = woNumber || name;
      if (seen.has(key)) continue;
      seen.add(key);

      workOrders.push({
        id: woNumber || woId,
        name,
        island,
        status,
        contact,
      });
    }

    return NextResponse.json({ workOrders, source: 'backend_sheet' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, workOrders: [] }, { status: 500 });
  }
}
