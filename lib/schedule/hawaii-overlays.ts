/**
 * BAN-374 Scheduling Spine P4 — Hawaii overlay helpers.
 *
 * Spec: April 4 Schedule + Procurement + T&M spec (Drive
 * `1vWA6zwxI2tQ9us8OrtuHuUohe0ZeyASt`) §A2 + §C — outer-island protocol.
 *
 * Crews working off their home island lose time to inter-island travel
 * (flight + cargo barge, vehicle on/off-load, hotel logistics).  The
 * default multiplier is 1.15× (15% inflation) on top of the base task
 * duration; tenants can override via `tenant_config.travel_factor_multiplier`.
 *
 * Same-island tasks (or tasks with no island flag) get 1.0× — no change.
 */

import type { ScheduleTaskIsland } from '@/db';

export const DEFAULT_TRAVEL_FACTOR_MULTIPLIER = 1.15;

export interface TenantOverlayConfig {
  travel_factor_multiplier?: number;
}

export interface TravelEnrichedTask<T> {
  task: T;
  baseDurationDays: number | null;
  travelFactor: number;
  adjustedDurationDays: number | null;
  isOuterIsland: boolean;
}

/**
 * Compute the duration multiplier for a task based on the project's home
 * island vs. the island the task is being executed on.
 *
 *   - same island (or task has no island flag) → 1.0
 *   - outer island                              → tenantConfig.travel_factor_multiplier
 *                                                 ?? DEFAULT_TRAVEL_FACTOR_MULTIPLIER
 *
 * Unknown / null `projectIsland` is treated as "no home island known", so we
 * cannot prove the task is outer-island; we return 1.0 to avoid inflating
 * durations on tenants who haven't classified their projects yet.
 */
export function computeTravelFactor(
  projectIsland: ScheduleTaskIsland | null | undefined,
  taskIsland: ScheduleTaskIsland | null | undefined,
  tenantConfig?: TenantOverlayConfig,
): number {
  if (!projectIsland || projectIsland === 'unknown') return 1.0;
  if (!taskIsland || taskIsland === 'unknown') return 1.0;
  if (taskIsland === projectIsland) return 1.0;
  const override = tenantConfig?.travel_factor_multiplier;
  if (typeof override === 'number' && override >= 1 && Number.isFinite(override)) {
    return override;
  }
  return DEFAULT_TRAVEL_FACTOR_MULTIPLIER;
}

function dayDiff(startISO: string | null, endISO: string | null): number | null {
  if (!startISO || !endISO) return null;
  const sm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startISO);
  const em = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endISO);
  if (!sm || !em) return null;
  const s = Date.UTC(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
  const e = Date.UTC(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  const ms = e - s;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 86400000) + 1; // inclusive day count
}

export interface TaskWithIsland {
  planned_start: string | null;
  planned_end: string | null;
  planned_duration_days: number | null;
  task_island?: ScheduleTaskIsland | null;
}

/**
 * Apply the travel factor to a list of tasks and surface the enriched
 * payload alongside the original task reference.  The Gantt view uses this
 * to (a) inflate the rendered duration and (b) tag bars with a chevron
 * pattern + "+travel" pill.
 *
 * Pure helper — no DB, no React, no IO.  The route layer may also call
 * this to cache `duration_with_travel_factor` at write time.
 */
export function applyTravelFactorToTasks<T extends TaskWithIsland>(
  tasks: T[],
  projectIsland: ScheduleTaskIsland | null | undefined,
  tenantConfig?: TenantOverlayConfig,
): TravelEnrichedTask<T>[] {
  return tasks.map((task) => {
    const factor = computeTravelFactor(projectIsland, task.task_island, tenantConfig);
    const base = task.planned_duration_days ?? dayDiff(task.planned_start, task.planned_end);
    const adjusted = base == null ? null : roundHalfUp(base * factor, 2);
    return {
      task,
      baseDurationDays: base,
      travelFactor: factor,
      adjustedDurationDays: adjusted,
      isOuterIsland: factor > 1.0,
    };
  });
}

function roundHalfUp(value: number, decimals: number): number {
  const m = 10 ** decimals;
  return Math.round(value * m) / m;
}

/**
 * Format the tooltip string surfaced on the Gantt bar:
 *   "Base duration 5d × 1.15 travel factor = 5.75d (6d shown)"
 *
 * Returns null for tasks with no base duration (e.g. milestone-style tasks
 * where planned_start === planned_end and the user hasn't entered a span).
 */
export function formatTravelTooltip(enriched: TravelEnrichedTask<unknown>): string | null {
  if (enriched.baseDurationDays == null) return null;
  if (!enriched.isOuterIsland) return null;
  const shown = Math.ceil(enriched.adjustedDurationDays ?? enriched.baseDurationDays);
  return `Base duration ${enriched.baseDurationDays}d × ${enriched.travelFactor} travel factor = ${enriched.adjustedDurationDays}d (${shown}d shown)`;
}
