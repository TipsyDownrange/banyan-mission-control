/**
 * BAN-375 Closeout v1.1.1 Phase 1 — POST /api/closeout/punch-list-items
 *
 * Creates a new punch_list_items row. Auto-assigns the next per-engagement
 * item_number (gap-tolerant: max(item_number) + 1 within the engagement +
 * tenant scope, computed inside a tx so concurrent inserts can't collide on
 * the punch_list_items_engagement_number_uidx unique constraint — a tx-level
 * UNIQUE will surface as a 409 retryable error if it does race).
 *
 * v1.1.1 fields:
 *   - trade (required, defaults to 'other' if omitted)
 *   - assigned_to_sub_id (optional FK → subcontractors)
 *   - walk_id (optional FK → punch_walks)
 *
 * Always writes a punch_list_item_history row with action='created' so the
 * audit trail starts at row birth.
 *
 * Permission: project:edit (passAiaApiGate default).
 */

import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, punch_list_items, punch_list_item_history, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';

const ROUTE_PATH = '/api/closeout/punch-list-items';

const ALLOWED_SOURCES = [
  'FIELD_ISSUE', 'SUBSTANTIAL_WALKTHROUGH', 'GC_TRANSMITTAL',
  'OWNER_WALKTHROUGH', 'ARCHITECT_WALKTHROUGH', 'INTERNAL_QA',
] as const;

const ALLOWED_CATEGORIES = [
  'GLASS', 'FRAMING', 'HARDWARE', 'SEALANT',
  'FINISH', 'CLEANING', 'DOCUMENTATION', 'OTHER',
] as const;

const ALLOWED_TRADES = [
  'glazier', 'framer', 'waterproofer', 'electrician', 'plumber',
  'hvac', 'drywall', 'paint', 'cleaning', 'other',
] as const;

const ALLOWED_RESPONSIBLE = ['KULA', 'OTHER_TRADE', 'GC', 'DISPUTED'] as const;

interface CreateBody {
  engagement_id?: string;
  source?: string;
  source_ref?: string;
  description?: string;
  location?: Record<string, unknown>;
  category?: string;
  trade?: string;
  responsible_party?: string;
  photos_required?: boolean;
  assigned_to?: string;
  assigned_to_sub_id?: string;
  walk_id?: string;
  due_date?: string;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const description = (body.description ?? '').trim();
  const source = (body.source ?? '').trim();
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }
  if (!source) {
    return NextResponse.json({ error: 'source is required' }, { status: 400 });
  }
  if (!(ALLOWED_SOURCES as readonly string[]).includes(source)) {
    return NextResponse.json(
      { error: `source must be one of ${ALLOWED_SOURCES.join(', ')}`, code: 'INVALID_SOURCE' },
      { status: 400 },
    );
  }
  const category = (body.category ?? 'OTHER').trim();
  if (!(ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json(
      { error: `category must be one of ${ALLOWED_CATEGORIES.join(', ')}`, code: 'INVALID_CATEGORY' },
      { status: 400 },
    );
  }
  const trade = (body.trade ?? 'other').trim();
  if (!(ALLOWED_TRADES as readonly string[]).includes(trade)) {
    return NextResponse.json(
      { error: `trade must be one of ${ALLOWED_TRADES.join(', ')}`, code: 'INVALID_TRADE' },
      { status: 400 },
    );
  }
  const responsibleParty = (body.responsible_party ?? 'KULA').trim();
  if (!(ALLOWED_RESPONSIBLE as readonly string[]).includes(responsibleParty)) {
    return NextResponse.json(
      { error: `responsible_party must be one of ${ALLOWED_RESPONSIBLE.join(', ')}`, code: 'INVALID_RESPONSIBLE_PARTY' },
      { status: 400 },
    );
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Next item_number for this engagement. Gap-tolerant: just max+1.
      const maxRow = await tx.execute(sql`
        SELECT COALESCE(MAX(item_number), 0)::int AS max_n
        FROM punch_list_items
        WHERE tenant_id = ${gate.tenantId}
          AND engagement_id = ${engagementId}
      `);
      const maxN = (maxRow.rows as Array<{ max_n: number }>)[0]?.max_n ?? 0;
      const nextNumber = maxN + 1;

      const inserted = await tx
        .insert(punch_list_items)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          item_number: nextNumber,
          source: source as 'FIELD_ISSUE' | 'SUBSTANTIAL_WALKTHROUGH' | 'GC_TRANSMITTAL' | 'OWNER_WALKTHROUGH' | 'ARCHITECT_WALKTHROUGH' | 'INTERNAL_QA',
          source_ref: body.source_ref ?? null,
          description,
          location: body.location ?? {},
          category: category as 'GLASS' | 'FRAMING' | 'HARDWARE' | 'SEALANT' | 'FINISH' | 'CLEANING' | 'DOCUMENTATION' | 'OTHER',
          trade: trade as 'glazier' | 'framer' | 'waterproofer' | 'electrician' | 'plumber' | 'hvac' | 'drywall' | 'paint' | 'cleaning' | 'other',
          responsible_party: responsibleParty as 'KULA' | 'OTHER_TRADE' | 'GC' | 'DISPUTED',
          photos_required: body.photos_required ?? false,
          assigned_to: body.assigned_to ?? null,
          assigned_to_sub_id: body.assigned_to_sub_id ?? null,
          walk_id: body.walk_id ?? null,
          due_date: body.due_date ?? null,
        })
        .returning();
      const item = inserted[0];

      await tx
        .insert(punch_list_item_history)
        .values({
          tenant_id: gate.tenantId,
          punch_item_id: item.punch_item_id,
          action: 'created',
          new_status: 'NEW',
          note: null,
        });

      return item;
    });

    return NextResponse.json({ ok: true, punch_list_item: result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
