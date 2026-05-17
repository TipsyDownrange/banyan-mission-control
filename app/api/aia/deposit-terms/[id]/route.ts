/**
 * BAN-309 Pass 3a.2 PR 3 — by-id GET/PATCH/DELETE for deposit_terms.
 *
 * DELETE gating: schema drift (Charter Rule 12) — dispatch said "not
 * referenced by any cash_receipts row" but cash_receipts has no
 * deposit_terms_id FK. Interpreted as: block DELETE when
 * `deposit_received_date IS NOT NULL` (deposit has been recorded; audit trail
 * must survive). PR description carries the drift.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, deposit_terms } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/deposit-terms/[id]';

const DEPOSIT_PATTERNS = new Set(['MOBILIZATION_LINE', 'SEPARATE_INVOICE', 'STORED_MATERIALS', 'NONE']);
const DRAW_DOWN = new Set(['AUTO', 'MANUAL']);

const PATCHABLE_FIELDS = new Set([
  'deposit_pattern', 'deposit_amount', 'deposit_amount_pct',
  'deposit_due_date', 'deposit_received_date', 'draw_down_logic',
]);

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(deposit_terms)
    .where(
      and(
        eq(deposit_terms.deposit_terms_id, id),
        eq(deposit_terms.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `deposit_terms ${id} not found` }, { status: 404 });
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
    if (k === 'deposit_pattern' && typeof v === 'string' && !DEPOSIT_PATTERNS.has(v)) {
      return NextResponse.json(
        { error: `deposit_pattern must be one of ${[...DEPOSIT_PATTERNS].join(', ')}` },
        { status: 400 },
      );
    }
    if (k === 'draw_down_logic' && typeof v === 'string' && !DRAW_DOWN.has(v)) {
      return NextResponse.json(
        { error: `draw_down_logic must be one of ${[...DRAW_DOWN].join(', ')}` },
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
    .select({ deposit_terms_id: deposit_terms.deposit_terms_id })
    .from(deposit_terms)
    .where(
      and(
        eq(deposit_terms.deposit_terms_id, id),
        eq(deposit_terms.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `deposit_terms ${id} not found` }, { status: 404 });
  }

  await db
    .update(deposit_terms)
    .set(updates)
    .where(
      and(
        eq(deposit_terms.deposit_terms_id, id),
        eq(deposit_terms.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, deposit_terms_id: id });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select({
      deposit_terms_id: deposit_terms.deposit_terms_id,
      deposit_received_date: deposit_terms.deposit_received_date,
    })
    .from(deposit_terms)
    .where(
      and(
        eq(deposit_terms.deposit_terms_id, id),
        eq(deposit_terms.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `deposit_terms ${id} not found` }, { status: 404 });
  }
  if (rows[0].deposit_received_date != null) {
    return NextResponse.json(
      {
        error: 'cannot delete deposit_terms once a deposit has been recorded (deposit_received_date is set)',
        code: 'DEPOSIT_RECORDED',
      },
      { status: 409 },
    );
  }

  await db
    .delete(deposit_terms)
    .where(
      and(
        eq(deposit_terms.deposit_terms_id, id),
        eq(deposit_terms.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, deleted: id });
}
