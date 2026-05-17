/**
 * BAN-311 Pass 3b.2 PR 2 — Gold Dataset write helper.
 *
 * Closeout v1.1 §16.2 + §16.4 — emits GOLD_DATASET_ENTRY_WRITTEN with
 * write_target = 'PRODUCTION' (and INSERTs a gold_dataset_entries row) for
 * production engagements, or write_target = 'TEST_BLOCKED' (no row written;
 * audit-only event) for test projects.
 *
 * Used by:
 *   - POST /api/closeout/gold-dataset-entries  (direct route — route 7)
 *   - POST /api/closeout/engagements/[id]/reconciliation/accept  (cascade
 *     from route 6 per §15.4 + §16.2: "On JOB_COST_RECONCILED firing,
 *     Closeout writes a Gold Dataset entry").
 *
 * emit-helper contract: event-contract.ts validates that
 * GOLD_DATASET_ENTRY_WRITTEN payload carries write_target ∈ {PRODUCTION,
 * TEST_BLOCKED} (see lib/activity-spine/event-contract.ts:102-107).
 */

import { gold_dataset_entries } from '@/db';
import {
  emitActivitySpineEvent,
  type ActivitySpineTx,
} from '@/lib/activity-spine/emit';

export interface WriteGoldDatasetEntryInput {
  tenantId: string;
  engagementId: string;
  isTestProject: boolean;
  actorEmail: string;
  // Closeout §16.2 — 7 JSONB data columns. Caller is responsible for
  // shape; this helper just persists the JSONB blobs.
  projectClassification?: Record<string, unknown>;
  bidData?: Record<string, unknown>;
  actualData?: Record<string, unknown>;
  scheduleData?: Record<string, unknown>;
  punchListData?: Record<string, unknown>;
  warrantyData?: Record<string, unknown>;
  interIslandLogisticsData?: Record<string, unknown>;
}

export interface WriteGoldDatasetEntryResult {
  event_id: string;
  gold_entry_id: string | null;  // null when write_target = TEST_BLOCKED
  write_target: 'PRODUCTION' | 'TEST_BLOCKED';
}

/**
 * In-tx Gold Dataset writer. Caller owns the surrounding tx so the row write
 * + event emission + any sibling writes (e.g., the JOB_COST_RECONCILED
 * cascade) commit/roll-back atomically.
 *
 * For TEST_BLOCKED (engagement is_test_project=true): NO row is inserted;
 * only the audit event fires with write_target='TEST_BLOCKED'. Per §16.4.
 */
export async function writeGoldDatasetEntryInTx(
  tx: ActivitySpineTx,
  input: WriteGoldDatasetEntryInput,
): Promise<WriteGoldDatasetEntryResult> {
  let goldEntryId: string | null = null;
  const writeTarget: 'PRODUCTION' | 'TEST_BLOCKED' = input.isTestProject ? 'TEST_BLOCKED' : 'PRODUCTION';

  if (!input.isTestProject) {
    const inserted = await tx
      .insert(gold_dataset_entries)
      .values({
        tenant_id: input.tenantId,
        engagement_id: input.engagementId,
        project_classification: input.projectClassification ?? {},
        bid_data: input.bidData ?? {},
        actual_data: input.actualData ?? {},
        schedule_data: input.scheduleData ?? {},
        punch_list_data: input.punchListData ?? {},
        warranty_data: input.warrantyData ?? {},
        inter_island_logistics_data: input.interIslandLogisticsData ?? {},
        test_project: false,
      })
      .returning({ gold_entry_id: gold_dataset_entries.gold_entry_id });
    goldEntryId = inserted[0].gold_entry_id;
  }

  const emit = await emitActivitySpineEvent(tx, {
    event_type: 'GOLD_DATASET_ENTRY_WRITTEN',
    entity_type: 'project',
    entity_id: input.engagementId,
    aia_entity_kind: 'engagement',
    aia_entity_id: input.engagementId,
    test_data: input.isTestProject,
    metadata: {
      write_target: writeTarget,
      is_test_project: input.isTestProject,
      gold_entry_id: goldEntryId,
      actor: input.actorEmail,
      closeout_entity_kind: 'engagement',
      closeout_entity_id: input.engagementId,
    },
  });

  return {
    event_id: emit.event_id,
    gold_entry_id: goldEntryId,
    write_target: writeTarget,
  };
}
