/**
 * lib/dispatch-schedule.ts — Canonical Dispatch_Schedule A:S row builder and validator.
 *
 * BAN-42 Gate 1: foundation layer only.
 * Existing route writers are NOT migrated here yet.
 * Do not call Google Sheets from this module.
 */

import { DISPATCH_COL_COUNT } from './schemas';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DispatchScheduleInput {
  slot_id: string;
  date: string;
  kID: string;
  project_name?: string;
  island?: string;
  men_required?: string | number;
  hours_estimated?: string | number;
  assigned_crew?: string | string[];
  created_by?: string;
  status?: string;
  confirmations?: string;
  work_type?: string;
  notes?: string;
  start_time?: string;
  end_time?: string;
  step_ids?: string | string[];
  hours_actual?: string | number;
  last_modified?: string;
  focus_step_ids?: string | string[];
}

export interface DispatchRowValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Serializers ──────────────────────────────────────────────────────────────

// Matches the comma-space join convention used across dispatch route writers.
function serializeList(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

// Matches serializeFocusStepIds in superintendent-scheduling/route.ts.
// Output is always a JSON array string, e.g. '["IS-1","IS-2"]' or '[]'.
function serializeFocusStepIds(value: string | string[] | undefined): string {
  if (value === undefined || value === null) return '[]';
  if (Array.isArray(value)) {
    return JSON.stringify(value.map(String).map(s => s.trim()).filter(Boolean));
  }
  const raw = String(value).trim();
  if (!raw) return '[]';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.map(String).map(s => s.trim()).filter(Boolean));
    }
  } catch {
    // fall through to comma-split
  }
  return JSON.stringify(raw.split(',').map(s => s.trim()).filter(Boolean));
}

// ─── Row builder ─────────────────────────────────────────────────────────────

/**
 * Build a canonical Dispatch_Schedule row in A:S / 19-column order.
 * Throws if slot_id, date, or kID are absent.
 * Optional fields default to ''.
 * Does not call Google Sheets.
 */
export function buildDispatchRow(input: DispatchScheduleInput): string[] {
  if (input.slot_id === undefined || input.slot_id === null) {
    throw new Error('slot_id is required');
  }
  if (input.date === undefined || input.date === null) {
    throw new Error('date is required');
  }
  if (input.kID === undefined || input.kID === null) {
    throw new Error('kID is required');
  }

  const now = new Date().toISOString();

  return [
    input.slot_id,                                                           // 0  A
    input.date,                                                              // 1  B
    input.kID,                                                               // 2  C
    input.project_name ?? '',                                                // 3  D
    input.island ?? '',                                                      // 4  E
    input.men_required !== undefined ? String(input.men_required) : '',      // 5  F
    input.hours_estimated !== undefined ? String(input.hours_estimated) : '', // 6  G
    serializeList(input.assigned_crew),                                      // 7  H
    input.created_by ?? '',                                                  // 8  I
    input.status ?? '',                                                      // 9  J
    input.confirmations ?? '',                                               // 10 K
    input.work_type ?? '',                                                   // 11 L
    input.notes ?? '',                                                       // 12 M
    input.start_time ?? '',                                                  // 13 N
    input.end_time ?? '',                                                    // 14 O
    serializeList(input.step_ids),                                           // 15 P
    input.hours_actual !== undefined ? String(input.hours_actual) : '',      // 16 Q
    input.last_modified ?? now,                                              // 17 R
    serializeFocusStepIds(input.focus_step_ids),                             // 18 S
  ];
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate that a row array conforms to the canonical A:S / 19-column contract.
 * Returns { valid, errors } — does not throw.
 */
export function validateDispatchRow(row: unknown[]): DispatchRowValidationResult {
  const errors: string[] = [];

  if (row.length !== DISPATCH_COL_COUNT) {
    errors.push(
      `Row must have exactly ${DISPATCH_COL_COUNT} columns; got ${row.length}`
    );
  }

  const str = (v: unknown): string =>
    typeof v === 'string' ? v.trim() : String(v ?? '').trim();

  if (!str(row[0])) errors.push('slot_id (col 0 / A) is required');
  if (!str(row[1])) errors.push('date (col 1 / B) is required');
  if (row[2] === undefined || row[2] === null) {
    errors.push('kID (col 2 / C) is required');
  }

  return { valid: errors.length === 0, errors };
}
