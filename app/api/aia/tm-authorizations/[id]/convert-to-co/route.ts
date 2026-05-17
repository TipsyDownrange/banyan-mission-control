/**
 * BAN-309 Pass 3a.2 PR 2 — POST /api/aia/tm-authorizations/{id}/convert-to-co
 *
 * Emits TM_AUTHORIZATION_CONVERTED_TO_CO (Pattern A) when a T&M authorization
 * is converted to a formal Change Order. Stamps tm_authorizations.converted_to_co_ref
 * (the live schema's name; the dispatch's "converted_co_id" is informal) and
 * advances the status to CONVERTED_TO_CO in the same Drizzle tx as the emit.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, tm_authorizations, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/aia/tm-authorizations/[id]/convert-to-co';

interface ConvertBody {
  converted_to_co_ref?: string;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  let body: ConvertBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const coRef = (body.converted_to_co_ref ?? '').trim();
  if (!coRef) {
    return NextResponse.json(
      { error: 'converted_to_co_ref is required' },
      { status: 400 },
    );
  }

  const lookup = await db
    .select({
      tm_auth_id: tm_authorizations.tm_auth_id,
      engagement_id: tm_authorizations.engagement_id,
      status: tm_authorizations.status,
      converted_to_co_ref: tm_authorizations.converted_to_co_ref,
      is_test_project: engagements.is_test_project,
    })
    .from(tm_authorizations)
    .innerJoin(
      engagements,
      eq(tm_authorizations.engagement_id, engagements.engagement_id),
    )
    .where(
      and(
        eq(tm_authorizations.tm_auth_id, id),
        eq(tm_authorizations.tenant_id, gate.tenantId),
      ),
    )
    .limit(1);

  if (lookup.length === 0) {
    return NextResponse.json(
      { error: `tm_authorization ${id} not found` },
      { status: 404 },
    );
  }

  const auth = lookup[0];

  if (auth.status === 'CONVERTED_TO_CO') {
    return NextResponse.json(
      {
        error: `tm_authorization ${id} is already converted to CO`,
        code: 'ALREADY_CONVERTED',
      },
      { status: 409 },
    );
  }

  if (auth.status === 'CLOSED') {
    return NextResponse.json(
      {
        error: `tm_authorization ${id} is CLOSED; reopen via the transition route before converting`,
        code: 'STATUS_NOT_CONVERTIBLE',
      },
      { status: 409 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(tm_authorizations)
        .set({
          status: 'CONVERTED_TO_CO',
          converted_to_co_ref: coRef,
          closed_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(tm_authorizations.tm_auth_id, id),
            eq(tm_authorizations.tenant_id, gate.tenantId),
          ),
        );

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'TM_AUTHORIZATION_CONVERTED_TO_CO',
        entity_type: 'project',
        entity_id: auth.engagement_id,
        aia_entity_kind: 'tm_authorization',
        aia_entity_id: id,
        test_data: auth.is_test_project === true,
        metadata: {
          tm_authorization_id: id,
          converted_to_co_ref: coRef,
          previous_status: auth.status,
          actor: gate.actorEmail,
        },
      });

      return { converted_to_co_ref: coRef, event_id: emit.event_id };
    });

    return NextResponse.json({ ok: true, tm_auth_id: id, ...result });
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
