/**
 * BAN-338 Pay Apps v2c — GET /api/external-waivers/by-kid/[kid]
 *
 * Lists external waiver requests for an engagement (resolved from kid),
 * augmented with the days_outstanding badge for the REQUESTED-status rows.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, engagements, external_lien_waiver_requests, organizations } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { computeOverdueExternalWaivers } from '@/lib/lien-waivers/overdue-check';

export async function GET(req: Request, context: { params: Promise<{ kid: string }> }) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;
  const { kid } = await context.params;

  const engagementLookup = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(and(eq(engagements.tenant_id, gate.tenantId), eq(engagements.kid, kid)))
    .limit(1);

  if (engagementLookup.length === 0) {
    return NextResponse.json({ engagement: null, external_waivers: [], overdue: [] });
  }

  const rows = await db
    .select({
      external_waiver_id: external_lien_waiver_requests.external_waiver_id,
      manufacturer_org_id: external_lien_waiver_requests.manufacturer_org_id,
      manufacturer_name: organizations.name,
      manufacturer_contact_name: external_lien_waiver_requests.manufacturer_contact_name,
      manufacturer_contact_email: external_lien_waiver_requests.manufacturer_contact_email,
      waiver_type: external_lien_waiver_requests.waiver_type,
      status: external_lien_waiver_requests.status,
      requested_at: external_lien_waiver_requests.requested_at,
      request_method: external_lien_waiver_requests.request_method,
      received_at: external_lien_waiver_requests.received_at,
      uploaded_at: external_lien_waiver_requests.uploaded_at,
      delivered_to_gc_at: external_lien_waiver_requests.delivered_to_gc_at,
      pay_app_id: external_lien_waiver_requests.pay_app_id,
      joint_check_agreement_id: external_lien_waiver_requests.joint_check_agreement_id,
      notes: external_lien_waiver_requests.notes,
    })
    .from(external_lien_waiver_requests)
    .leftJoin(organizations, eq(external_lien_waiver_requests.manufacturer_org_id, organizations.org_id))
    .where(and(
      eq(external_lien_waiver_requests.tenant_id, gate.tenantId),
      eq(external_lien_waiver_requests.engagement_id, engagementLookup[0].engagement_id),
    ))
    .orderBy(desc(external_lien_waiver_requests.requested_at));

  const overdue = computeOverdueExternalWaivers(
    rows.map((r) => ({
      external_waiver_id: r.external_waiver_id,
      status: r.status,
      requested_at: r.requested_at,
      manufacturer_org_id: r.manufacturer_org_id,
      waiver_type: r.waiver_type,
    })),
  );

  return NextResponse.json({
    engagement: engagementLookup[0],
    external_waivers: rows,
    overdue,
  });
}
