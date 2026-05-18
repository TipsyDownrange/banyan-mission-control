/**
 * BAN-342 PM-V1.0-C — GET /api/verbal-agreements/by-kid/[kid]
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, engagements, verbal_agreements } from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';

const EMPTY_BY_STATUS = {
  LOGGED: 0,
  FOLLOWED_UP: 0,
  FORMALIZED: 0,
  DISPUTED: 0,
  RESOLVED: 0,
} as const;

type VerbalAgreementRowLite = {
  status: string;
  followup_email_sent: boolean;
  formal_documentation_generated: boolean;
};

function summarize(items: VerbalAgreementRowLite[]) {
  const by_status: Record<string, number> = { ...EMPTY_BY_STATUS };
  let followup_sent = 0;
  let formalized = 0;
  for (const it of items) {
    if (it.status in by_status) by_status[it.status] += 1;
    if (it.followup_email_sent) followup_sent += 1;
    if (it.formal_documentation_generated) formalized += 1;
  }
  return { total: items.length, by_status, followup_sent, formalized };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kid: rawKid } = await context.params;
  const kid = decodeURIComponent(rawKid).trim();
  if (!kid) return NextResponse.json({ error: 'kid path param is required' }, { status: 400 });

  const engagementRows = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      pm_handoff_state: engagements.pm_handoff_state,
      status: engagements.status,
      is_test_project: engagements.is_test_project,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, gate.tenantId),
        eq(engagements.kid, kid),
      ),
    )
    .limit(1);

  if (engagementRows.length === 0) {
    return NextResponse.json({
      kIDFound: false,
      engagement: null,
      items: [],
      summary: { total: 0, by_status: { ...EMPTY_BY_STATUS }, followup_sent: 0, formalized: 0 },
    });
  }

  const engagement = engagementRows[0];
  const items = await db
    .select()
    .from(verbal_agreements)
    .where(
      and(
        eq(verbal_agreements.tenant_id, gate.tenantId),
        eq(verbal_agreements.engagement_id, engagement.engagement_id),
      ),
    )
    .orderBy(desc(verbal_agreements.occurred_at));

  return NextResponse.json({
    kIDFound: true,
    engagement,
    items,
    summary: summarize(items as unknown as VerbalAgreementRowLite[]),
  });
}
