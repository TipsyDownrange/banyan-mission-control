/**
 * BAN-329 T&M Tickets surface v1 — aggregator for the TMTicketsTab consumer.
 *
 * Resolves an engagement kid (e.g. "PRJ-26-0001") to engagement_id, then
 * fans out parallel reads across tm_tickets, tm_authorizations, and
 * pay_applications (RF7 — for BILLED cross-link rendering), returning the
 * combined payload in a single round-trip. When the kid does not resolve
 * to a Postgres engagement, the response is shaped with `engagement: null`
 * and empty arrays so the UI can render the not-yet-migrated empty state
 * without a second request — mirroring the BAN-322 billing aggregator
 * pattern at app/api/aia/billing/by-kid/[kid]/route.ts.
 *
 *   GET /api/aia/tm-tickets/by-kid/[kid]
 *
 * Schema/spec drift: the spec lists 5 states (DRAFT/SUBMITTED/APPROVED/
 * REJECTED/BILLED) but the code-actual enum is 9 states — see
 * lib/aia/state-transitions.ts:116-126. Code wins. Summary breakdown
 * iterates the code enum so future state additions surface here.
 */

import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  engagements,
  tm_tickets,
  tm_authorizations,
  pay_applications,
} from '@/db';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { TM_TICKET_STATES, type TmTicketState } from '@/lib/aia/state-transitions';

type EngagementRef = {
  engagement_id: string;
  kid: string;
  status: string;
  engagement_type: string;
  pm_handoff_state: string;
  is_test_project: boolean;
};

type BillingReference = {
  pay_app_id: string;
  pay_app_number: number;
  period_end: string | null;
} | null;

type AuthorizationReference = {
  tm_auth_id: string;
  authorization_number: string;
  authorization_method: string;
  authorized_by_name: string | null;
  not_to_exceed_amount: string | null;
} | null;

const EMPTY_PAYLOAD = {
  kIDFound: false,
  engagement: null as EngagementRef | null,
  tickets: [] as unknown[],
  summary: emptySummary(),
} as const;

function emptySummary() {
  const by_state = {} as Record<TmTicketState, number>;
  for (const s of TM_TICKET_STATES) by_state[s] = 0;
  return {
    total_count: 0,
    by_state,
    total_value_usd: 0,
    billed_value_usd: 0,
    unbilled_value_usd: 0,
  };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ kid: string }> },
) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const { kid: rawKid } = await context.params;
  const kid = decodeURIComponent(rawKid).trim();
  if (!kid) {
    return NextResponse.json(
      { error: 'kid path param is required' },
      { status: 400 },
    );
  }

  const engagementRow = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      status: engagements.status,
      engagement_type: engagements.engagement_type,
      pm_handoff_state: engagements.pm_handoff_state,
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

  if (engagementRow.length === 0) {
    return NextResponse.json(EMPTY_PAYLOAD);
  }

  const engagement = engagementRow[0];
  const engagementId = engagement.engagement_id;

  const [ticketsRows, auths, payApps] = await Promise.all([
    db
      .select()
      .from(tm_tickets)
      .where(
        and(
          eq(tm_tickets.tenant_id, gate.tenantId),
          eq(tm_tickets.engagement_id, engagementId),
        ),
      )
      .orderBy(desc(tm_tickets.work_date)),
    db
      .select()
      .from(tm_authorizations)
      .where(
        and(
          eq(tm_authorizations.tenant_id, gate.tenantId),
          eq(tm_authorizations.engagement_id, engagementId),
        ),
      ),
    db
      .select()
      .from(pay_applications)
      .where(
        and(
          eq(pay_applications.tenant_id, gate.tenantId),
          eq(pay_applications.engagement_id, engagementId),
        ),
      ),
  ]);

  const authById = new Map<string, AuthorizationReference>();
  for (const a of auths as Array<Record<string, unknown>>) {
    const id = a.tm_auth_id as string;
    authById.set(id, {
      tm_auth_id: id,
      authorization_number: (a.authorization_number as string) ?? '',
      authorization_method: (a.authorization_method as string) ?? 'OTHER',
      authorized_by_name: (a.authorized_by_name as string | null) ?? null,
      not_to_exceed_amount: (a.not_to_exceed_amount as string | null) ?? null,
    });
  }

  const payAppById = new Map<string, BillingReference>();
  for (const p of payApps as Array<Record<string, unknown>>) {
    const id = p.pay_app_id as string;
    payAppById.set(id, {
      pay_app_id: id,
      pay_app_number: Number(p.pay_app_number ?? 0),
      period_end: (p.period_end as string | null) ?? null,
    });
  }

  const tickets: Array<Record<string, unknown>> = (
    ticketsRows as Array<Record<string, unknown>>
  ).map((t) => {
    const tm_auth_id = (t.tm_auth_id as string) ?? null;
    const pay_app_id = (t.pay_app_id as string | null) ?? null;
    return {
      ...t,
      authorization_reference: tm_auth_id ? authById.get(tm_auth_id) ?? null : null,
      billing_reference: pay_app_id ? payAppById.get(pay_app_id) ?? null : null,
    };
  });

  const summary = emptySummary();
  summary.total_count = tickets.length;
  for (const t of tickets) {
    const state = t.status as TmTicketState;
    if (state in summary.by_state) summary.by_state[state] += 1;
    const value = toNumber(t.ticket_total);
    summary.total_value_usd += value;
    if (state === 'BILLED' || state === 'PAID') {
      summary.billed_value_usd += value;
    } else {
      summary.unbilled_value_usd += value;
    }
  }

  return NextResponse.json({
    kIDFound: true,
    engagement,
    tickets,
    summary,
  });
}
