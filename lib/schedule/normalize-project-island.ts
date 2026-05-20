/**
 * BAN-374 P6 — Project-island normalizer.
 *
 * The runtime engagement surface used by ProjectsPanel is `/api/projects`,
 * which today reads from the legacy `Core_Entities` Google Sheet and returns
 * `island` as a marketing-style capitalized string ("Oahu", "Maui", "Hawaii",
 * ...).  ScheduleTab + ScheduleGanttView consume `ScheduleTaskIsland`, whose
 * canonical enum values are lowercase ('maui','oahu','big_island', etc.) and
 * use 'big_island' for the island of Hawaiʻi (the sheet uses the unqualified
 * marketing name 'Hawaii').
 *
 * This helper is the bridge at the ProjectsPanel call site, mapping the sheet
 * string to the schedule enum and falling through to 'unknown' for anything
 * the schedule overlays cannot use.  Drift: once `engagements.island` (or a
 * sites join exposing the canonical island_code enum) is surfaced through the
 * API layer, this mapper can be removed; ScheduleTab already accepts the enum
 * directly.
 */

import type { ScheduleTaskIsland } from '@/db';

const KNOWN: Record<string, ScheduleTaskIsland> = {
  oahu: 'oahu',
  maui: 'maui',
  kauai: 'kauai',
  // Sheet uses 'Hawaii' (marketing name); schedule enum uses 'big_island'.
  hawaii: 'big_island',
  big_island: 'big_island',
  lanai: 'lanai',
  molokai: 'molokai',
};

export function normalizeProjectIsland(raw: string | null | undefined): ScheduleTaskIsland {
  if (raw == null) return 'unknown';
  const key = raw.trim().toLowerCase();
  if (!key) return 'unknown';
  return KNOWN[key] ?? 'unknown';
}
