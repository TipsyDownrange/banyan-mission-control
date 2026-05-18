/**
 * BAN-341 PM-V1.0-B — RFI per-project sequential numbering.
 *
 * Per PM Trunk v1.0 §6.2, RFIs use a 3-digit per-project sequence appended
 * to the project kID:
 *
 *   PRJ-YY-NNNN-RFI-NNN
 *     e.g. PRJ-26-0001-RFI-001, PRJ-26-0001-RFI-002, ...
 *
 * The numerator is computed at create time via SQL:
 *   SELECT COALESCE(MAX(CAST(SUBSTRING(rfi_number FROM 'RFI-(\d+)$') AS INT)), 0) + 1
 *   FROM rfis WHERE engagement_id = $1
 */

export const RFI_NUMBER_RE = /-RFI-(\d{3})$/;

/**
 * Assemble the rfi_number from project kID + per-project sequence.
 */
export function assembleRfiNumber(projectKid: string, sequence: number): string {
  const kid = (projectKid ?? '').trim();
  if (!kid) throw new Error('assembleRfiNumber: projectKid is required');
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('assembleRfiNumber: sequence must be a positive integer');
  }
  if (sequence > 999) {
    throw new Error('assembleRfiNumber: per-project RFI sequence exceeds 999');
  }
  const padded = String(sequence).padStart(3, '0');
  return `${kid}-RFI-${padded}`;
}

/**
 * Extract the per-project sequence from an rfi_number string.
 * Returns null if the string doesn't match the canonical format.
 */
export function parseRfiSequence(rfiNumber: string): number | null {
  const m = (rfiNumber ?? '').match(RFI_NUMBER_RE);
  if (!m) return null;
  return parseInt(m[1], 10);
}
