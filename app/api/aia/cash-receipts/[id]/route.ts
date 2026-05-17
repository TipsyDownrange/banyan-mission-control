/**
 * BAN-309 Pass 3a.2 PR 3 — by-id GET/PATCH/DELETE for cash_receipts.
 *
 * DELETE gating: schema drift (Charter Rule 12) — dispatch said "not
 * referenced by any pay_application reconciliation"; interpreted as: block
 * DELETE when `reconciliation_status != 'UNMATCHED'`. PR description carries
 * the drift.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, cash_receipts } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/cash-receipts/[id]';

const SOURCES = new Set(['MANUAL', 'QBO_FEED']);
const RECON_STATUSES = new Set(['UNMATCHED', 'FULL', 'PARTIAL', 'OVER']);

const PATCHABLE_FIELDS = new Set([
  'pay_app_id', 'receipt_date', 'amount', 'source',
  'qbo_payment_ref', 'reconciliation_status', 'matched_by', 'matched_at', 'notes',
]);

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(cash_receipts)
    .where(
      and(
        eq(cash_receipts.receipt_id, id),
        eq(cash_receipts.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `cash_receipt ${id} not found` }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(k)) {
      return NextResponse.json(
        { error: `field '${k}' is not patchable`, code: 'FIELD_NOT_PATCHABLE' },
        { status: 400 },
      );
    }
    if (k === 'source' && typeof v === 'string' && !SOURCES.has(v)) {
      return NextResponse.json(
        { error: `source must be one of ${[...SOURCES].join(', ')}` },
        { status: 400 },
      );
    }
    if (k === 'reconciliation_status' && typeof v === 'string' && !RECON_STATUSES.has(v)) {
      return NextResponse.json(
        { error: `reconciliation_status must be one of ${[...RECON_STATUSES].join(', ')}` },
        { status: 400 },
      );
    }
    updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no patchable fields provided' }, { status: 400 });
  }
  updates.updated_at = new Date();

  const existing = await db
    .select({ receipt_id: cash_receipts.receipt_id })
    .from(cash_receipts)
    .where(
      and(
        eq(cash_receipts.receipt_id, id),
        eq(cash_receipts.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `cash_receipt ${id} not found` }, { status: 404 });
  }

  await db
    .update(cash_receipts)
    .set(updates)
    .where(
      and(
        eq(cash_receipts.receipt_id, id),
        eq(cash_receipts.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, receipt_id: id });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select({
      receipt_id: cash_receipts.receipt_id,
      reconciliation_status: cash_receipts.reconciliation_status,
    })
    .from(cash_receipts)
    .where(
      and(
        eq(cash_receipts.receipt_id, id),
        eq(cash_receipts.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `cash_receipt ${id} not found` }, { status: 404 });
  }
  if (rows[0].reconciliation_status !== 'UNMATCHED') {
    return NextResponse.json(
      {
        error: `cannot delete cash_receipt with reconciliation_status='${rows[0].reconciliation_status}'; only UNMATCHED receipts are deletable`,
        code: 'RECEIPT_RECONCILED',
      },
      { status: 409 },
    );
  }

  await db
    .delete(cash_receipts)
    .where(
      and(
        eq(cash_receipts.receipt_id, id),
        eq(cash_receipts.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, deleted: id });
}
