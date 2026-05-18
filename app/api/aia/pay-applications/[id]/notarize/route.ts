/**
 * BAN-309 Pass 3a.2 PR 2 — POST /api/aia/pay-applications/{id}/notarize
 *
 * Emits PAY_APP_NOTARIZED (Pattern A) when a pay application is notarized.
 * pay_applications has no notarized_at column (only notarization_required);
 * the system of record for notarization completion is notarization_sessions
 * (AIA v1.1 §14.1 + §8). This route INSERTs a notarization_sessions row with
 * state='COMPLETED' and emits the event in the same Drizzle tx.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  engagements,
  notarization_sessions,
} from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/aia/pay-applications/[id]/notarize';

interface NotarizeBody {
  notary_name?: string;
  notary_cert_ref?: string;
  provider?: string;
  provider_session_id?: string;
  provider_session_url?: string;
  cost_amount?: number | string;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  let body: NotarizeBody;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const lookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      engagement_id: pay_applications.engagement_id,
      notarization_required: pay_applications.notarization_required,
      is_test_project: engagements.is_test_project,
    })
    .from(pay_applications)
    .innerJoin(
      engagements,
      eq(pay_applications.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(pay_applications.pay_app_id, id),
        eq(pay_applications.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `pay_application ${id} not found` },
      { status: 404 },
    );
  }

  const payApp = lookup[0];

  if (!payApp.notarization_required) {
    return NextResponse.json(
      {
        error: `pay_application ${id} does not require notarization`,
        code: 'NOTARIZATION_NOT_REQUIRED',
      },
      { status: 409 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(notarization_sessions)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: payApp.engagement_id,
          target_kind: 'PAY_APP',
          pay_app_id: id,
          provider: body.provider ?? 'PROOF',
          provider_session_id: body.provider_session_id ?? null,
          provider_session_url: body.provider_session_url ?? null,
          notary_name: body.notary_name ?? null,
          notary_cert_ref: body.notary_cert_ref ?? null,
          state: 'COMPLETED',
          cost_amount:
            body.cost_amount !== undefined ? String(body.cost_amount) : null,
          completed_at: new Date(),
        })
        .returning({
          session_id: notarization_sessions.session_id,
          completed_at: notarization_sessions.completed_at,
        });

      const session = inserted[0];

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'PAY_APP_NOTARIZED',
        scope_entity_type: 'project',
        scope_entity_id: payApp.engagement_id,
        entity_kind: 'pay_application',
        entity_id: id,
        notes: body.notary_name ?? null,
        test_data: payApp.is_test_project === true,
        metadata: {
          pay_app_id: id,
          notarization_session_id: session.session_id,
          notarized_at: session.completed_at?.toISOString() ?? null,
          notary_name: body.notary_name ?? null,
          actor: gate.actorEmail,
        },
      });

      return {
        notarization_session_id: session.session_id,
        notarized_at: session.completed_at?.toISOString() ?? null,
        event_id: emit.event_id,
      };
    });

    return NextResponse.json({ ok: true, pay_app_id: id, ...result });
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
