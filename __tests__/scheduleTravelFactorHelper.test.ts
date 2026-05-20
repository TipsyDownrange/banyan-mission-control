/**
 * BAN-374 P4 — lib/schedule/hawaii-overlays.ts helper tests.
 *
 * Covers the same-island / outer-island matrix, tenant config override,
 * the duration-day diff with planned_start/end fallback, and the tooltip
 * formatter.
 */

import {
  applyTravelFactorToTasks,
  computeTravelFactor,
  DEFAULT_TRAVEL_FACTOR_MULTIPLIER,
  formatTravelTooltip,
} from '@/lib/schedule/hawaii-overlays';

describe('computeTravelFactor', () => {
  it('returns 1.0 when project and task are on the same island', () => {
    expect(computeTravelFactor('oahu', 'oahu')).toBe(1.0);
    expect(computeTravelFactor('maui', 'maui')).toBe(1.0);
  });

  it('returns 1.0 when projectIsland is null/unknown (no home base known)', () => {
    expect(computeTravelFactor(null, 'oahu')).toBe(1.0);
    expect(computeTravelFactor('unknown', 'oahu')).toBe(1.0);
  });

  it('returns 1.0 when task_island is null/unknown', () => {
    expect(computeTravelFactor('oahu', null)).toBe(1.0);
    expect(computeTravelFactor('oahu', 'unknown')).toBe(1.0);
  });

  it('returns the default multiplier (1.15) for outer-island work', () => {
    expect(computeTravelFactor('oahu', 'maui')).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
    expect(computeTravelFactor('oahu', 'kauai')).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
    expect(computeTravelFactor('oahu', 'big_island')).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
    expect(computeTravelFactor('oahu', 'molokai')).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
    expect(computeTravelFactor('oahu', 'lanai')).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
  });

  it('honors a tenant-config override when valid (>=1, finite)', () => {
    expect(computeTravelFactor('oahu', 'maui', { travel_factor_multiplier: 1.25 })).toBe(1.25);
    expect(computeTravelFactor('oahu', 'kauai', { travel_factor_multiplier: 1.50 })).toBe(1.50);
  });

  it('ignores tenant-config override when < 1 or non-finite', () => {
    expect(computeTravelFactor('oahu', 'maui', { travel_factor_multiplier: 0.5 })).toBe(
      DEFAULT_TRAVEL_FACTOR_MULTIPLIER,
    );
    expect(computeTravelFactor('oahu', 'maui', { travel_factor_multiplier: Number.NaN })).toBe(
      DEFAULT_TRAVEL_FACTOR_MULTIPLIER,
    );
  });
});

describe('applyTravelFactorToTasks', () => {
  const baseTasks = [
    {
      id: 't1',
      planned_start: '2026-06-01',
      planned_end: '2026-06-05', // 5 inclusive days
      planned_duration_days: 5,
      task_island: 'oahu' as const,
    },
    {
      id: 't2',
      planned_start: '2026-06-01',
      planned_end: '2026-06-05',
      planned_duration_days: 5,
      task_island: 'maui' as const,
    },
    {
      id: 't3',
      planned_start: '2026-06-10',
      planned_end: '2026-06-19', // 10 inclusive days, no planned_duration_days
      planned_duration_days: null,
      task_island: 'kauai' as const,
    },
    {
      id: 't4',
      planned_start: null,
      planned_end: null,
      planned_duration_days: null,
      task_island: null,
    },
  ];

  it('returns 1.0 factor for same-island tasks with original durations', () => {
    const out = applyTravelFactorToTasks(baseTasks, 'oahu');
    const t1 = out.find((e) => e.task.id === 't1')!;
    expect(t1.travelFactor).toBe(1.0);
    expect(t1.isOuterIsland).toBe(false);
    expect(t1.baseDurationDays).toBe(5);
    expect(t1.adjustedDurationDays).toBe(5);
  });

  it('inflates outer-island task durations by the travel factor', () => {
    const out = applyTravelFactorToTasks(baseTasks, 'oahu');
    const t2 = out.find((e) => e.task.id === 't2')!;
    expect(t2.travelFactor).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
    expect(t2.isOuterIsland).toBe(true);
    expect(t2.baseDurationDays).toBe(5);
    expect(t2.adjustedDurationDays).toBe(5.75);
  });

  it('falls back to planned_start/end diff when planned_duration_days is null', () => {
    const out = applyTravelFactorToTasks(baseTasks, 'oahu');
    const t3 = out.find((e) => e.task.id === 't3')!;
    expect(t3.baseDurationDays).toBe(10);
    expect(t3.travelFactor).toBe(DEFAULT_TRAVEL_FACTOR_MULTIPLIER);
    expect(t3.adjustedDurationDays).toBe(11.5);
  });

  it('returns null adjusted duration when neither planned_duration_days nor dates exist', () => {
    const out = applyTravelFactorToTasks(baseTasks, 'oahu');
    const t4 = out.find((e) => e.task.id === 't4')!;
    expect(t4.baseDurationDays).toBeNull();
    expect(t4.adjustedDurationDays).toBeNull();
  });

  it('uses tenant override multiplier across the matrix', () => {
    const out = applyTravelFactorToTasks(baseTasks, 'oahu', { travel_factor_multiplier: 1.30 });
    const t2 = out.find((e) => e.task.id === 't2')!;
    expect(t2.travelFactor).toBe(1.30);
    expect(t2.adjustedDurationDays).toBe(6.5);
  });
});

describe('formatTravelTooltip', () => {
  it('returns a human-readable explanation for outer-island tasks', () => {
    const enriched = {
      task: { id: 't2' },
      baseDurationDays: 5,
      travelFactor: 1.15,
      adjustedDurationDays: 5.75,
      isOuterIsland: true,
    };
    expect(formatTravelTooltip(enriched)).toBe('Base duration 5d × 1.15 travel factor = 5.75d (6d shown)');
  });

  it('returns null for same-island tasks', () => {
    const enriched = {
      task: { id: 't1' },
      baseDurationDays: 5,
      travelFactor: 1.0,
      adjustedDurationDays: 5,
      isOuterIsland: false,
    };
    expect(formatTravelTooltip(enriched)).toBeNull();
  });

  it('returns null when no base duration is available', () => {
    const enriched = {
      task: { id: 't4' },
      baseDurationDays: null,
      travelFactor: 1.15,
      adjustedDurationDays: null,
      isOuterIsland: true,
    };
    expect(formatTravelTooltip(enriched)).toBeNull();
  });
});
