/**
 * POST /api/bids/create
 * Adds a new bid opportunity to the Smartsheet Bid Log.
 * Called when estimator clicks "Add to Bid Queue" from the inbox scanner.
 */

import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';
import { isStaging } from '@/lib/env';

// BAN-170: Smartsheet bid log ID is env-driven so a staging deploy cannot
// append rows to the production Kula Glass Bid Log. Production sets
// SMARTSHEET_BID_LOG_ID to the prod sheet id; staging must point at a staging
// Smartsheet target. With no env var configured, staging short-circuits
// rather than falling back to the production id.
const PRODUCTION_BID_LOG_ID = '6073963369156484';

function resolveBidLogId(): { ok: true; id: string } | { ok: false; status: number; error: string } {
  const fromEnv = (process.env.SMARTSHEET_BID_LOG_ID || '').trim();
  if (isStaging()) {
    if (!fromEnv) {
      return {
        ok: false,
        status: 502,
        error: 'SMARTSHEET_BID_LOG_ID is not configured for staging — refusing to write to the production bid log',
      };
    }
    if (fromEnv === PRODUCTION_BID_LOG_ID) {
      return {
        ok: false,
        status: 502,
        error: 'SMARTSHEET_BID_LOG_ID resolves to the production bid log on a staging deploy — refusing to write',
      };
    }
    return { ok: true, id: fromEnv };
  }
  // Production keeps the existing canonical id when SMARTSHEET_BID_LOG_ID is
  // not yet set on Vercel — preserves legacy behavior unchanged.
  return { ok: true, id: fromEnv || PRODUCTION_BID_LOG_ID };
}

// Column IDs from the bid log
const COL = {
  jobName:       5065677543264132,
  assignedTo:    2813877729578884,
  status:        7317477356949380,
  contactPerson: 5033294026723204,
  contactInfo:   2781494213037956,
  gc:            7285093840408452,
  receivedDate:  1687977822736260,
  dueDate:       6191577450106756,
  productsSpecs: 1655594306195332,
  linkToBid:     2881766373412740,
  bidSource:     6478995159994244,
  notes:         6159193933565828,
};

function nextKID(existingKIDs: string[]): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `EST-${year}-`;
  const nums = existingKIDs
    .filter(k => k.startsWith(prefix))
    .map(k => parseInt(k.replace(prefix, '')) || 0);
  const next = (Math.max(0, ...nums) + 1).toString().padStart(4, '0');
  return `${prefix}${next}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      project_name,
      gc_name,
      location,
      island,
      bid_due_date,
      scope_summary,
      plan_room_link,
      bid_source,
      assigned_to,
      notes,
      email_id,
    } = body;

    if (!project_name) return NextResponse.json({ error: 'project_name required' }, { status: 400 });

    const resolved = resolveBidLogId();
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error, staging: true }, { status: resolved.status });
    }
    const BID_LOG_ID = resolved.id;

    const token = getSSToken();

    // Get existing rows to generate next EST-kID
    const existing = await fetch(
      `https://api.smartsheet.com/2.0/sheets/${BID_LOG_ID}?pageSize=200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const sheet = await existing.json() as {
      columns?: { id: number; title: string }[];
      rows?: { cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
    };

    // Find kID column (if it exists — some bid logs don't have it)
    const cols: Record<number, string> = {};
    for (const c of sheet.columns || []) cols[c.id] = c.title;

    // Extract existing job names to check for dupes
    const existingNames = (sheet.rows || []).map(r => {
      const cell = r.cells.find(c => c.columnId === COL.jobName);
      return (cell?.displayValue || cell?.value || '').toString().toLowerCase();
    });

    if (existingNames.includes(project_name.toLowerCase())) {
      return NextResponse.json({ error: 'A bid with this project name already exists', duplicate: true }, { status: 409 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const locationStr = [location, island].filter(Boolean).join(', ');

    const cells = [
      { columnId: COL.jobName,       value: project_name },
      { columnId: COL.gc,            value: gc_name || '' },
      { columnId: COL.status,        value: 'New' },
      { columnId: COL.receivedDate,  value: today },
      { columnId: COL.dueDate,       value: bid_due_date || '' },
      { columnId: COL.productsSpecs, value: scope_summary || '' },
      { columnId: COL.linkToBid,     value: plan_room_link || '' },
      { columnId: COL.bidSource,     value: bid_source || 'email' },
      { columnId: COL.assignedTo,    value: assigned_to || '' },
      { columnId: COL.notes,         value: [
          locationStr ? `Location: ${locationStr}` : '',
          email_id ? `Email ID: ${email_id}` : '',
          notes || '',
        ].filter(Boolean).join(' | '),
      },
    ];

    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${BID_LOG_ID}/rows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ toBottom: true, cells }]),
    });

    const data = await res.json() as { result?: { id: number }[]; message?: string };
    if (!res.ok) return NextResponse.json({ error: data.message || 'Smartsheet write failed' }, { status: 500 });

    return NextResponse.json({
      ok: true,
      row_id: data.result?.[0]?.id,
      project_name,
    });

  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
