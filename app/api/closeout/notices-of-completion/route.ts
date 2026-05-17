/**
 * BAN-311 Pass 3b.2 PR 2 — POST /api/closeout/notices-of-completion
 *
 * Closeout v1.1 §9.2 — Records a Hawaii Revised Statutes Notice of
 * Completion filing. Emits NOTICE_OF_COMPLETION_FILED (Pattern A) with
 * payload {kID, noc_id, recording_number, lien_deadline_date}.
 *
 * Per §9.2: NOC filing starts the lien deadline counter but does NOT
 * co-fire PROJECT_STATE_CHANGED. The lien-deadline-passed state advance
 * (§9.4) is a separate, async emission and is out of scope for PR 2.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, notices_of_completion, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

const ROUTE_PATH = '/api/closeout/notices-of-completion';

interface CreateBody {
  engagement_id?: string;
  filed_date?: string;
  recording_number?: string;
  recording_evidence_drive_id?: string;
  hrs_basis?: string;
  lien_deadline_days?: number;
  lien_deadline_date?: string;
  filed_by?: string;
}

export async function POST(req: Request) {
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const engagementId = (body.engagement_id ?? '').trim();
  const filedDate = (body.filed_date ?? '').trim();
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
  }
  if (!filedDate) {
    return NextResponse.json({ error: 'filed_date is required (YYYY-MM-DD)' }, { status: 400 });
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id, is_test_project: engagements.is_test_project })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(notices_of_completion)
        .values({
          tenant_id: gate.tenantId,
          engagement_id: engagementId,
          filed_date: filedDate,
          recording_number: body.recording_number ?? null,
          recording_evidence_drive_id: body.recording_evidence_drive_id ?? null,
          hrs_basis: body.hrs_basis ?? null,
          lien_deadline_days: body.lien_deadline_days ?? 45,
          lien_deadline_date: body.lien_deadline_date ?? null,
          filed_by: body.filed_by ?? null,
        })
        .returning({ noc_id: notices_of_completion.noc_id });

      const noc = inserted[0];
      const emit = await emitActivitySpineEvent(tx, {
        event_type: 'NOTICE_OF_COMPLETION_FILED',
        scope_entity_type: 'project',
        scope_entity_id: engagementId,
        entity_kind: 'notice_of_completion',
        entity_id: noc.noc_id,
        test_data: eng[0].is_test_project === true,
        metadata: {
          noc_id: noc.noc_id,
          engagement_id: engagementId,
          filed_date: filedDate,
          recording_number: body.recording_number ?? null,
          lien_deadline_date: body.lien_deadline_date ?? null,
          actor: gate.actorEmail,
        },
      });

      return { noc_id: noc.noc_id, event_id: emit.event_id };
    });

    return NextResponse.json(
      { ok: true, engagement_id: engagementId, ...result },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ActivitySpineEmitError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), code: 'INTERNAL' },
      { status: 500 },
    );
  }
}
