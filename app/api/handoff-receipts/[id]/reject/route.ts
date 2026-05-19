/**
 * BAN-346 PM-V1.0-G — POST /api/handoff-receipts/[id]/reject
 *
 * Transitions pending_review | reviewed_complete → rejected_with_gaps.
 * Reject is a terminal state in v1.0 — Estimating must re-handoff (new
 * receipt) to resume.  reason is required so the audit trail is meaningful.
 */

import { NextResponse } from 'next/server';
import { passHandoffReceiptReviewGate } from '@/lib/pm/handoff-receipts/api-gate';
import { executeHandoffTransition } from '@/lib/pm/handoff-receipts/state-transitions';
import { dispatchHandoffReceiptStateChange } from '@/lib/pm/handoff-receipts/spine-subscriber-wire';
import {
  getHandoffReceiptForTenant,
  optionalString,
  parseCriticalGaps,
  resolveUserIdByEmail,
  trimString,
} from '@/lib/pm/handoff-receipts/route-utils';
import type { PmHandoffState } from '@/lib/pm/handoff-receipts/types';

const ROUTE_PATH = '/api/handoff-receipts/[id]/reject';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passHandoffReceiptReviewGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  let body: { reason?: string; critical_gaps?: unknown; reviewer_notes?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const reason = trimString(body.reason);
  if (!reason) {
    return NextResponse.json(
      { error: 'reason is required when rejecting a handoff receipt' },
      { status: 400 },
    );
  }

  const existing = await getHandoffReceiptForTenant(gate.tenantId, id);
  if (!existing) {
    return NextResponse.json({ error: 'handoff receipt not found' }, { status: 404 });
  }

  const extra: Record<string, unknown> = {};
  if (body.critical_gaps !== undefined) {
    const parsed = parseCriticalGaps(body.critical_gaps);
    if (parsed === null) {
      return NextResponse.json(
        { error: 'critical_gaps must be an array of { gap_id, gap_type, description, status }' },
        { status: 400 },
      );
    }
    extra.critical_gaps = parsed;
  }
  if (body.reviewer_notes !== undefined) {
    extra.reviewer_notes = optionalString(body.reviewer_notes);
  }

  const actorUserId = await resolveUserIdByEmail(gate.actorEmail);

  const result = await executeHandoffTransition({
    receiptId: id,
    tenantId: gate.tenantId,
    toState: 'rejected_with_gaps',
    actorEmail: gate.actorEmail,
    actorUserId,
    reason,
    extraUpdates: extra,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
  }

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
