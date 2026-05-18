/**
 * BAN-338 Pay Apps v2c — joint-check active-agreement lookup.
 *
 * Returns the manufacturer names + agreement ids for any joint_check_agreements
 * in state ACTIVE (or EXECUTED — both bind future payments) for an engagement,
 * along with the rendered footer string to drop into the pay-app submission
 * email body.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db, joint_check_agreements, organizations } from '@/db';
import { buildJointCheckPaymentFooter } from './joint-check-footer';

export interface JointCheckLookupResult {
  agreementIds: string[];
  manufacturers: string[];
  footer: string;
}

export async function hasActiveJointCheckAgreement(
  tenantId: string,
  engagementId: string,
): Promise<JointCheckLookupResult> {
  const rows = await db
    .select({
      joint_check_id: joint_check_agreements.joint_check_id,
      manufacturer_org_id: joint_check_agreements.manufacturer_org_id,
      org_name: organizations.name,
    })
    .from(joint_check_agreements)
    .leftJoin(
      organizations,
      eq(joint_check_agreements.manufacturer_org_id, organizations.org_id),
    )
    .where(
      and(
        eq(joint_check_agreements.tenant_id, tenantId),
        eq(joint_check_agreements.engagement_id, engagementId),
        inArray(joint_check_agreements.status, ['EXECUTED', 'ACTIVE']),
      ),
    );

  const agreementIds = rows.map((r) => r.joint_check_id);
  const manufacturers = rows.map((r) => r.org_name ?? 'Manufacturer');
  return {
    agreementIds,
    manufacturers,
    footer: buildJointCheckPaymentFooter({ manufacturers }),
  };
}
