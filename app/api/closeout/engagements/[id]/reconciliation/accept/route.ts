/**
 * BAN-311 Pass 3b.2 PR 2 — POST /api/closeout/engagements/{id}/reconciliation/accept
 *
 * Closeout v1.1 §15.4 (D12 RESOLVED — XO read directly from Drive
 * 1g3jnpaqVhan-nNqaUadoPNVyPcLIB68P): "Acceptance is explicit — PM presents
 * reconciled report; authorized user (Sean or delegate) reviews + accepts.
 * Activity Spine event JOB_COST_RECONCILED logged with payload {kID,
 * gross_profit, margin_pct_actual, margin_variance_pct, gold_dataset_entry_id?}."
 *
 * Cascade per §16.2: "On JOB_COST_RECONCILED event firing (per §15.4),
 * Closeout writes a Gold Dataset entry." This route fires JOB_COST_RECONCILED
 * AND calls writeGoldDatasetEntryInTx in the same Drizzle transaction. The
 * gold-dataset writer emits GOLD_DATASET_ENTRY_WRITTEN (with write_target=
 * 'PRODUCTION' for production engagements, 'TEST_BLOCKED' for test projects
 * per §16.4). Both emissions commit/roll-back atomically.
 *
 * Permission: spec §24 names 'closeout.reconciliation_accept' (CO-C3 — Sean
 * or delegate). NEEDS_VERIFICATION: that permission is not yet in the
 * permission registry at lib/permissions.ts. Falling back to 'project:edit'
 * for now per BAN-311 PR 2 dispatch; follow-up registry packet should add
 * the dedicated permission.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';
import { writeGoldDatasetEntryInTx } from '@/lib/closeout/gold-dataset';

const ROUTE_PATH = '/api/closeout/engagements/[id]/reconciliation/accept';

interface AcceptBody {
  gross_profit?: string | number;
  margin_pct_actual?: string | number;
  margin_variance_pct?: string | number;
  // Optional pre-resolved kID stamp (some engagements carry a separate kID
  // tag — the route doesn't fetch it from elsewhere; caller passes it if
  // available). Spec §15.4 lists kID in the JOB_COST_RECONCILED payload.
  kid?: string;
  // Optional Gold Dataset payload bag (forwarded to writeGoldDatasetEntryInTx).
  gold_dataset?: {
    project_classification?: Record<string, unknown>;
    bid_data?: Record<string, unknown>;
    actual_data?: Record<string, unknown>;
    schedule_data?: Record<string, unknown>;
    punch_list_data?: Record<string, unknown>;
    warranty_data?: Record<string, unknown>;
    inter_island_logistics_data?: Record<string, unknown>;
  };
}

function isFiniteNumeric(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const n = Number(v);
  return Number.isFinite(n);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  // NEEDS_VERIFICATION: spec §24 names a dedicated permission
  // 'closeout.reconciliation_accept' (CO-C3) for this route. Not yet in
  // lib/permissions.ts registry; falling back to 'project:edit'.
  const gate = await passAiaApiGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id: engagementId } = await context.params;

  let body: AcceptBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isFiniteNumeric(body.gross_profit)) {
    return NextResponse.json({ error: 'gross_profit is required (numeric)' }, { status: 400 });
  }
  if (!isFiniteNumeric(body.margin_pct_actual)) {
    return NextResponse.json({ error: 'margin_pct_actual is required (numeric)' }, { status: 400 });
  }
  if (!isFiniteNumeric(body.margin_variance_pct)) {
    return NextResponse.json({ error: 'margin_variance_pct is required (numeric)' }, { status: 400 });
  }

  const eng = await db
    .select({ engagement_id: engagements.engagement_id, is_test_project: engagements.is_test_project })
    .from(engagements)
    .where(and(eq(engagements.engagement_id, engagementId), eq(engagements.tenant_id, gate.tenantId)))
    .limit(1);
  if (eng.length === 0) {
    return NextResponse.json({ error: `engagement ${engagementId} not found` }, { status: 404 });
  }
  const isTestProject = eng[0].is_test_project === true;

  try {
    const result = await db.transaction(async (tx) => {
      // Cascade per §16.2: write gold dataset first so JOB_COST_RECONCILED
      // payload can reference gold_dataset_entry_id.
      const gold = await writeGoldDatasetEntryInTx(tx, {
        tenantId: gate.tenantId,
        engagementId,
        isTestProject,
        actorEmail: gate.actorEmail,
        projectClassification: body.gold_dataset?.project_classification,
        bidData: body.gold_dataset?.bid_data,
        actualData: body.gold_dataset?.actual_data,
        scheduleData: body.gold_dataset?.schedule_data,
        punchListData: body.gold_dataset?.punch_list_data,
        warrantyData: body.gold_dataset?.warranty_data,
        interIslandLogisticsData: body.gold_dataset?.inter_island_logistics_data,
      });

      const reconEmit = await emitActivitySpineEvent(tx, {
        event_type: 'JOB_COST_RECONCILED',
        entity_type: 'project',
        entity_id: engagementId,
        aia_entity_kind: 'engagement',
        aia_entity_id: engagementId,
        kid: body.kid ?? null,
        test_data: isTestProject,
        metadata: {
          kid: body.kid ?? null,
          gross_profit: String(body.gross_profit),
          margin_pct_actual: String(body.margin_pct_actual),
          margin_variance_pct: String(body.margin_variance_pct),
          gold_dataset_entry_id: gold.gold_entry_id,
          actor: gate.actorEmail,
          closeout_entity_kind: 'engagement',
          closeout_entity_id: engagementId,
        },
      });

      return {
        reconciliation_event_id: reconEmit.event_id,
        gold_dataset_event_id: gold.event_id,
        gold_dataset_write_target: gold.write_target,
        gold_dataset_entry_id: gold.gold_entry_id,
      };
    });

    return NextResponse.json({ ok: true, engagement_id: engagementId, ...result });
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
