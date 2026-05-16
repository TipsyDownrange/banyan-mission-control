/**
 * /api/service/wo-list
 * Lightweight work order list for the Dispatch Board WO picker.
 * Reads from Service_Work_Orders tab in the backend Google Sheet.
 */
import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';
import { SWO_COL } from '@/lib/contracts/service-work-orders';
import {
  loadWorkOrderPickerFromPostgresShadow,
  shouldReadServiceWorkOrdersFromPostgres,
} from '@/lib/service-work-orders/postgres-read';

type WorkOrder = { id: string; name: string; island: string; status: string; contact: string };

const SHEET_ID = getBackendSheetId();

// Service_Work_Orders column indices come from the shared SWO contract
// (lib/contracts/service-work-orders.ts) — BAN-179.A canonical layout.
const COL = {
  wo_id:          SWO_COL.wo_id,
  wo_number:      SWO_COL.wo_number,
  name:           SWO_COL.name,
  status:         SWO_COL.status,
  island:         SWO_COL.island,
  contact_person: SWO_COL.contact_person,
  contact_phone:  SWO_COL.contact_phone,
} as const;

const TERMINAL_STATUSES = new Set(['closed', 'lost', 'completed', 'rejected']);

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesSearch(workOrder: WorkOrder, search: string) {
  if (!search) return true;
  const haystack = normalizeSearch([
    workOrder.id,
    workOrder.name,
    workOrder.island,
    workOrder.status,
    workOrder.contact,
  ].filter(Boolean).join(' '));
  return haystack.includes(search);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = normalizeSearch(
      searchParams.get('search') || searchParams.get('q') || searchParams.get('customer') || ''
    );

    if (shouldReadServiceWorkOrdersFromPostgres()) {
      const workOrders = (await loadWorkOrderPickerFromPostgresShadow()).filter((wo) => matchesSearch(wo, search));
      return NextResponse.json({ workOrders, source: 'postgres_shadow' });
    }

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

    return NextResponse.json({ workOrders: workOrders.filter((wo) => matchesSearch(wo, search)), source: 'backend_sheet' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, workOrders: [] }, { status: 500 });
  }
}
