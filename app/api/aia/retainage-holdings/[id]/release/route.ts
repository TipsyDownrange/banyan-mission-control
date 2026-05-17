/**
 * BAN-309 Pass 3a.2 PR 2 — POST /api/aia/retainage-holdings/{id}/release
 *
 * Emits RETAINAGE_RELEASED (Pattern A) when a retainage holding is released.
 * retainage_holdings has no separate status enum; release is signaled by
 * stamping released_at (NULL → now) and released_pay_app_id (the pay app
 * that triggered the release). Both are written in the same Drizzle tx as
 * the emit.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  retainage_holdings,
  pay_applications,
  engagements,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/aia/retainage-holdings/[id]/release';

interface ReleaseBody {
  released_pay_app_id?: string;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  let body: ReleaseBody;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const lookup = await db
    .select({
      holding_id: retainage_holdings.holding_id,
      engagement_id: retainage_holdings.engagement_id,
      pay_app_id: retainage_holdings.pay_app_id,
      amount_held: retainage_holdings.amount_held,
      released_at: retainage_holdings.released_at,
      is_test_project: engagements.is_test_project,
    })
    .from(retainage_holdings)
    .innerJoin(
      engagements,
      eq(retainage_holdings.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(retainage_holdings.holding_id, id),
        eq(retainage_holdings.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `retainage_holding ${id} not found` },
      { status: 404 },
    );
  }

  const holding = lookup[0];

  if (holding.released_at !== null) {
    return NextResponse.json(
      {
        error: `retainage_holding ${id} is already released`,
        code: 'ALREADY_RELEASED',
      },
      { status: 409 },
    );
  }

  if (body.released_pay_app_id) {
    const payAppCheck = await db
      .select({ pay_app_id: pay_applications.pay_app_id })
      .from(pay_applications)
      .where(
        and(
          eq(pay_applications.pay_app_id, body.released_pay_app_id),
          eq(pay_applications.tenant_id, gate.tenantId),
          eq(pay_applications.engagement_id, holding.engagement_id),
        ),
      )
      .limit(1);
    if (payAppCheck.length === 0) {
      return NextResponse.json(
        {
          error: `released_pay_app_id ${body.released_pay_app_id} does not belong to this engagement`,
          code: 'INVALID_RELEASED_PAY_APP_ID',
        },
        { status: 400 },
      );
    }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const releasedAt = new Date();
      await tx
        .update(retainage_holdings)
        .set({
          released_at: releasedAt,
          released_pay_app_id: body.released_pay_app_id ?? null,
          updated_at: releasedAt,
        })
        .where(
          and(
            eq(retainage_holdings.holding_id, id),
            eq(retainage_holdings.tenant_id, gate.tenantId),
          ),
        );

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'RETAINAGE_RELEASED',
        entity_type: 'project',
        entity_id: holding.engagement_id,
        aia_entity_kind: 'retainage_holding',
        aia_entity_id: id,
        test_data: holding.is_test_project === true,
        metadata: {
          retainage_holding_id: id,
          released_at: releasedAt.toISOString(),
          amount_held: holding.amount_held,
          parent_pay_app_id: holding.pay_app_id,
          released_pay_app_id: body.released_pay_app_id ?? null,
          actor: gate.actorEmail,
        },
      });

      return { released_at: releasedAt.toISOString(), event_id: emit.event_id };
    });

    return NextResponse.json({ ok: true, retainage_holding_id: id, ...result });
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
