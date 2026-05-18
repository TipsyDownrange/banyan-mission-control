/**
 * BAN-338 Pay Apps v2c — GET /api/lien-waivers/by-kid/[kid]
 *
 * Returns the lien waiver tracker payload for the PM Lien Waiver Tracker
 * sub-section: all waivers for the engagement keyed by kid, plus the
 * outstanding lien exposure calc and per-type status counts.
 *
 * Pattern mirrors aia/billing/by-kid: when the kid does not resolve to a
 * Postgres engagement, response shape is { engagement: null, waivers: [],
 * exposure: 0 } so the UI can render the empty state without a second
 * request.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, engagements, lien_waivers, pay_applications } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import {
  computeOutstandingLienExposure,
  type ExposurePayAppInput,
  type ExposureWaiverInput,
} from '@/lib/lien-waivers/overdue-check';

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
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
    return NextResponse.json({
      engagement: null,
      waivers: [],
      counts: emptyCounts(),
      exposure: 0,
    });
  }

  const engagement = engagementLookup[0];

  const [waivers, payApps] = await Promise.all([
    db
      .select()
      .from(lien_waivers)
      .where(
        and(
          eq(lien_waivers.tenant_id, gate.tenantId),
          eq(lien_waivers.engagement_id, engagement.engagement_id),
        ),
      )
      .orderBy(desc(lien_waivers.created_at)),
    db
      .select({
        pay_app_id: pay_applications.pay_app_id,
        pay_app_number: pay_applications.pay_app_number,
        state: pay_applications.state,
        is_final_pay_app: pay_applications.is_final_pay_app,
        current_amount_due: pay_applications.current_amount_due,
      })
      .from(pay_applications)
      .where(
        and(
          eq(pay_applications.tenant_id, gate.tenantId),
          eq(pay_applications.engagement_id, engagement.engagement_id),
        ),
      ),
  ]);

  const counts = emptyCounts();
  for (const w of waivers) {
    const type = w.waiver_type as keyof typeof counts;
    if (counts[type]) {
      counts[type].total += 1;
      const state = w.state;
      if (state === 'GENERATED' || state === 'PENDING') counts[type].generated += 1;
      else if (state === 'NOTARIZED') counts[type].notarized += 1;
      else if (state === 'FILED' || state === 'DELIVERED' || state === 'RELEASED') counts[type].filed += 1;
      else if (state === 'SUPERSEDED' || state === 'VOIDED') counts[type].superseded += 1;
    }
  }

  const exposurePayApps: ExposurePayAppInput[] = payApps.map((p) => ({
    pay_app_id: p.pay_app_id,
    current_amount_due: Number(p.current_amount_due ?? 0),
    state: p.state,
    is_final_pay_app: !!p.is_final_pay_app,
  }));
  const exposureWaivers: ExposureWaiverInput[] = waivers.map((w) => ({
    pay_app_id: w.pay_app_id,
    waiver_type: w.waiver_type,
    state: w.state,
  }));
  const exposure = computeOutstandingLienExposure(exposurePayApps, exposureWaivers);

  return NextResponse.json({
    engagement: {
      engagement_id: engagement.engagement_id,
      kid: engagement.kid,
      is_test_project: engagement.is_test_project,
    },
    waivers,
    counts,
    exposure,
  });
}

function emptyCounts() {
  return {
    CONDITIONAL_PROGRESS: { total: 0, generated: 0, notarized: 0, filed: 0, superseded: 0 },
    UNCONDITIONAL_PROGRESS: { total: 0, generated: 0, notarized: 0, filed: 0, superseded: 0 },
    CONDITIONAL_FINAL: { total: 0, generated: 0, notarized: 0, filed: 0, superseded: 0 },
    UNCONDITIONAL_FINAL: { total: 0, generated: 0, notarized: 0, filed: 0, superseded: 0 },
  };
}
