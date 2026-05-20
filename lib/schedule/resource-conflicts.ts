/**
 * BAN-374 P5 — Resource conflict detection.
 *
 * When an operator tries to add a user to a task, we want to surface
 * (but not block) any overlapping active assignments where:
 *   - the same user is already on another active (not-soft-removed)
 *     assignment, AND
 *   - the candidate task's planned date range overlaps the existing
 *     task's planned date range, AND
 *   - the sum of allocation_percent across the overlapping window
 *     would exceed 100.
 *
 * Returned as warnings; the dialog requires the operator to acknowledge
 * (with a free-text note) before persisting the assignment.  The helper
 * is pure logic over rows fetched by the caller — DB I/O happens in the
 * route layer.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db, schedule_task_resources, schedule_tasks } from '@/db';

export interface ConflictingAssignment {
  task_resource_id: string;
  schedule_task_id: string;
  task_name: string;
  task_planned_start: string | null;
  task_planned_end: string | null;
  allocation_percent: number;
  role_on_task: string | null;
}

export interface ConflictReport {
  conflicts: ConflictingAssignment[];
  allocationSum: number;
  hasDateOverlap: boolean;
  exceedsAllocation: boolean;
}

export function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function rangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  const aS = isoToMs(aStart);
  const aE = isoToMs(aEnd);
  const bS = isoToMs(bStart);
  const bE = isoToMs(bEnd);
  if (aS == null || aE == null || bS == null || bE == null) return false;
  return aS <= bE && bS <= aE;
}

/**
 * Build a ConflictReport from already-fetched active assignments for a user.
 * Caller is responsible for excluding any assignments on the candidate task
 * itself (we'd never report self-overlap).
 */
export function buildConflictReport(
  candidateStart: string | null,
  candidateEnd: string | null,
  candidateAllocation: number,
  otherActive: ConflictingAssignment[],
): ConflictReport {
  const overlapping = otherActive.filter((a) =>
    rangesOverlap(candidateStart, candidateEnd, a.task_planned_start, a.task_planned_end),
  );
  const allocationSum =
    overlapping.reduce((acc, a) => acc + a.allocation_percent, 0) + candidateAllocation;
  return {
    conflicts: overlapping,
    allocationSum,
    hasDateOverlap: overlapping.length > 0,
    exceedsAllocation: allocationSum > 100,
  };
}

/**
 * Full conflict check that hits the DB.  Used from the POST/PATCH routes.
 *
 * Looks up every active (removed_at IS NULL) assignment for the user in
 * the tenant, EXCLUDING any active assignment whose schedule_task_id
 * matches `excludeTaskId` (used by PATCH to ignore the row being edited).
 */
export async function detectConflicts(
  tenantId: string,
  userId: string,
  candidateStart: string | null,
  candidateEnd: string | null,
  candidateAllocation: number,
  excludeTaskId: string | null,
): Promise<ConflictReport> {
  const rows = await db
    .select({
      task_resource_id: schedule_task_resources.task_resource_id,
      schedule_task_id: schedule_task_resources.schedule_task_id,
      allocation_percent: schedule_task_resources.allocation_percent,
      role_on_task: schedule_task_resources.role_on_task,
      task_name: schedule_tasks.name,
      task_planned_start: schedule_tasks.planned_start,
      task_planned_end: schedule_tasks.planned_end,
    })
    .from(schedule_task_resources)
    .innerJoin(schedule_tasks, eq(schedule_task_resources.schedule_task_id, schedule_tasks.id))
    .where(
      and(
        eq(schedule_task_resources.tenant_id, tenantId),
        eq(schedule_task_resources.user_id, userId),
        isNull(schedule_task_resources.removed_at),
      ),
    );

  const other: ConflictingAssignment[] = rows
    .filter((r) => r.schedule_task_id !== excludeTaskId)
    .map((r) => ({
      task_resource_id: r.task_resource_id,
      schedule_task_id: r.schedule_task_id,
      task_name: r.task_name,
      task_planned_start: r.task_planned_start as string | null,
      task_planned_end: r.task_planned_end as string | null,
      allocation_percent: r.allocation_percent,
      role_on_task: r.role_on_task,
    }));

  return buildConflictReport(candidateStart, candidateEnd, candidateAllocation, other);
}
