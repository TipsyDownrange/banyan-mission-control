/**
 * BAN-338 Pay Apps v2c — POST /api/lien-waivers/generate
 *
 * Manual fallback when auto-generation misses an event (e.g., the
 * post-transition hook in submit-direct failed and the admin needs to
 * generate the waiver after the fact).
 *
 * Body:
 *   { pay_app_id: string, waiver_type?: WaiverType, note?: string }
 *
 * If waiver_type is omitted, the route infers it from the pay app's
 * current state + is_final_pay_app via computeWaiverTypeForTransition.
 * The dispatcher still dedupes against existing live waivers, so calling
 * this twice for the same (pay_app, type) is a no-op.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, pay_applications, engagements, lien_waivers } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  WAIVER_TYPES,
  computeWaiverTypeForTransition,
  type WaiverType,
} from '@/lib/lien-waivers/auto-generation';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, '/api/lien-waivers/generate', 'project:edit');
  if (!gate.ok) return gate.response;

  let body: { pay_app_id?: string; waiver_type?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payAppId = (body.pay_app_id ?? '').trim();
  if (!payAppId) {
    return NextResponse.json({ error: 'pay_app_id is required' }, { status: 400 });
  }
  const overrideType = body.waiver_type
    ? (body.waiver_type.trim() as WaiverType)
    : undefined;
  if (overrideType && !WAIVER_TYPES.includes(overrideType)) {
    return NextResponse.json(
      { error: `waiver_type must be one of ${WAIVER_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      pay_app_number: pay_applications.pay_app_number,
      engagement_id: pay_applications.engagement_id,
      state: pay_applications.state,
      current_amount_due: pay_applications.current_amount_due,
      period_end: pay_applications.period_end,
      is_final_pay_app: pay_applications.is_final_pay_app,
      is_test_project: engagements.is_test_project,
    })
    .from(pay_applications)
    .innerJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
    .where(and(
      eq(pay_applications.pay_app_id, payAppId),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = lookup[0];

  let waiverType: WaiverType | null = overrideType ?? null;
  if (!waiverType) {
    const decision = computeWaiverTypeForTransition({
      to_state: payApp.state,
      is_final_pay_app: !!payApp.is_final_pay_app,
    });
    if (!decision) {
      return NextResponse.json(
        {
          error: `Cannot infer waiver type for pay app in state ${payApp.state}; pass waiver_type explicitly`,
          code: 'CANNOT_INFER_WAIVER_TYPE',
        },
        { status: 409 },
      );
    }
    waiverType = decision.waiver_type;
  }

  // Dedup live waiver of the same type.
  const existing = await db
    .select({ waiver_id: lien_waivers.waiver_id, state: lien_waivers.state })
    .from(lien_waivers)
    .where(and(
      eq(lien_waivers.tenant_id, gate.tenantId),
      eq(lien_waivers.pay_app_id, payAppId),
      eq(lien_waivers.waiver_type, waiverType),
    ));
  const live = existing.find((e) => e.state !== 'SUPERSEDED' && e.state !== 'VOIDED');
  if (live) {
    return NextResponse.json(
      {
        ok: false,
        error: `${waiverType} waiver already exists (${live.state})`,
        code: 'WAIVER_ALREADY_EXISTS',
        existing_waiver_id: live.waiver_id,
      },
      { status: 409 },
    );
  }

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(lien_waivers)
      .values({
        tenant_id: gate.tenantId,
        engagement_id: payApp.engagement_id,
        pay_app_id: payAppId,
        waiver_type: waiverType!,
        waiver_amount:
          payApp.current_amount_due === null ? null : String(payApp.current_amount_due),
        through_date: payApp.period_end ?? null,
        state: 'GENERATED',
        trigger_source: 'MANUAL',
        generated_at: now,
      })
      .returning({ waiver_id: lien_waivers.waiver_id });
    const waiverId = inserted[0]?.waiver_id;
    if (!waiverId) throw new Error('lien_waivers INSERT returned no rows');

    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'LIEN_WAIVER_GENERATED',
      scope_entity_type: 'project',
      scope_entity_id: payApp.engagement_id,
      entity_kind: 'lien_waiver',
      entity_id: waiverId,
      notes: body.note ?? `Manually generated ${waiverType} for pay app #${payApp.pay_app_number}`,
      reported_by: gate.actorEmail || null,
      test_data: !!payApp.is_test_project,
      metadata: {
        waiver_type: waiverType,
        trigger_source: 'MANUAL',
        pay_app_id: payAppId,
        pay_app_number: payApp.pay_app_number,
        to_state: payApp.state,
        is_final_pay_app: !!payApp.is_final_pay_app,
      },
    });
    return { waiverId, eventId: emit.event_id };
  });

  return NextResponse.json({
    ok: true,
    waiver_id: result.waiverId,
    waiver_type: waiverType,
    event_id: result.eventId,
  });
}
