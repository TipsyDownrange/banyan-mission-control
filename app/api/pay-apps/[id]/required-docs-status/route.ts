/**
 * BAN-338 Pay Apps v2c — GET /api/pay-apps/[id]/required-docs-status
 *
 * Snapshot rendered in the Pay App Create flow showing required vs ready
 * docs, computed from the engagement's gc_required_docs_checklist + the
 * current state of lien_waivers, external_lien_waiver_requests, and
 * joint_check_agreements. INFORMATIONAL ONLY — does NOT block submission.
 *
 * Response shape:
 *   {
 *     blocking: false,            // ALWAYS false per Sean directive 2026-05-18
 *     items: [{ key, label, required, ready, detail }],
 *     summary: { required: n, ready: m, missing: n - m },
 *   }
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import {
  db,
  pay_applications,
  engagements,
  gc_required_docs_checklist,
  lien_waivers,
  external_lien_waiver_requests,
  joint_check_agreements,
} from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { computeWaiverTypeForTransition } from '@/lib/lien-waivers/auto-generation';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const payAppLookup = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      engagement_id: pay_applications.engagement_id,
      state: pay_applications.state,
      is_final_pay_app: pay_applications.is_final_pay_app,
      kid: engagements.kid,
    })
    .from(pay_applications)
    .innerJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
    .where(and(
      eq(pay_applications.pay_app_id, id),
      eq(pay_applications.tenant_id, gate.tenantId),
    ))
    .limit(1);
  if (payAppLookup.length === 0) {
    return NextResponse.json({ error: 'pay app not found' }, { status: 404 });
  }
  const payApp = payAppLookup[0];

  const [checklist, waivers, externals, jointChecks] = await Promise.all([
    db
      .select()
      .from(gc_required_docs_checklist)
      .where(and(
        eq(gc_required_docs_checklist.tenant_id, gate.tenantId),
        eq(gc_required_docs_checklist.engagement_id, payApp.engagement_id),
      ))
      .limit(1),
    db
      .select()
      .from(lien_waivers)
      .where(and(
        eq(lien_waivers.tenant_id, gate.tenantId),
        eq(lien_waivers.pay_app_id, payApp.pay_app_id),
      )),
    db
      .select()
      .from(external_lien_waiver_requests)
      .where(and(
        eq(external_lien_waiver_requests.tenant_id, gate.tenantId),
        eq(external_lien_waiver_requests.engagement_id, payApp.engagement_id),
      )),
    db
      .select()
      .from(joint_check_agreements)
      .where(and(
        eq(joint_check_agreements.tenant_id, gate.tenantId),
        eq(joint_check_agreements.engagement_id, payApp.engagement_id),
      )),
  ]);

  const c = checklist[0] ?? null;
  const items: Array<{
    key: string;
    label: string;
    required: boolean;
    ready: boolean;
    detail: string;
  }> = [];

  const liveWaiverByType = (type: string) =>
    waivers.find(
      (w) => w.waiver_type === type && w.state !== 'SUPERSEDED' && w.state !== 'VOIDED',
    );
  const nextWaiver = computeWaiverTypeForTransition({
    to_state: payApp.state === 'PENDING_DRAFT' || payApp.state === 'READY_FOR_NOTARIZATION' || payApp.state === 'READY_FOR_SUBMISSION'
      ? 'SUBMITTED'
      : payApp.state,
    is_final_pay_app: !!payApp.is_final_pay_app,
  });
  if (nextWaiver && (!c || effectiveRequired(c, nextWaiver.waiver_type))) {
    const live = liveWaiverByType(nextWaiver.waiver_type);
    items.push({
      key: `lien_waiver:${nextWaiver.waiver_type}`,
      label: `${humanWaiverLabel(nextWaiver.waiver_type)} (Kula)`,
      required: true,
      ready: !!live,
      detail: live ? `state: ${live.state}` : 'not yet generated',
    });
  }

  if (c?.requires_external_waivers_from_manufacturers) {
    const required = (c.external_waiver_required_manufacturers as Array<{ manufacturer_org_id: string; waiver_types?: string[] }>) ?? [];
    for (const entry of required) {
      const types = entry.waiver_types ?? ['CONDITIONAL_PROGRESS', 'UNCONDITIONAL_PROGRESS'];
      for (const t of types) {
        const ready = externals.some(
          (e) =>
            e.manufacturer_org_id === entry.manufacturer_org_id &&
            e.waiver_type === t &&
            (e.status === 'UPLOADED' || e.status === 'DELIVERED_TO_GC'),
        );
        items.push({
          key: `external_waiver:${entry.manufacturer_org_id}:${t}`,
          label: `External ${humanWaiverLabel(t)} from ${entry.manufacturer_org_id.slice(0, 8)}`,
          required: true,
          ready,
          detail: ready ? 'received + uploaded' : 'awaiting manufacturer',
        });
      }
    }
  }

  if (c?.requires_joint_check_agreement) {
    const required = (c.joint_check_required_manufacturers as string[]) ?? [];
    for (const mfg of required) {
      const ready = jointChecks.some(
        (j) =>
          j.manufacturer_org_id === mfg &&
          (j.status === 'EXECUTED' || j.status === 'ACTIVE'),
      );
      items.push({
        key: `joint_check:${mfg}`,
        label: `Joint check agreement with ${mfg.slice(0, 8)}`,
        required: true,
        ready,
        detail: ready ? 'executed' : 'not yet executed',
      });
    }
  }

  for (const [flag, label] of [
    ['requires_certificate_of_vendor_compliance', 'Certificate of vendor compliance'],
    ['requires_glaziers_union_lien_clearance', 'Glaziers union lien clearance'],
    ['requires_certified_payroll', 'Certified payroll'],
    ['requires_safety_documentation', 'Safety documentation'],
  ] as const) {
    if (c?.[flag]) {
      items.push({
        key: flag,
        label,
        required: true,
        ready: false,
        detail: 'manual upload required (not tracked in Postgres yet)',
      });
    }
  }

  const customs = ((c?.custom_required_docs as Array<{ name?: string; description?: string; frequency?: string }>) ?? []);
  for (const cd of customs) {
    if (!cd.name) continue;
    items.push({
      key: `custom:${cd.name}`,
      label: cd.name,
      required: true,
      ready: false,
      detail: cd.description ?? '',
    });
  }

  const required = items.filter((i) => i.required).length;
  const ready = items.filter((i) => i.required && i.ready).length;

  return NextResponse.json({
    blocking: false,
    pay_app_id: payApp.pay_app_id,
    engagement_kid: payApp.kid,
    items,
    summary: { required, ready, missing: Math.max(0, required - ready) },
    note: 'INFORMATIONAL ONLY — does not block pay app submission per Sean directive 2026-05-18.',
  });
}

function effectiveRequired(
  c: typeof gc_required_docs_checklist.$inferSelect,
  waiverType: string,
): boolean {
  switch (waiverType) {
    case 'CONDITIONAL_PROGRESS':
      return !!c.requires_conditional_progress_waiver_from_kula;
    case 'UNCONDITIONAL_PROGRESS':
      return !!c.requires_unconditional_progress_waiver_from_kula;
    case 'CONDITIONAL_FINAL':
      return !!c.requires_conditional_final_waiver_from_kula;
    case 'UNCONDITIONAL_FINAL':
      return !!c.requires_unconditional_final_waiver_from_kula;
    default:
      return true;
  }
}

function humanWaiverLabel(type: string): string {
  switch (type) {
    case 'CONDITIONAL_PROGRESS':
      return 'Conditional progress waiver';
    case 'UNCONDITIONAL_PROGRESS':
      return 'Unconditional progress waiver';
    case 'CONDITIONAL_FINAL':
      return 'Conditional final waiver';
    case 'UNCONDITIONAL_FINAL':
      return 'Unconditional final waiver';
    default:
      return type;
  }
}
