/**
 * BAN-338 Pay Apps v2c — GET + PATCH /api/gc-required-docs/by-kid/[kid]
 *
 * Per-engagement GC required docs checklist (informational). PATCH upserts:
 * first call creates the row, subsequent calls update it. Emits
 * GC_REQUIRED_DOCS_CHECKLIST_UPDATED on every successful write.
 *
 * ⚠ INFORMATIONAL ONLY — per Sean directive 2026-05-18, this checklist does
 * NOT block pay app submission. The pay-app create UI surfaces a status
 * snapshot (via /api/pay-apps/[id]/required-docs-status) but never gates.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, engagements, gc_required_docs_checklist } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';

const ALLOWED_PHASES = [
  'ESTIMATING_SCOPE_REVIEW',
  'POST_HANDOFF_REVIEW',
  'MID_PROJECT_AMENDMENT',
];

export async function GET(req: Request, context: { params: Promise<{ kid: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { kid } = await context.params;

  const engagementLookup = await db
    .select({ engagement_id: engagements.engagement_id, kid: engagements.kid })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, kid)))
    .limit(1);
  if (engagementLookup.length === 0) {
    return NextResponse.json({ engagement: null, checklist: null });
  }

  const rows = await db
    .select()
    .from(gc_required_docs_checklist)
    .where(and(
      eq(gc_required_docs_checklist.tenant_id, gate.tenantId),
      eq(gc_required_docs_checklist.engagement_id, engagementLookup[0].engagement_id),
    ))
    .limit(1);

  return NextResponse.json({
    engagement: engagementLookup[0],
    checklist: rows[0] ?? null,
  });
}

interface PatchBody {
  identified_phase?: string;
  requires_conditional_progress_waiver_from_kula?: boolean;
  requires_unconditional_progress_waiver_from_kula?: boolean;
  requires_conditional_final_waiver_from_kula?: boolean;
  requires_unconditional_final_waiver_from_kula?: boolean;
  requires_external_waivers_from_manufacturers?: boolean;
  external_waiver_required_manufacturers?: unknown;
  requires_joint_check_agreement?: boolean;
  joint_check_required_manufacturers?: unknown;
  requires_certificate_of_vendor_compliance?: boolean;
  requires_glaziers_union_lien_clearance?: boolean;
  requires_certified_payroll?: boolean;
  requires_safety_documentation?: boolean;
  custom_required_docs?: unknown;
}

export async function PATCH(req: Request, context: { params: Promise<{ kid: string }> }) {
  const gate = await passAiaApiGate(req, '/api/gc-required-docs/by-kid/[kid]', 'project:edit');
  if (!gate.ok) return gate.response;
  const { kid } = await context.params;

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.identified_phase && !ALLOWED_PHASES.includes(body.identified_phase)) {
    return NextResponse.json(
      { error: `identified_phase must be one of ${ALLOWED_PHASES.join(', ')}` },
      { status: 400 },
    );
  }

  const engagementLookup = await db
    .select({ engagement_id: engagements.engagement_id })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, kid)))
    .limit(1);
  if (engagementLookup.length === 0) {
    return NextResponse.json({ error: `engagement ${kid} not found` }, { status: 404 });
  }
  const engagementId = engagementLookup[0].engagement_id;

  const existing = await db
    .select()
    .from(gc_required_docs_checklist)
    .where(and(
      eq(gc_required_docs_checklist.tenant_id, gate.tenantId),
      eq(gc_required_docs_checklist.engagement_id, engagementId),
    ))
    .limit(1);

  const now = new Date();
  const result = await db.transaction(async (tx) => {
    let newRow;
    if (existing.length === 0) {
      const inserted = await tx
        .insert(gc_required_docs_checklist)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          identified_phase: body.identified_phase ?? null,
          identified_at: body.identified_phase ? now : null,
          requires_conditional_progress_waiver_from_kula:
            body.requires_conditional_progress_waiver_from_kula ?? true,
          requires_unconditional_progress_waiver_from_kula:
            body.requires_unconditional_progress_waiver_from_kula ?? true,
          requires_conditional_final_waiver_from_kula:
            body.requires_conditional_final_waiver_from_kula ?? true,
          requires_unconditional_final_waiver_from_kula:
            body.requires_unconditional_final_waiver_from_kula ?? true,
          requires_external_waivers_from_manufacturers:
            body.requires_external_waivers_from_manufacturers ?? false,
          external_waiver_required_manufacturers:
            body.external_waiver_required_manufacturers ?? [],
          requires_joint_check_agreement: body.requires_joint_check_agreement ?? false,
          joint_check_required_manufacturers: body.joint_check_required_manufacturers ?? [],
          requires_certificate_of_vendor_compliance:
            body.requires_certificate_of_vendor_compliance ?? false,
          requires_glaziers_union_lien_clearance:
            body.requires_glaziers_union_lien_clearance ?? false,
          requires_certified_payroll: body.requires_certified_payroll ?? false,
          requires_safety_documentation: body.requires_safety_documentation ?? false,
          custom_required_docs: body.custom_required_docs ?? [],
        })
        .returning();
      newRow = inserted[0];
    } else {
      const patch: Record<string, unknown> = { updated_at: now };
      for (const k of Object.keys(body) as (keyof PatchBody)[]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      const updated = await tx
        .update(gc_required_docs_checklist)
        .set(patch)
        .where(and(
          eq(gc_required_docs_checklist.tenant_id, gate.tenantId),
          eq(gc_required_docs_checklist.engagement_id, engagementId),
        ))
        .returning();
      newRow = updated[0];
    }

    const emit = await emitActivitySpineEvent(tx, {
      event_type: 'GC_REQUIRED_DOCS_CHECKLIST_UPDATED',
      scope_entity_type: 'project',
      scope_entity_id: engagementId,
      entity_kind: 'gc_required_docs_checklist',
      entity_id: newRow.checklist_id,
      notes: existing.length === 0
        ? 'GC required docs checklist created'
        : 'GC required docs checklist updated',
      reported_by: gate.actorEmail || null,
      test_data: false,
      metadata: {
        identified_phase: newRow.identified_phase,
        requires_external_waivers_from_manufacturers: newRow.requires_external_waivers_from_manufacturers,
        requires_joint_check_agreement: newRow.requires_joint_check_agreement,
      },
    });

    return { newRow, eventId: emit.event_id };
  });

  return NextResponse.json({
    ok: true,
    checklist: result.newRow,
    event_id: result.eventId,
  });
}
