/**
 * BAN-341 PM-V1.0-B — POST /api/rfis (create RFI)
 *
 * Per PM Trunk v1.0 §6.2:
 *   - Caller provides engagement_kid + subject + question + submitted_to.
 *   - rfi_number is auto-assembled from project kID + per-project sequence
 *     (PRJ-YY-NNNN-RFI-NNN). The sequence is computed in the same
 *     transaction as the INSERT to avoid race conditions.
 *   - Initial status defaults to DRAFT; ball_in_court derives to SUBCONTRACTOR.
 */

import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db, engagements, rfis } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { assembleRfiNumber } from '@/lib/pm/rfis/numbering';
import { deriveBallInCourt } from '@/lib/pm/rfis/state-machine';

const ROUTE_PATH = '/api/rfis';
const SUBMITTED_TO_VALUES = new Set(['GC', 'ARCHITECT', 'ENGINEER', 'OWNER']);
const REASON_VALUES = new Set([
  'SCOPE_CLARIFICATION',
  'DRAWING_CONFLICT',
  'SPEC_AMBIGUITY',
  'FIELD_CONDITION',
  'DESIGN_INTENT',
  'OTHER',
]);

const SUBJECT_MAX = 120;

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementKid = typeof body.engagement_kid === 'string' ? body.engagement_kid.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const submittedTo = typeof body.submitted_to === 'string' ? body.submitted_to.trim() : '';
  const reason = typeof body.reason_for_rfi === 'string' ? body.reason_for_rfi.trim() : '';
  const requiredResponseBy = typeof body.required_response_by_date === 'string' && body.required_response_by_date.length > 0
    ? body.required_response_by_date
    : null;
  const costScheduleImpact = body.cost_or_schedule_impact_anticipated === true;
  const costImpactEstimate = Number.isFinite(body.cost_impact_estimate as number)
    ? String(body.cost_impact_estimate)
    : null;
  const scheduleImpactDays = Number.isFinite(body.schedule_impact_days as number)
    ? Math.trunc(body.schedule_impact_days as number)
    : null;

  if (!engagementKid) {
    return NextResponse.json({ error: 'engagement_kid is required' }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: 'subject is required' }, { status: 400 });
  }
  if (subject.length > SUBJECT_MAX) {
    return NextResponse.json(
      { error: `subject must be ${SUBJECT_MAX} characters or fewer` },
      { status: 400 },
    );
  }
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 });
  }
  if (!SUBMITTED_TO_VALUES.has(submittedTo)) {
    return NextResponse.json(
      { error: 'submitted_to must be one of GC, ARCHITECT, ENGINEER, OWNER' },
      { status: 400 },
    );
  }
  if (reason && !REASON_VALUES.has(reason)) {
    return NextResponse.json(
      { error: 'reason_for_rfi must be one of SCOPE_CLARIFICATION, DRAWING_CONFLICT, SPEC_AMBIGUITY, FIELD_CONDITION, DESIGN_INTENT, OTHER' },
      { status: 400 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const engagementRow = await tx
        .select({
          engagement_id: engagements.engagement_id,
          kid: engagements.kid,
        })
        .from(engagements)
        .where(
          and(
            eq(engagements.tenant_id, gate.tenantId),
            eq(engagements.kid, engagementKid),
          ),
        )
        .limit(1);

      if (engagementRow.length === 0) {
        return { kind: 'not_found' as const };
      }

      const engagementId = engagementRow[0].engagement_id;

      // Compute next per-project sequence in the same transaction so the
      // INSERT below sees a consistent MAX. The unique index on rfi_number
      // is the ultimate guard against duplicates.
      const seqRow = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(SUBSTRING(rfi_number FROM 'RFI-([0-9]+)$') AS INT)), 0) + 1 AS next_seq
        FROM ${rfis}
        WHERE ${rfis.engagement_id} = ${engagementId}
      `);
      const seqResult = seqRow as unknown as
        | { rows?: Array<{ next_seq: number | string }> }
        | Array<{ next_seq: number | string }>;
      const seqRows = Array.isArray(seqResult) ? seqResult : (seqResult.rows ?? []);
      const nextSeq = Number(seqRows[0]?.next_seq ?? 1);
      const rfiNumber = assembleRfiNumber(engagementKid, nextSeq);
      const ballInCourt = deriveBallInCourt('DRAFT', null);

      const inserted = await tx
        .insert(rfis)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          rfi_number: rfiNumber,
          subject,
          question,
          reason_for_rfi: reason ? (reason as 'SCOPE_CLARIFICATION') : null,
          cost_or_schedule_impact_anticipated: costScheduleImpact,
          cost_impact_estimate: costImpactEstimate,
          schedule_impact_days: scheduleImpactDays,
          required_response_by_date: requiredResponseBy,
          status: 'DRAFT',
          ball_in_court: ballInCourt,
        })
        .returning();

      return { kind: 'ok' as const, rfi: inserted[0] };
    });

    if (result.kind === 'not_found') {
      return NextResponse.json(
        { error: `engagement not found for kid: ${engagementKid}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, rfi: result.rfi }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key value violates unique constraint/.test(msg)) {
      return NextResponse.json(
        {
          error: 'A concurrent RFI insert claimed this number — retry.',
          code: 'RFI_NUMBER_CONFLICT',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
