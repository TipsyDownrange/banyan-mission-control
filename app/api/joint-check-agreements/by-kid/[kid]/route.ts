/**
 * BAN-338 Pay Apps v2c — GET /api/joint-check-agreements/by-kid/[kid]
 *
 * Lists joint check agreements for an engagement (resolved from kid).
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, engagements, joint_check_agreements, organizations } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';

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
    return NextResponse.json({ engagement: null, agreements: [] });
  }

  const rows = await db
    .select({
      joint_check_id: joint_check_agreements.joint_check_id,
      manufacturer_org_id: joint_check_agreements.manufacturer_org_id,
      manufacturer_name: organizations.name,
      manufacturer_contact_name: joint_check_agreements.manufacturer_contact_name,
      manufacturer_contact_email: joint_check_agreements.manufacturer_contact_email,
      manufacturer_contact_phone: joint_check_agreements.manufacturer_contact_phone,
      scope: joint_check_agreements.scope,
      status: joint_check_agreements.status,
      trigger_source: joint_check_agreements.trigger_source,
      execution_date: joint_check_agreements.execution_date,
      execution_evidence_drive_id: joint_check_agreements.execution_evidence_drive_id,
      start_date: joint_check_agreements.start_date,
      end_date: joint_check_agreements.end_date,
      notes: joint_check_agreements.notes,
      created_at: joint_check_agreements.created_at,
      updated_at: joint_check_agreements.updated_at,
    })
    .from(joint_check_agreements)
    .leftJoin(organizations, eq(joint_check_agreements.manufacturer_org_id, organizations.org_id))
    .where(and(
      eq(joint_check_agreements.tenant_id, gate.tenantId),
      eq(joint_check_agreements.engagement_id, engagementLookup[0].engagement_id),
    ))
    .orderBy(desc(joint_check_agreements.created_at));

  return NextResponse.json({ engagement: engagementLookup[0], agreements: rows });
}
