import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Service_Work_Orders';

// Column order must match the migration script HEADERS array
const COL = {
  wo_id:           0,
  wo_number:       1,
  name:            2,
  description:     3,
  status:          4,
  island:          5,
  area_of_island:  6,
  address:         7,
  contact_person:  8,
  contact_title:   9,
  contact_phone:   10,
  contact_email:   11,
  customer_name:   12,
  system_type:     13,
  assigned_to:     14,
  date_received:   15,
  due_date:        16,
  scheduled_date:  17,
  start_date:      18,
  hours_estimated: 19,
  hours_actual:    20,
  men_required:    21,
  comments:        22,
  folder_url:      23,
  quote_total:     24,
  quote_status:    25,
  created_at:      26, // AA
  updated_at:      27, // AB
  source:          28, // AC
  // QBO invoice columns (actual sheet positions)
  qbo_invoice_id:  26, // AA
  invoice_number:  27, // AB
  invoice_total:   28, // AC
  invoice_balance: 29, // AD
  invoice_date:    30, // AE
  // BanyanOS invoicing tracker (new columns AF-AO)
  deposit_status:      31, // AF
  deposit_amount:      32, // AG
  deposit_invoice_num: 33, // AH
  deposit_sent_date:   34, // AI
  deposit_paid_date:   35, // AJ
  final_status:        36, // AK
  final_amount:        37, // AL
  final_invoice_num:   38, // AM
  final_sent_date:     39, // AN
  final_paid_date:     40, // AO
  invoices_json:       41, // AP
  org_id:              42, // AQ — Phase 2: FK to Organizations
};

// Simple in-process cache (10 minute TTL)
let cache: { data: ReturnType<typeof buildResponse>; ts: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

function rowToWO(row: string[]) {
  const g = (idx: number) => (row[idx] || '').trim();
  return {
    id:             g(COL.wo_id),
    wo_id:          g(COL.wo_id),
    wo_number:      g(COL.wo_number),
    name:           g(COL.name),
    description:    g(COL.description),
    status:         g(COL.status) || 'lead',
    island:         g(COL.island),
    area_of_island: g(COL.area_of_island),
    address:        g(COL.address),
    // Parsed contact fields — separate columns now
    contact_person: g(COL.contact_person),
    contact_title:  g(COL.contact_title),
    contact_phone:  g(COL.contact_phone),
    contact_email:  g(COL.contact_email),
    customer_name:  g(COL.customer_name),
    // Legacy 'contact' field for any frontend that still uses it
    contact:        [g(COL.contact_person), g(COL.contact_phone)].filter(Boolean).join(' · ').substring(0, 60),
    systemType:     g(COL.system_type),
    assignedTo:     g(COL.assigned_to),
    dateReceived:   g(COL.date_received),
    dueDate:        g(COL.due_date),
    scheduledDate:  g(COL.scheduled_date),
    startDate:      g(COL.start_date),
    hoursEstimated: g(COL.hours_estimated),
    hoursActual:    g(COL.hours_actual),
    men:            g(COL.men_required),
    comments:       g(COL.comments),
    folderUrl:      g(COL.folder_url),
    quoteTotal:     g(COL.quote_total),
    quoteStatus:    g(COL.quote_status),
    createdAt:      g(COL.created_at),
    updatedAt:      g(COL.updated_at),
    source:         g(COL.source),
    // QBO invoice fields
    qbo_invoice_id:  g(COL.qbo_invoice_id),
    invoice_number:  g(COL.invoice_number),
    invoice_total:   g(COL.invoice_total),
    invoice_balance: g(COL.invoice_balance),
    invoice_date:    g(COL.invoice_date),
    // BanyanOS invoicing tracker
    deposit_status:      g(COL.deposit_status),
    deposit_amount:      g(COL.deposit_amount),
    deposit_invoice_num: g(COL.deposit_invoice_num),
    deposit_sent_date:   g(COL.deposit_sent_date),
    deposit_paid_date:   g(COL.deposit_paid_date),
    final_status:        g(COL.final_status),
    final_amount:        g(COL.final_amount),
    final_invoice_num:   g(COL.final_invoice_num),
    final_sent_date:     g(COL.final_sent_date),
    final_paid_date:     g(COL.final_paid_date),
    invoices_json:       g(COL.invoices_json),
    org_id:              g(COL.org_id),
    // Legacy compat
    lane:           g(COL.status) === 'closed' ? 'completed' : 'active',
    done:           g(COL.status) === 'closed',
  };
}

function buildResponse(wos: ReturnType<typeof rowToWO>[]) {
  const byStatus = {
    lead:        wos.filter(w => w.status === 'lead'),
    quote:       wos.filter(w => w.status === 'quote'),
    approved:    wos.filter(w => w.status === 'approved'),
    scheduled:   wos.filter(w => w.status === 'scheduled'),
    in_progress: wos.filter(w => w.status === 'in_progress'),
    closed:      wos.filter(w => ['closed', 'completed'].includes(w.status)).slice(0, 10),
    lost:        wos.filter(w => w.status === 'lost').slice(0, 5),
  };

  const active = wos.filter(w => !['closed', 'completed', 'lost'].includes(w.status));
  const closed = wos.filter(w => ['closed', 'completed'].includes(w.status));

  return {
    workOrders: wos,
    byStatus,
    stats: {
      active:          active.length,
      completed:       closed.length,
      needsScheduling: byStatus.approved.length,
      inProgress:      byStatus.in_progress.length,
      total:           wos.length,
    },
  };
}

export async function GET() {
  // Return cached response if fresh
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A2:AH5000`,
    });

    const rows = res.data.values || [];
    const wos = rows
      .filter(row => row.length > 2 && (row[0] || row[2])) // wo_id or name present
      .map(row => rowToWO(row as string[]));

    const response = buildResponse(wos);
    cache = { data: response, ts: now };

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Return stale cache on error rather than empty
    if (cache) {
      return NextResponse.json({ ...cache.data, _stale: true });
    }
    return NextResponse.json(
      { error: msg, workOrders: [], byStatus: {}, stats: {} },
      { status: 500 }
    );
  }
}

// Invalidate cache (called by write routes after mutations)
export function invalidateCache() {
  cache = null;
}
