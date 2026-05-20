/**
 * BAN-375 Closeout v1.1.1 Phase 1 — GET / PATCH / DELETE
 *   /api/closeout/subcontractors/[id]
 *
 * GET: any project-view role.
 * PATCH: business:admin.
 * DELETE: soft delete (sets active=false). business:admin.
 *
 * Trade + island validation mirrors the collection route.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, subcontractors } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const ROUTE_PATH = '/api/closeout/subcontractors/[id]';

const ALLOWED_TRADES = ['framer', 'waterproofer'] as const;
const ALLOWED_ISLANDS = ['maui', 'oahu', 'big_island', 'kauai', 'lanai', 'molokai'] as const;

interface PatchBody {
  company_name?: string;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  trade?: string;
  island?: string | null;
  active?: boolean;
  notes?: string | null;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const row = await db
    .select()
    .from(subcontractors)
    .where(
      and(
        eq(subcontractors.subcontractor_id, id),
        eq(subcontractors.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (row.length === 0) {
    return NextResponse.json({ error: `subcontractor ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ subcontractor: row[0] });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH, 'business:admin');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Pre-validate trade/island when present (db CHECK would catch but we
  // want a clean 400 with our own code).
  if (body.trade !== undefined) {
    const t = body.trade.trim();
    if (!(ALLOWED_TRADES as readonly string[]).includes(t)) {
      return NextResponse.json(
        { error: `trade must be one of ${ALLOWED_TRADES.join(', ')}`, code: 'INVALID_TRADE' },
        { status: 400 },
      );
    }
  }
  if (body.island !== undefined && body.island !== null) {
    const isle = body.island.trim();
    if (isle && !(ALLOWED_ISLANDS as readonly string[]).includes(isle)) {
      return NextResponse.json(
        { error: `island must be one of ${ALLOWED_ISLANDS.join(', ')}`, code: 'INVALID_ISLAND' },
        { status: 400 },
      );
    }
  }

  // company_name PATCH must enforce the same non-empty rule as POST so
  // whitespace-only payloads can't bypass the create-path guard and persist
  // unusable catalog rows.
  if (body.company_name !== undefined && body.company_name.trim() === '') {
    return NextResponse.json(
      { error: 'company_name cannot be blank' },
      { status: 400 },
    );
  }

  const updateValues: Record<string, unknown> = { updated_at: new Date() };
  if (body.company_name !== undefined) updateValues.company_name = body.company_name.trim();
  if (body.primary_contact_name !== undefined) updateValues.primary_contact_name = body.primary_contact_name;
  if (body.primary_contact_email !== undefined) updateValues.primary_contact_email = body.primary_contact_email;
  if (body.primary_contact_phone !== undefined) updateValues.primary_contact_phone = body.primary_contact_phone;
  if (body.trade !== undefined) updateValues.trade = body.trade.trim();
  // Persist the trimmed island value (or null for empty) so payloads like
  // 'maui ' don't fail the subcontractors_island_check after passing the
  // app-layer validator.
  if (body.island !== undefined) {
    if (body.island === null) {
      updateValues.island = null;
    } else {
      const normalized = body.island.trim();
      updateValues.island = normalized === '' ? null : normalized;
    }
  }
  if (body.active !== undefined) updateValues.active = body.active;
  if (body.notes !== undefined) updateValues.notes = body.notes;

  const updated = await db
    .update(subcontractors)
    .set(updateValues)
    .where(
      and(
        eq(subcontractors.subcontractor_id, id),
        eq(subcontractors.tenant_id, gate.tenantId),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: `subcontractor ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, subcontractor: updated[0] });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Soft delete only — sets active=false. Hard delete is not supported on
  // subs (catalog rows may still be referenced by historical punch items).
  const gate = await passAiaApiGate(req, ROUTE_PATH, 'business:admin');
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const updated = await db
    .update(subcontractors)
    .set({ active: false, updated_at: new Date() })
    .where(
      and(
        eq(subcontractors.subcontractor_id, id),
        eq(subcontractors.tenant_id, gate.tenantId),
      ),
    )
    .returning({ subcontractor_id: subcontractors.subcontractor_id });

  if (updated.length === 0) {
    return NextResponse.json({ error: `subcontractor ${id} not found` }, { status: 404 });
  }
  return NextResponse.json({ ok: true, subcontractor_id: id, active: false });
}
