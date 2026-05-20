/**
 * BAN-374 P5 — lib/schedule/resource-conflicts.ts unit tests.
 *
 * Covers the date-range overlap matrix, the allocation-sum threshold, and
 * the pure ConflictReport builder.  detectConflicts itself hits the DB
 * (covered by the route test); here we exercise the deterministic helpers.
 */

import {
  buildConflictReport,
  isoToMs,
  rangesOverlap,
  type ConflictingAssignment,
} from '@/lib/schedule/resource-conflicts';

function asg(over: Partial<ConflictingAssignment> & { allocation_percent: number; task_planned_start: string | null; task_planned_end: string | null; }): ConflictingAssignment {
  return {
    task_resource_id: 'r-1',
    schedule_task_id: 't-1',
    task_name: 'Other task',
    role_on_task: 'crew',
    ...over,
  };
}

describe('isoToMs', () => {
  it('parses YYYY-MM-DD into a millisecond timestamp', () => {
    expect(isoToMs('2026-06-15')).toBe(Date.UTC(2026, 5, 15));
  });

  it('returns null for malformed or null input', () => {
    expect(isoToMs(null)).toBeNull();
    expect(isoToMs('garbage')).toBeNull();
    expect(isoToMs('2026-06')).toBeNull();
  });
});

describe('rangesOverlap', () => {
  it('returns false when any endpoint is missing', () => {
    expect(rangesOverlap(null, '2026-06-10', '2026-06-05', '2026-06-15')).toBe(false);
    expect(rangesOverlap('2026-06-01', null, '2026-06-05', '2026-06-15')).toBe(false);
  });

  it('returns false for disjoint ranges', () => {
    expect(rangesOverlap('2026-06-01', '2026-06-04', '2026-06-05', '2026-06-10')).toBe(false);
  });

  it('returns true for partial overlap', () => {
    expect(rangesOverlap('2026-06-01', '2026-06-07', '2026-06-05', '2026-06-12')).toBe(true);
  });

  it('returns true for fully contained ranges', () => {
    expect(rangesOverlap('2026-06-01', '2026-06-30', '2026-06-05', '2026-06-10')).toBe(true);
  });

  it('treats touching boundaries as overlap (inclusive)', () => {
    expect(rangesOverlap('2026-06-01', '2026-06-05', '2026-06-05', '2026-06-10')).toBe(true);
  });
});

describe('buildConflictReport', () => {
  it('reports no conflicts when the candidate range does not overlap any other', () => {
    const report = buildConflictReport(
      '2026-06-01',
      '2026-06-05',
      100,
      [asg({ allocation_percent: 100, task_planned_start: '2026-07-01', task_planned_end: '2026-07-10' })],
    );
    expect(report.conflicts).toHaveLength(0);
    expect(report.hasDateOverlap).toBe(false);
    expect(report.exceedsAllocation).toBe(false);
    expect(report.allocationSum).toBe(100);
  });

  it('reports overlap but no allocation breach when the sum stays at/below 100', () => {
    const report = buildConflictReport(
      '2026-06-01',
      '2026-06-10',
      50,
      [asg({ allocation_percent: 50, task_planned_start: '2026-06-05', task_planned_end: '2026-06-12' })],
    );
    expect(report.conflicts).toHaveLength(1);
    expect(report.hasDateOverlap).toBe(true);
    expect(report.exceedsAllocation).toBe(false);
    expect(report.allocationSum).toBe(100);
  });

  it('flags an allocation breach when overlapping sums exceed 100%', () => {
    const report = buildConflictReport(
      '2026-06-01',
      '2026-06-10',
      75,
      [asg({ allocation_percent: 50, task_planned_start: '2026-06-05', task_planned_end: '2026-06-12' })],
    );
    expect(report.conflicts).toHaveLength(1);
    expect(report.hasDateOverlap).toBe(true);
    expect(report.exceedsAllocation).toBe(true);
    expect(report.allocationSum).toBe(125);
  });

  it('ignores non-overlapping rows even when they would otherwise blow the budget', () => {
    const report = buildConflictReport(
      '2026-06-01',
      '2026-06-10',
      100,
      [
        asg({ task_resource_id: 'a', allocation_percent: 100, task_planned_start: '2026-07-01', task_planned_end: '2026-07-10' }),
        asg({ task_resource_id: 'b', allocation_percent: 100, task_planned_start: '2026-08-01', task_planned_end: '2026-08-10' }),
      ],
    );
    expect(report.conflicts).toHaveLength(0);
    expect(report.exceedsAllocation).toBe(false);
    expect(report.allocationSum).toBe(100);
  });

  it('sums multiple overlapping rows correctly', () => {
    const report = buildConflictReport(
      '2026-06-01',
      '2026-06-30',
      40,
      [
        asg({ task_resource_id: 'a', allocation_percent: 30, task_planned_start: '2026-06-10', task_planned_end: '2026-06-20' }),
        asg({ task_resource_id: 'b', allocation_percent: 50, task_planned_start: '2026-06-15', task_planned_end: '2026-06-25' }),
      ],
    );
    expect(report.conflicts).toHaveLength(2);
    expect(report.allocationSum).toBe(120);
    expect(report.exceedsAllocation).toBe(true);
  });

  it('caller is responsible for excluding the candidate itself — helper trusts the input', () => {
    // Soft-removed rows would be filtered upstream (in detectConflicts);
    // buildConflictReport treats whatever it is given as authoritative.
    const report = buildConflictReport(
      '2026-06-01',
      '2026-06-10',
      80,
      [], // upstream stripped soft-removed and self rows
    );
    expect(report.conflicts).toHaveLength(0);
    expect(report.exceedsAllocation).toBe(false);
  });
});
