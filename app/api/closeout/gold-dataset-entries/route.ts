/**
 * BAN-311 Pass 3b.2 PR 2 — POST /api/closeout/gold-dataset-entries
 *
 * Closeout v1.1 §20.9 — Direct route for writing a Gold Dataset entry
 * (independent of the reconciliation cascade in §15.4/§16.2).
 *
 * Behavior:
 *   - Engagement is_test_project=true → no gold_dataset_entries row is
 *     written; GOLD_DATASET_ENTRY_WRITTEN fires with write_target=
 *     'TEST_BLOCKED' (audit-only). 200 with body indicating blocked. §16.4
 *   - Engagement is_test_project=false → row INSERTED;
 *     GOLD_DATASET_ENTRY_WRITTEN fires with write_target='PRODUCTION'. 201.
 *
 * event-contract.ts requires write_target ∈ {PRODUCTION, TEST_BLOCKED} —
 * enforced inside writeGoldDatasetEntryInTx via the canonical emit helper.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, engagements } from '@/db';
import { passAiaApiGate } from '@/lib/aia/api-gate';
import { ActivitySpineEmitError } from '@/lib/activity-spine/emit';
import { writeGoldDatasetEntryInTx } from '@/lib/closeout/gold-dataset';

const ROUTE_PATH = '/api/closeout/gold-dataset-entries';

interface CreateBody {
  engagement_id?: string;
  project_classification?: Record<string, unknown>;
  bid_data?: Record<string, unknown>;
  actual_data?: Record<string, unknown>;
  schedule_data?: Record<string, unknown>;
  punch_list_data?: Record<string, unknown>;
  warranty_data?: Record<string, unknown>;
  inter_island_logistics_data?: Record<string, unknown>;
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
  if (!engagementId) {
    return NextResponse.json({ error: 'engagement_id is required' }, { status: 400 });
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
    const result = await db.transaction(async (tx) =>
      writeGoldDatasetEntryInTx(tx, {
        tenantId: gate.tenantId,
        engagementId,
        isTestProject,
        actorEmail: gate.actorEmail,
        projectClassification: body.project_classification,
        bidData: body.bid_data,
        actualData: body.actual_data,
        scheduleData: body.schedule_data,
        punchListData: body.punch_list_data,
        warrantyData: body.warranty_data,
        interIslandLogisticsData: body.inter_island_logistics_data,
      }),
    );

    const status = result.write_target === 'TEST_BLOCKED' ? 200 : 201;
    return NextResponse.json(
      {
        ok: true,
        engagement_id: engagementId,
        write_target: result.write_target,
        gold_entry_id: result.gold_entry_id,
        event_id: result.event_id,
      },
      { status },
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
