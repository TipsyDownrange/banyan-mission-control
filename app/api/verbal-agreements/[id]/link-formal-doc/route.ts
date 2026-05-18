/**
 * BAN-342 PM-V1.0-C — POST /api/verbal-agreements/[id]/link-formal-doc
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, verbal_agreements } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passVerbalAgreementWriteGate } from '@/lib/pm/verbal-agreements/api-gate';
import { getVerbalAgreementForTenant, parseFormalDocType, trimString } from '@/lib/pm/verbal-agreements/route-utils';
import { validateVerbalAgreementTransition } from '@/lib/pm/verbal-agreements/state-machine';

const ROUTE_PATH = '/api/verbal-agreements/[id]/link-formal-doc';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passVerbalAgreementWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const formalType = parseFormalDocType(body.formal_documentation_type);
  const formalRef = trimString(body.formal_documentation_ref);
  if (!formalType) {
    return NextResponse.json({ error: 'formal_documentation_type must be CHANGE_ORDER, TM_TICKET, or RFI' }, { status: 400 });
  }
  if (!formalRef) {
    return NextResponse.json({ error: 'formal_documentation_ref is required' }, { status: 400 });
  }

  const existing = await getVerbalAgreementForTenant(gate.tenantId, id);
  if (!existing) return NextResponse.json({ error: 'verbal agreement not found' }, { status: 404 });

  const validation = validateVerbalAgreementTransition(existing.status, 'FORMALIZED');
  if (!validation.ok) return NextResponse.json({ error: validation.message, code: validation.reason }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    const updated = await tx
      .update(verbal_agreements)
      .set({
        formal_documentation_generated: true,
        formal_documentation_type: formalType,
        formal_documentation_ref: formalRef,
        status: 'FORMALIZED',
        updated_at: new Date(),
      })
      .where(
        and(
          eq(verbal_agreements.verbal_agreement_id, id),
          eq(verbal_agreements.tenant_id, gate.tenantId),
        ),
      )
      .returning();

    const event = await emitActivitySpineEvent(tx, {
      event_type: 'VERBAL_AGREEMENT_FORMALIZED',
      scope_entity_type: 'project',
      scope_entity_id: existing.engagement_id,
      entity_kind: 'verbal_agreement',
      entity_id: existing.verbal_agreement_id,
      kid: existing.kid ?? null,
      test_data: existing.is_test_project === true,
      metadata: {
        from_state: existing.status,
        to_state: 'FORMALIZED',
        formal_documentation_type: formalType,
        formal_documentation_ref: formalRef,
        actor: gate.actorEmail,
      },
    });

    return { verbal_agreement: updated[0], event_id: event.event_id };
  });

  return NextResponse.json({ ok: true, ...result });
}
