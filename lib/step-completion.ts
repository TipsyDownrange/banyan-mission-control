const COMPLETE_STATUSES = new Set(['installed', 'complete', 'completed']);

/**
 * Returns true when a raw Step_Completions row represents a completed step.
 *
 * Field App writes Status = INSTALLED to col G (index 6).
 * Legacy MC rows write a numeric percent_complete to the same column.
 * MC-extended rows may also carry a status in col J (index 9).
 *
 * A row is complete when:
 * - col G (index 6) normalizes to INSTALLED / COMPLETE / COMPLETED, OR
 * - col G (index 6) parses as a number >= 100, OR
 * - col J (index 9) normalizes to INSTALLED / COMPLETE / COMPLETED.
 */
export function isCompletionRowComplete(row: string[]): boolean {
  const col6 = (row[6] || '').trim();
  if (COMPLETE_STATUSES.has(col6.toLowerCase())) return true;
  const pct = parseFloat(col6);
  if (Number.isFinite(pct) && pct >= 100) return true;
  const col9 = (row[9] || '').trim();
  if (COMPLETE_STATUSES.has(col9.toLowerCase())) return true;
  return false;
}
