/**
 * lib/schemas.ts — Canonical column schemas for sheet-backed tables.
 *
 * These are the single source of truth for column order and names.
 * Any route reading from these tables should validate headers against these lists.
 * Use validateHeaders() to check before processing rows.
 */

// ─── Dispatch_Schedule ────────────────────────────────────────────────────────
// Updated 2026-04-26: added focus_step_ids (col 18) as optional GC-D063 focus metadata.
export const DISPATCH_SCHEDULE_SCHEMA = [
  'slot_id',        // 0  A
  'date',           // 1  B
  'kID',            // 2  C
  'project_name',   // 3  D
  'island',         // 4  E
  'men_required',   // 5  F
  'hours_estimated',// 6  G
  'assigned_crew',  // 7  H
  'created_by',     // 8  I
  'status',         // 9  J
  'confirmations',  // 10 K
  'work_type',      // 11 L
  'notes',          // 12 M
  'start_time',     // 13 N
  'end_time',       // 14 O
  'step_ids',       // 15 P
  'hours_actual',   // 16 Q
  'last_modified',  // 17 R
  'focus_step_ids', // 18 S
] as const;

export type DispatchScheduleCol = typeof DISPATCH_SCHEDULE_SCHEMA[number];
export const DISPATCH_COL_IDX = Object.fromEntries(
  DISPATCH_SCHEDULE_SCHEMA.map((name, i) => [name, i])
) as Record<DispatchScheduleCol, number>;
export const DISPATCH_COL_COUNT = DISPATCH_SCHEDULE_SCHEMA.length; // 19

// ─── Install_Plans ────────────────────────────────────────────────────────────
export const INSTALL_PLANS_SCHEMA = [
  'Install_Plan_ID', // 0
  'Job_ID',          // 1
  'System_Type',     // 2
  'Assembly_ID',     // 3
  'Location',        // 4
  'Estimated_Total_Hours', // 5
  'Estimated_Qty',   // 6
] as const;

// ─── Install_Steps ────────────────────────────────────────────────────────────
export const INSTALL_STEPS_SCHEMA = [
  'Install_Step_ID',      // 0
  'Install_Plan_ID',      // 1
  'Step_Seq',             // 2
  'Step_Name',            // 3
  'Allotted_Hours',       // 4
  'Acceptance_Criteria',  // 5
  'Required_Photo_YN',    // 6
  'Notes',                // 7
  'Category',             // 8
  'Planned_Start_Date',   // 9
  'Planned_End_Date',     // 10
  'Assigned_Crew',        // 11
  'Predecessor_Step_ID',  // 12
  'bid_hours',            // 13 N
  'planned_hours',        // 14 O
  'actual_hours',         // 15 P
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

export interface SchemaValidationResult {
  valid: boolean;
  missing: string[];
  extra: string[];
  message?: string;
}

/**
 * Validate that a header row contains all required columns.
 * Extra columns are allowed (sheets can have trailing cols).
 * Returns { valid, missing, extra }.
 */
export function validateHeaders(
  actualHeaders: string[],
  requiredSchema: readonly string[],
  tableName: string
): SchemaValidationResult {
  const actual = new Set(actualHeaders.map(h => h.trim()));
  const missing = requiredSchema.filter(col => !actual.has(col));
  const extra = actualHeaders.filter(h => !requiredSchema.includes(h.trim() as never));

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      extra,
      message: `${tableName} schema mismatch: missing columns [${missing.join(', ')}]`,
    };
  }

  return { valid: true, missing: [], extra };
}
