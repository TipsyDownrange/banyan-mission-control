/**
 * BAN-338 Pay Apps v2c — POST /api/external-waivers/request
 *
 * Admin creates an external lien waiver request (i.e., we're asking a
 * manufacturer to send us a signed waiver that we'll then forward to the GC).
 * Default status is REQUESTED.
 */

import { NextResponse } from 'next/server';
import { db, external_lien_waiver_requests } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { WAIVER_TYPES, type WaiverType } from '@/lib/lien-waivers/auto-generation';
import {
  dispatchSourceEvent,
  resolveEngagementContext,
} from '@/lib/pm/action-items/spine-subscriber';

const ALLOWED_METHODS = ['EMAIL', 'PORTAL', 'MAIL', 'PHONE'];

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, '/api/external-waivers/request', 'project:edit');
  if (!gate.ok) return gate.response;

  let body: {
    engagement_id?: string;
    manufacturer_org_id?: string;
    manufacturer_contact_name?: string;
    manufacturer_contact_email?: string;
    waiver_type?: string;
    request_method?: string;
    request_evidence_drive_id?: string;
    pay_app_id?: string;
    joint_check_agreement_id?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.engagement_id || !body.manufacturer_org_id || !body.waiver_type) {
    return NextResponse.json(
      { error: 'engagement_id, manufacturer_org_id, and waiver_type are required' },
      { status: 400 },
    );
  }
  const waiverType = body.waiver_type as WaiverType;
  if (!WAIVER_TYPES.includes(waiverType)) {
    return NextResponse.json(
      { error: `waiver_type must be one of ${WAIVER_TYPES.join(', ')}` },
      { status: 400 },
    );
  }
  if (body.request_method && !ALLOWED_METHODS.includes(body.request_method)) {
    return NextResponse.json(
      { error: `request_method must be one of ${ALLOWED_METHODS.join(', ')}` },
      { status: 400 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(external_lien_waiver_requests)
      .values({
        tenant_id: gate.tenantId,
        engagement_id: body.engagement_id!,
        manufacturer_org_id: body.manufacturer_org_id!,
        manufacturer_contact_name: body.manufacturer_contact_name ?? null,
        manufacturer_contact_email: body.manufacturer_contact_email ?? null,
        waiver_type: waiverType,
        status: 'REQUESTED',
        request_method: body.request_method ?? null,
        request_evidence_drive_id: body.request_evidence_drive_id ?? null,
        pay_app_id: body.pay_app_id ?? null,
        joint_check_agreement_id: body.joint_check_agreement_id ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    const row = inserted[0];
    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      scope_entity_type: 'project',
      scope_entity_id: row.engagement_id,
      entity_kind: 'external_lien_waiver_request',
      entity_id: row.external_waiver_id,
      notes: `External waiver requested (${waiverType}) from manufacturer ${row.manufacturer_org_id}`,
      reported_by: gate.actorEmail || null,
      test_data: false,
      metadata: {
        from_state: null,
        to_state: 'REQUESTED',
        waiver_type: waiverType,
        manufacturer_org_id: row.manufacturer_org_id,
        request_method: body.request_method ?? null,
      },
    });
    return { row, eventId: emit.event_id };
  });

  // BAN-354 PM-V1.0-E.b — Action Item Tracker subscriber. Post-commit;
  // wrapped in try/catch so a subscriber error never rolls back the source
  // EXTERNAL_LIEN_WAIVER_STATE_CHANGED emit.
  try {
    const engCtx = await resolveEngagementContext(gate.tenantId, result.row.engagement_id);
    await dispatchSourceEvent({
      eventType: 'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      entityKind: 'external_lien_waiver_request',
      entityId: result.row.external_waiver_id,
      tenantId: gate.tenantId,
      engagementId: result.row.engagement_id,
      kid: engCtx?.kid ?? null,
      isTestProject: engCtx?.isTestProject ?? false,
      metadata: {
        from_state: null,
        to_state: 'REQUESTED',
        waiver_type: waiverType,
        manufacturer_org_id: result.row.manufacturer_org_id,
      },
      actorEmail: gate.actorEmail,
    });
  } catch {
    // Subscriber failure must never roll back the source emit.
  }

  return NextResponse.json({
    ok: true,
    external_waiver: result.row,
    event_id: result.eventId,
  }, { status: 201 });
}
