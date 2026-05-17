/**
 * BAN-309 Pass 3a.2 PR 3 — by-id CRUD for pay_app_line_items.
 *
 * No Activity Spine emission (D3 classification: child table, CRUD-only).
 *
 * DELETE gating: only when parent pay_applications.state ∈ {PENDING_DRAFT}.
 * Schema drift note (Charter Rule 12): dispatch said {DRAFT, IN_REVIEW}; live
 * schema CHECK has neither — only PENDING_DRAFT is pre-lock. PR description
 * carries the drift.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, pay_app_line_items, pay_applications } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/aia/pay-app-line-items/[id]';
const PRE_LOCK_STATES = new Set(['PENDING_DRAFT']);

const ALLOWED_LINE_TYPES = new Set([
  'LUMP_SUM', 'TM_AUTHORIZATION', 'MOBILIZATION', 'RETAINAGE_RELEASE',
  'DEPOSIT_DRAW_DOWN', 'STORED_MATERIALS', 'OTHER',
]);

const PATCHABLE_FIELDS = new Set([
  'line_type', 'description', 'sov_line_id', 'tm_authorization_id',
  'scheduled_value', 'work_completed_previous', 'work_completed_this_period',
  'stored_materials', 'total_completed_and_stored', 'percent_complete',
  'retainage_held', 'balance_to_finish',
]);

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const rows = await db
    .select()
    .from(pay_app_line_items)
    .where(
      and(
        eq(pay_app_line_items.pay_app_line_id, id),
        eq(pay_app_line_items.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: `pay_app_line_item ${id} not found` }, { status: 404 });
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
    if (k === 'line_type' && typeof v === 'string' && !ALLOWED_LINE_TYPES.has(v)) {
      return NextResponse.json(
        { error: `line_type must be one of ${[...ALLOWED_LINE_TYPES].join(', ')}` },
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
    .select({ pay_app_line_id: pay_app_line_items.pay_app_line_id })
    .from(pay_app_line_items)
    .where(
      and(
        eq(pay_app_line_items.pay_app_line_id, id),
        eq(pay_app_line_items.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    return NextResponse.json({ error: `pay_app_line_item ${id} not found` }, { status: 404 });
  }

  await db
    .update(pay_app_line_items)
    .set(updates)
    .where(
      and(
        eq(pay_app_line_items.pay_app_line_id, id),
        eq(pay_app_line_items.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, pay_app_line_id: id });
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const lookup = await db
    .select({
      pay_app_line_id: pay_app_line_items.pay_app_line_id,
      pay_app_id: pay_app_line_items.pay_app_id,
    })
    .from(pay_app_line_items)
    .where(
      and(
        eq(pay_app_line_items.pay_app_line_id, id),
        eq(pay_app_line_items.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (lookup.length === 0) {
    return NextResponse.json({ error: `pay_app_line_item ${id} not found` }, { status: 404 });
  }

  const parent = await db
    .select({ state: pay_applications.state })
    .from(pay_applications)
    .where(
      and(
        eq(pay_applications.pay_app_id, lookup[0].pay_app_id),
        eq(pay_applications.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);
  if (parent.length === 0) {
    return NextResponse.json(
      { error: 'parent pay_application not found', code: 'PARENT_MISSING' },
      { status: 409 },
    );
  }
  if (!PRE_LOCK_STATES.has(parent[0].state)) {
    return NextResponse.json(
      {
        error: `cannot delete line item: parent pay_application is in state '${parent[0].state}' (pre-lock states: ${[...PRE_LOCK_STATES].join(', ')})`,
        code: 'PARENT_LOCKED',
      },
      { status: 409 },
    );
  }

  await db
    .delete(pay_app_line_items)
    .where(
      and(
        eq(pay_app_line_items.pay_app_line_id, id),
        eq(pay_app_line_items.tenant_id, gate.tenantId),
      ),
    );

  return NextResponse.json({ ok: true, deleted: id });
}
