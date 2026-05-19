/**
 * BanyanOS Permission System v2 — env-driven role → permission map.
 *
 * Introduced for War Room as the canonical prototype.  Future dispatches
 * migrate KB, contacts, organizations, suggestions, daily-report,
 * work-breakdown, and PM documents to this system.
 *
 * Coexistence note: the legacy `lib/permissions.ts` continues to serve the
 * WO / finance / project routes and its `Permission` union ('wo:create' etc).
 * The new system here uses SCREAMING_SNAKE_CASE constants and a separate
 * `BanyanPermission` type so the two systems don't entangle while migration
 * is in flight.  When all peer api-gate.ts modules have migrated, the legacy
 * file becomes a candidate for retirement.
 *
 * Runtime override: `ROLE_PERMISSIONS_JSON` env var (mirrors Field App's
 * `ROLE_MAP_JSON` pattern).  Shape:
 *
 *   {
 *     "gm":            ["WARROOM_VIEW", "WARROOM_TASK_WRITE"],
 *     "business_admin":["WARROOM_VIEW", "WARROOM_TASK_WRITE"],
 *     "super_admin":   ["WARROOM_VIEW", "WARROOM_TASK_WRITE"]
 *   }
 *
 * Merge semantics: any role present in the env JSON overrides that role's
 * default; roles absent from the env JSON keep their defaults below.  This
 * means an operator can grant a new role access without re-listing the
 * existing PR #188 leadership defaults.
 *
 * Safe fallback: a missing, empty, or malformed env var falls back to
 * `ROLE_PERMISSIONS_DEFAULTS`.  Parsing is memoized; never throws at runtime.
 */

export type BanyanPermission =
  | 'WARROOM_VIEW'
  | 'WARROOM_TASK_WRITE';

// Future permissions to add when migrating peer modules:
//   KNOWLEDGE_VIEW, KNOWLEDGE_WRITE, KNOWLEDGE_TRIAGE, KNOWLEDGE_SETUP
//   CONTACTS_VIEW, CONTACTS_WRITE
//   ORGANIZATIONS_VIEW, ORGANIZATIONS_WRITE
//   SUGGESTIONS_VIEW, SUGGESTIONS_WRITE
//   DAILY_REPORT_VIEW, DAILY_REPORT_WRITE
//   WORK_BREAKDOWN_VIEW, WORK_BREAKDOWN_WRITE
//   DOCUMENTS_VIEW, DOCUMENTS_WRITE

export const ALL_PERMISSIONS: readonly BanyanPermission[] = [
  'WARROOM_VIEW',
  'WARROOM_TASK_WRITE',
] as const;

/**
 * Defaults preserve PR #188 War Room behavior: only `business_admin` and
 * `super_admin` hold `WARROOM_VIEW` / `WARROOM_TASK_WRITE`.  Every other role
 * known to lib/auth.ts is listed explicitly with `[]` so the map is exhaustive
 * and a typo in a role name doesn't silently grant access.
 */
export const ROLE_PERMISSIONS_DEFAULTS: Readonly<Record<string, readonly BanyanPermission[]>> = Object.freeze({
  business_admin: Object.freeze(['WARROOM_VIEW', 'WARROOM_TASK_WRITE'] as BanyanPermission[]),
  super_admin:    Object.freeze(['WARROOM_VIEW', 'WARROOM_TASK_WRITE'] as BanyanPermission[]),
  owner:      Object.freeze([] as BanyanPermission[]),
  gm:         Object.freeze([] as BanyanPermission[]),
  pm:         Object.freeze([] as BanyanPermission[]),
  service_pm: Object.freeze([] as BanyanPermission[]),
  super:      Object.freeze([] as BanyanPermission[]),
  estimator:  Object.freeze([] as BanyanPermission[]),
  admin_mgr:  Object.freeze([] as BanyanPermission[]),
  admin:      Object.freeze([] as BanyanPermission[]),
  field:      Object.freeze([] as BanyanPermission[]),
  pm_track:   Object.freeze([] as BanyanPermission[]),
  sales:      Object.freeze([] as BanyanPermission[]),
  catalog_admin: Object.freeze([] as BanyanPermission[]),
  none:       Object.freeze([] as BanyanPermission[]),
});

let cachedMap: Readonly<Record<string, readonly BanyanPermission[]>> | null = null;

/**
 * Parse a raw `ROLE_PERMISSIONS_JSON` value.  Pure / synchronous / total — any
 * shape that isn't a plain object of role→array-of-known-permissions falls
 * back to defaults.  Unknown permissions inside an array are dropped; the
 * role keeps the valid ones.  Roles present in the env JSON override that
 * role's default; absent roles keep their defaults.
 */
export function parseRolePermissions(
  raw: string | undefined | null,
): Readonly<Record<string, readonly BanyanPermission[]>> {
  if (!raw || !raw.trim()) return ROLE_PERMISSIONS_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ROLE_PERMISSIONS_DEFAULTS;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ROLE_PERMISSIONS_DEFAULTS;
  }
  const allowed = new Set<string>(ALL_PERMISSIONS);
  const merged: Record<string, readonly BanyanPermission[]> = { ...ROLE_PERMISSIONS_DEFAULTS };
  for (const [role, perms] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof role !== 'string') continue;
    if (!Array.isArray(perms)) continue;
    const validPerms: BanyanPermission[] = [];
    for (const p of perms) {
      if (typeof p === 'string' && allowed.has(p)) {
        validPerms.push(p as BanyanPermission);
      }
    }
    merged[role] = Object.freeze(validPerms);
  }
  return Object.freeze(merged);
}

/**
 * Memoized accessor — reads `process.env.ROLE_PERMISSIONS_JSON` once per
 * process and caches the parsed map.  Tests must call
 * `__resetRolePermissionsForTest` between cases that mutate the env var.
 */
export function getRolePermissions(): Readonly<Record<string, readonly BanyanPermission[]>> {
  if (cachedMap === null) {
    cachedMap = parseRolePermissions(process.env.ROLE_PERMISSIONS_JSON);
  }
  return cachedMap;
}

/** Test-only: clear the memoized parse so tests can mutate `process.env`. */
export function __resetRolePermissionsForTest(): void {
  cachedMap = null;
}
