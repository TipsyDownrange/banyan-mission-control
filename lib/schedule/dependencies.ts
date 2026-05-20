/**
 * BAN-374 Scheduling Spine — dependency DAG cycle detection.
 *
 * Pure function: given the existing directed edges and a proposed new edge
 * (predecessor → successor), returns true when adding the edge would
 * introduce a cycle.  Used by POST /api/schedule/dependencies to reject
 * 400 before insert.
 *
 * Self-loops are caught by the schedule_dependencies_not_self_loop CHECK
 * constraint, but this function also rejects them defensively so callers
 * can return a friendlier 400 rather than a DB-level 500.
 */

export interface Edge {
  predecessor_task_id: string;
  successor_task_id: string;
}

/**
 * Returns true when inserting (predecessor → successor) would create a
 * cycle in the DAG formed by `existing` ∪ {new edge}.  Walks forward from
 * `successor` and returns true if we can reach `predecessor`.
 */
export function wouldCreateCycle(
  existing: ReadonlyArray<Edge>,
  predecessor: string,
  successor: string,
): boolean {
  if (predecessor === successor) return true;

  const forward = new Map<string, string[]>();
  for (const e of existing) {
    const arr = forward.get(e.predecessor_task_id) ?? [];
    arr.push(e.successor_task_id);
    forward.set(e.predecessor_task_id, arr);
  }

  const stack: string[] = [successor];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === predecessor) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    const next = forward.get(node);
    if (next) {
      for (const n of next) stack.push(n);
    }
  }
  return false;
}
