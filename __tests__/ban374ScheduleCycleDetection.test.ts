/**
 * BAN-374 Scheduling Spine — Cycle detection unit tests.
 *
 * Pure function tests: no DB, no permissions, no env.  Exercises the DAG
 * walker used by POST /api/schedule/dependencies before insert.
 */

import { wouldCreateCycle, type Edge } from '@/lib/schedule/dependencies';

describe('wouldCreateCycle', () => {
  it('rejects self-loops', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });

  it('allows an isolated new edge', () => {
    expect(wouldCreateCycle([], 'a', 'b')).toBe(false);
  });

  it('allows extending a linear chain forward', () => {
    const existing: Edge[] = [
      { predecessor_task_id: 'a', successor_task_id: 'b' },
      { predecessor_task_id: 'b', successor_task_id: 'c' },
    ];
    expect(wouldCreateCycle(existing, 'c', 'd')).toBe(false);
  });

  it('detects a back-edge that would close a 2-cycle', () => {
    const existing: Edge[] = [
      { predecessor_task_id: 'a', successor_task_id: 'b' },
    ];
    expect(wouldCreateCycle(existing, 'b', 'a')).toBe(true);
  });

  it('detects a back-edge that would close a longer cycle', () => {
    const existing: Edge[] = [
      { predecessor_task_id: 'a', successor_task_id: 'b' },
      { predecessor_task_id: 'b', successor_task_id: 'c' },
      { predecessor_task_id: 'c', successor_task_id: 'd' },
    ];
    expect(wouldCreateCycle(existing, 'd', 'a')).toBe(true);
  });

  it('handles diamond DAGs without false positives', () => {
    const existing: Edge[] = [
      { predecessor_task_id: 'a', successor_task_id: 'b' },
      { predecessor_task_id: 'a', successor_task_id: 'c' },
      { predecessor_task_id: 'b', successor_task_id: 'd' },
      { predecessor_task_id: 'c', successor_task_id: 'd' },
    ];
    expect(wouldCreateCycle(existing, 'd', 'e')).toBe(false);
  });

  it('detects a cycle through a diamond', () => {
    const existing: Edge[] = [
      { predecessor_task_id: 'a', successor_task_id: 'b' },
      { predecessor_task_id: 'b', successor_task_id: 'c' },
      { predecessor_task_id: 'a', successor_task_id: 'd' },
    ];
    expect(wouldCreateCycle(existing, 'c', 'a')).toBe(true);
  });

  it('does not loop forever on existing cycles in the input', () => {
    const existing: Edge[] = [
      { predecessor_task_id: 'a', successor_task_id: 'b' },
      { predecessor_task_id: 'b', successor_task_id: 'a' },
    ];
    expect(wouldCreateCycle(existing, 'c', 'd')).toBe(false);
  });
});
