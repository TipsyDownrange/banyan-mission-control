/**
 * Canonical kID normalizer — single source of truth for all ID comparisons.
 *
 * Problem: IDs are stored inconsistently across the system:
 *   - Install_Plans.Job_ID = "WO-26-8289"
 *   - Dispatch_Schedule.kID = "26-8289"  (no prefix)
 *   - Core_Entities.kID = "PRJ-24-0010"
 *   - Service_Work_Orders.wo_number = "26-8289"
 *   - Service_Work_Orders.wo_id = "WO-26-8289"
 *   - Dispatch_Schedule (service-prefixed) = "SVC-WO-26-8289" or "SVC-26-8289"
 *
 * Solution: strip ALL known prefixes before comparing.
 * "WO-26-8289" === "26-8289" === "SVC-WO-26-8289" === "SVC-26-8289"
 */

export function normalizeKID(kid: string): string {
  if (!kid) return '';
  return kid
    .replace(/^SVC-/i, '')
    .replace(/^WO-/i, '')
    .replace(/^PRJ-/i, '')
    .replace(/^SRV-/i, '')
    .trim();
}

export function kidsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeKID(a) === normalizeKID(b);
}

/** Check if a kID matches any in a set (after normalization) */
export function kidInSet(kid: string, set: Set<string>): boolean {
  const norm = normalizeKID(kid);
  if (set.has(kid)) return true;
  if (set.has(norm)) return true;
  // Also check if any set member normalizes to the same value
  for (const member of set) {
    if (normalizeKID(member) === norm) return true;
  }
  return false;
}
