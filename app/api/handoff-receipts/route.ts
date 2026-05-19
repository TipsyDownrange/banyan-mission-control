/**
 * BAN-346 PM-V1.0-G — POST /api/handoff-receipts + GET /api/handoff-receipts
 *
 * POST creates a new handoff receipt (Estimating side initiates).  Emits
 * HANDOFF_RECEIPT_CREATED in the same Drizzle transaction.
 *
 * GET is the cross-project list surface (PM dashboard "Open Handoffs").
 * Filters: ?state, ?kid, ?engagement_id.  Defaults to pending_review +
 * reviewed_complete (the "open" states).
 */

import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, engagements, pm_handoff_receipts } from '@/db';
import { emitActivitySpineEvent } from '@/lib/activity-spine/emit';
import { passAiaReadGate } from '@/lib/aia/read-gate';
import { passHandoffReceiptCreateGate } from '@/lib/pm/handoff-receipts/api-gate';
import {
  isUuid,
  optionalString,
  parseCriticalGaps,
  parsePmHandoffState,
  resolveEngagementByKid,
  resolveEngagementById,
  resolveUserIdByEmail,
  trimString,
} from '@/lib/pm/handoff-receipts/route-utils';
import {
  PM_HANDOFF_OPEN_STATES,
  type PmHandoffState,
} from '@/lib/pm/handoff-receipts/types';

const ROUTE_PATH = '/api/handoff-receipts';

export async function POST(req: Request) {
  const gate = await passHandoffReceiptCreateGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementKid = trimString(body.engagement_kid);
  const engagementIdRaw = trimString(body.engagement_id);
  const estimateVersionId = optionalString(body.estimate_version_id);
  const packetDriveFileId = optionalString(body.packet_drive_file_id);
  const reviewerNotes = optionalString(body.reviewer_notes);

  const criticalGaps = parseCriticalGaps(body.critical_gaps);
  if (criticalGaps === null) {
    return NextResponse.json(
      { error: 'critical_gaps must be an array of { gap_id, gap_type, description, status }' },
      { status: 400 },
    );
  }

  if (!engagementKid && !engagementIdRaw) {
    return NextResponse.json(
      { error: 'engagement_kid or engagement_id is required' },
      { status: 400 },
    );
  }
  if (engagementIdRaw && !isUuid(engagementIdRaw)) {
    return NextResponse.json({ error: 'engagement_id must be a uuid' }, { status: 400 });
  }

  const submittedByUserId = await resolveUserIdByEmail(gate.actorEmail);

  try {
    const result = await db.transaction(async (tx) => {
      const engagement = engagementIdRaw
        ? await resolveEngagementById(gate.tenantId, engagementIdRaw)
        : await resolveEngagementByKid(gate.tenantId, engagementKid);
      if (!engagement) return { kind: 'engagement_not_found' as const };

      const inserted = await tx
        .insert(pm_handoff_receipts)
        .values({
          tenant_id: gate.tenantId,
          kid: engagement.kid ?? null,
          engagement_id: engagement.engagement_id,
          estimate_version_id: estimateVersionId,
          submitted_by_user_id: submittedByUserId,
          critical_gaps: criticalGaps,
          reviewer_notes: reviewerNotes,
          packet_drive_file_id: packetDriveFileId,
          is_test_project: engagement.is_test_project === true,
        })
        .returning();

      const row = inserted[0];

      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'HANDOFF_RECEIPT_CREATED',
        scope_entity_type: 'project',
        scope_entity_id: engagement.engagement_id,
        entity_kind: 'handoff_receipt',
        entity_id: row.id,
        kid: engagement.kid ?? null,
        test_data: engagement.is_test_project === true,
        metadata: {
          submitted_by: gate.actorEmail,
          estimate_version_id: estimateVersionId,
          critical_gap_count: criticalGaps.length,
          packet_drive_file_id: packetDriveFileId,
        },
      });

      return { kind: 'ok' as const, receipt: row, event_id: emit.event_id };
    });

    if (result.kind === 'engagement_not_found') {
      return NextResponse.json(
        { error: 'engagement not found for the supplied kid / engagement_id' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: true, receipt: result.receipt, event_id: result.event_id },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const gate = await passAiaReadGate(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const stateRaw = url.searchParams.get('state');
  const kid = url.searchParams.get('kid');
  const engagementId = url.searchParams.get('engagement_id');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);

  const whereParts = [eq(pm_handoff_receipts.tenant_id, gate.tenantId)];

  if (stateRaw) {
    if (stateRaw === 'OPEN') {
      whereParts.push(inArray(
        pm_handoff_receipts.state,
        PM_HANDOFF_OPEN_STATES as readonly PmHandoffState[] as PmHandoffState[],
      ));
    } else {
      const states = stateRaw.split(',').map((s) => s.trim()).filter(Boolean);
      const valid = states.map(parsePmHandoffState).filter((v): v is NonNullable<typeof v> => v !== null);
      if (valid.length > 0) whereParts.push(inArray(pm_handoff_receipts.state, valid));
    }
  }
  if (kid) whereParts.push(eq(pm_handoff_receipts.kid, kid));
  if (engagementId && isUuid(engagementId)) {
    whereParts.push(eq(pm_handoff_receipts.engagement_id, engagementId));
  }

  const items = await db
    .select({
      id: pm_handoff_receipts.id,
      tenant_id: pm_handoff_receipts.tenant_id,
      kid: pm_handoff_receipts.kid,
      engagement_id: pm_handoff_receipts.engagement_id,
      estimate_version_id: pm_handoff_receipts.estimate_version_id,
      state: pm_handoff_receipts.state,
      submitted_by_user_id: pm_handoff_receipts.submitted_by_user_id,
      submitted_at: pm_handoff_receipts.submitted_at,
      reviewed_by_user_id: pm_handoff_receipts.reviewed_by_user_id,
      reviewed_at: pm_handoff_receipts.reviewed_at,
      accepted_at: pm_handoff_receipts.accepted_at,
      rejected_at: pm_handoff_receipts.rejected_at,
      critical_gaps: pm_handoff_receipts.critical_gaps,
      reviewer_notes: pm_handoff_receipts.reviewer_notes,
      packet_drive_file_id: pm_handoff_receipts.packet_drive_file_id,
      is_test_project: pm_handoff_receipts.is_test_project,
      created_at: pm_handoff_receipts.created_at,
      updated_at: pm_handoff_receipts.updated_at,
      engagement_kid: engagements.kid,
    })
    .from(pm_handoff_receipts)
    .leftJoin(engagements, eq(pm_handoff_receipts.engagement_id, engagements.engagement_id))
    .where(and(...whereParts))
    .orderBy(desc(pm_handoff_receipts.submitted_at))
    .limit(limit);

  return NextResponse.json({ items, total: items.length });
}
