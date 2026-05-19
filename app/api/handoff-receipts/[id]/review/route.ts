/**
 * BAN-346 PM-V1.0-G — POST /api/handoff-receipts/[id]/review
 *
 * Transitions pending_review → reviewed_complete.  PM may pass through
 * this state explicitly before accept/reject, or skip it and go straight
 * to /accept or /reject.  Emits HANDOFF_RECEIPT_STATE_CHANGED and fires
 * the action-item subscriber wire to create a "Review handoff packet"
 * action item for the PM.
 */

import { NextResponse } from 'next/server';
import { passHandoffReceiptReviewGate } from '@/lib/pm/handoff-receipts/api-gate';
import { executeHandoffTransition } from '@/lib/pm/handoff-receipts/state-transitions';
import { dispatchHandoffReceiptStateChange } from '@/lib/pm/handoff-receipts/spine-subscriber-wire';
import {
  getHandoffReceiptForTenant,
  resolveUserIdByEmail,
} from '@/lib/pm/handoff-receipts/route-utils';
import type { PmHandoffState } from '@/lib/pm/handoff-receipts/types';

const ROUTE_PATH = '/api/handoff-receipts/[id]/review';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passHandoffReceiptReviewGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const existing = await getHandoffReceiptForTenant(gate.tenantId, id);
  if (!existing) {
    return NextResponse.json({ error: 'handoff receipt not found' }, { status: 404 });
  }

  const actorUserId = await resolveUserIdByEmail(gate.actorEmail);

  const result = await executeHandoffTransition({
    receiptId: id,
    tenantId: gate.tenantId,
    toState: 'reviewed_complete',
    actorEmail: gate.actorEmail,
    actorUserId,
    reason: body.reason ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }

  // Fire the subscriber wire — surface errors via the response payload but
  // never reject the transition.
  const subscriber = await dispatchHandoffReceiptStateChange({
    tenantId: gate.tenantId,
    receiptId: id,
    engagementId: existing.engagement_id ?? null,
    kid: existing.kid ?? null,
    isTestProject: existing.is_test_project === true,
    fromState: result.from_state as PmHandoffState,
    toState: result.to_state as PmHandoffState,
    actorEmail: gate.actorEmail,
    actorUserId,
  });

  return NextResponse.json({
    ok: true,
    receipt_id: id,
    from_state: result.from_state,
    to_state: result.to_state,
    event_id: result.event_id,
    receipt: result.receipt,
    subscriber,
  });
}
