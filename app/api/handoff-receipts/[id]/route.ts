/**
 * BAN-346 PM-V1.0-G — GET/PATCH /api/handoff-receipts/[id]
 *
 * GET returns the receipt row.
 * PATCH updates reviewer_notes, critical_gaps, or packet_drive_file_id.
 * State transitions go through /review, /accept, or /reject — PATCH does
 * not change state.  PATCH on a terminal receipt is rejected to preserve
 * the audit log.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, pm_handoff_receipts } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { passHandoffReceiptReviewGate } from '@/lib/pm/handoff-receipts/api-gate';
import {
  getHandoffReceiptForTenant,
  isPatchField,
  optionalString,
  parseCriticalGaps,
} from '@/lib/pm/handoff-receipts/route-utils';
import { isTerminalState, type PmHandoffState } from '@/lib/pm/handoff-receipts/types';

const ROUTE_PATH = '/api/handoff-receipts/[id]';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const row = await getHandoffReceiptForTenant(gate.tenantId, id);
  if (!row) return NextResponse.json({ error: 'handoff receipt not found' }, { status: 404 });

  return NextResponse.json({ receipt: row });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passHandoffReceiptReviewGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await getHandoffReceiptForTenant(gate.tenantId, id);
  if (!existing) {
    return NextResponse.json({ error: 'handoff receipt not found' }, { status: 404 });
  }
  if (isTerminalState(existing.state as PmHandoffState)) {
    return NextResponse.json(
      { error: `cannot patch a receipt in terminal state ${existing.state}`, code: 'TERMINAL_RECEIPT' },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!isPatchField(k)) continue;
    if (k === 'reviewer_notes') {
      updates.reviewer_notes = optionalString(v);
    } else if (k === 'critical_gaps') {
      const gaps = parseCriticalGaps(v);
      if (gaps === null) {
        return NextResponse.json(
          { error: 'critical_gaps must be an array of { gap_id, gap_type, description, status }' },
          { status: 400 },
        );
      }
      updates.critical_gaps = gaps;
    } else if (k === 'packet_drive_file_id') {
      updates.packet_drive_file_id = optionalString(v);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no allowed fields supplied' }, { status: 400 });
  }
  updates.updated_at = new Date();

  const updated = await db
    .update(pm_handoff_receipts)
    .set(updates)
    .where(
      and(
        eq(pm_handoff_receipts.id, id),
        eq(pm_handoff_receipts.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  return NextResponse.json({ ok: true, receipt: updated[0] });
}
