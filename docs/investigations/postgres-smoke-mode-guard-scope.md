# MC Postgres Read-Only Smoke Mode Guard Scope — BAN-300 / BAN-307

**Repo:** `TipsyDownrange/banyan-mission-control`
**Base SHA:** `a5b28448a765b0cb37fe825c1a84923d2f8c9d3e`
**Branch:** `claude/ban-307-mc-write-read-inventory`
**Date:** 2026-05-17
**Linear:** [BAN-307](https://linear.app/banyan-os/issue/BAN-307), companion to [BAN-300](https://linear.app/banyan-os/issue/BAN-300)

Documentation only. No app/, lib/, components/, db/ source modified.

## Summary

The "Postgres read-only smoke mode" pattern is **scoped to the Service Work Orders surface only**. It is a controlled migration shim for the staging Postgres shadow read (BAN-297), not a general read-only mode. The guard:

- has a **single banner string** (no drift between routes),
- is **production-safe by construction**: the predicate requires `VERCEL_TARGET_ENV === 'staging'`, so production can never enter smoke mode regardless of `WO_POSTGRES_READ_ENABLED`,
- is **applied to 5 service-WO mutation routes** but **misses `/api/service/quote`** — flagged below as inconsistent guard coverage.

## 1. Guard definition

**File:** `lib/service-work-orders/postgres-read-guard.ts:1-21`

```ts
import { NextResponse } from 'next/server';
import { shouldReadServiceWorkOrdersFromPostgres } from '@/lib/service-work-orders/postgres-read';

export const WO_POSTGRES_READ_ONLY_SMOKE_CODE = 'WO_POSTGRES_READ_ONLY_SMOKE';

export function isWOStagingPostgresReadOnlySmokeMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return shouldReadServiceWorkOrdersFromPostgres(env);
}

export function blockWOStagingPostgresReadOnlyMutation(routeName: string) {
  if (!isWOStagingPostgresReadOnlySmokeMode()) return null;

  return NextResponse.json(
    {
      error: 'Staging is currently in Work Order Postgres read-only smoke mode. This route is blocked to prevent writing Sheets data that the Postgres-backed staging UI would not read back.',
      code: WO_POSTGRES_READ_ONLY_SMOKE,
      route: routeName,
    },
    { status: 409 },
  );
}
```

- **Banner text (the canonical "Postgres read-only smoke mode" string):** `Staging is currently in Work Order Postgres read-only smoke mode. This route is blocked to prevent writing Sheets data that the Postgres-backed staging UI would not read back.` — defined exactly once at `lib/service-work-orders/postgres-read-guard.ts:15`. No drift between routes.
- **HTTP status when blocked:** `409 Conflict`.
- **Response envelope:** `{ error, code: 'WO_POSTGRES_READ_ONLY_SMOKE', route }`.

## 2. Toggle mechanism

**File:** `lib/service-work-orders/postgres-read.ts:89-91`

```ts
export function shouldReadServiceWorkOrdersFromPostgres(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WO_POSTGRES_READ_ENABLED === 'true' && isStaging();
}
```

- **Two-condition AND**: requires `WO_POSTGRES_READ_ENABLED === 'true'` (string literal) **and** `isStaging()` truthy.
- `isStaging()` at `lib/env.ts:5-7`: `process.env.VERCEL_TARGET_ENV === 'staging'`. Set by Vercel only on the staging deployment (`AGENTS.md` line 5-7 of `lib/env.ts` comments: "Production never sets this to 'staging', so production cannot match this check").
- **Config sanity check:** `assertPostgresReadConfig` at `lib/service-work-orders/postgres-read.ts:93-98` throws if `WO_POSTGRES_READ_ENABLED=true` but `DATABASE_URL` is missing — refuses silent fallback.
- **No `.env.example`, `.env.production`, or committed env defaults** found in the repo. `vercel.json` (only top-level Vercel config) is 8 lines and sets only a cron schedule for `/api/cron/qbo-refresh`; it does **not** set `WO_POSTGRES_READ_ENABLED`. Toggle is exclusively a Vercel-side environment variable.

### Default state in production vs staging

| Environment | `VERCEL_TARGET_ENV` | `WO_POSTGRES_READ_ENABLED` | Smoke mode active? |
|---|---|---|---|
| Production | not `'staging'` | irrelevant (gated by isStaging) | **No** — guaranteed off |
| Staging — default | `'staging'` | not set | **No** |
| Staging — opt-in | `'staging'` | `'true'` | **Yes** |

Production never enters smoke mode regardless of operator action on the `WO_POSTGRES_READ_ENABLED` flag. This is by design (BAN-297 reference).

## 3. Banner / flag occurrences (grep-complete)

`grep -rn "Postgres read-only smoke mode" --include="*.ts" --include="*.tsx"`:

| File:line | Context |
|---|---|
| `lib/service-work-orders/postgres-read-guard.ts:15` | Banner string definition (sole authoritative copy) |
| `__tests__/serviceWoListSearch.test.ts` (assertion site) | Test asserts the `WO_POSTGRES_READ_ONLY_SMOKE` code is surfaced |
| `__tests__/serviceWOCreateRoute.test.ts:293-315` | Test: blocks staging WO creation while shadow read is enabled |
| `__tests__/serviceUpdateInternalAuth.test.ts:182-204` | Test: blocks update writes in staging shadow read after auth succeeds |

`grep -rn "WO_POSTGRES_READ_ENABLED\|isWOStagingPostgresReadOnlySmokeMode\|blockWOStagingPostgresReadOnlyMutation\|shouldReadServiceWorkOrdersFromPostgres"`:

| Site | File:line | Role |
|---|---|---|
| Predicate definition | `lib/service-work-orders/postgres-read.ts:89` | `shouldReadServiceWorkOrdersFromPostgres` |
| Config assert | `lib/service-work-orders/postgres-read.ts:93` | `assertPostgresReadConfig` |
| Guard alias | `lib/service-work-orders/postgres-read-guard.ts:6` | `isWOStagingPostgresReadOnlySmokeMode` |
| Guard impl | `lib/service-work-orders/postgres-read-guard.ts:10` | `blockWOStagingPostgresReadOnlyMutation` |
| Read switch (route) | `app/api/service/route.ts:131` | `shouldReadServiceWorkOrdersFromPostgres()` selects Postgres vs Sheets |
| Read switch (route) | `app/api/service/wo-list/route.ts` (around :57-100) | Same selector for the dispatch picker |
| Write guard import | `app/api/service/dispatch/route.ts:15` | `blockWOStagingPostgresReadOnlyMutation` |
| Write guard import | `app/api/service/estimate/route.ts:6` | same |
| Write guard import | `app/api/service/folder-link/route.ts:13` | same |
| Write guard import | `app/api/service/proposal/route.ts:17` | same |
| Write guard import | `app/api/service/update/route.ts:23` | same |
| Write guard call | `app/api/service/dispatch/route.ts:62` | guard short-circuit at top of POST |
| Write guard call | `app/api/service/estimate/route.ts:98` | guard short-circuit |
| Write guard call | `app/api/service/folder-link/route.ts:21` | guard short-circuit |
| Write guard call | `app/api/service/proposal/route.ts:212` | guard short-circuit |
| Write guard call | `app/api/service/update/route.ts:141` | guard short-circuit (after auth) |

## 4. Routes carrying the guard

All 5 are **service work-order mutation** endpoints. None outside that surface use the guard.

| Route | HTTP | Guard import | Guard call | Behavior when triggered |
|---|---|---|---|---|
| `/api/service/dispatch` | POST | `app/api/service/dispatch/route.ts:15` | `:62` | 409 + `WO_POSTGRES_READ_ONLY_SMOKE`, no Sheets/Drive call |
| `/api/service/estimate` | POST | `app/api/service/estimate/route.ts:6` | `:98` | 409 + `WO_POSTGRES_READ_ONLY_SMOKE`, no Sheets call |
| `/api/service/folder-link` | POST | `app/api/service/folder-link/route.ts:13` | `:21` | 409 + `WO_POSTGRES_READ_ONLY_SMOKE` |
| `/api/service/proposal` | POST | `app/api/service/proposal/route.ts:17` | `:212` | 409 + `WO_POSTGRES_READ_ONLY_SMOKE` |
| `/api/service/update` | PATCH | `app/api/service/update/route.ts:23` | `:141` | 409 + `WO_POSTGRES_READ_ONLY_SMOKE`, fires **after** auth (intentional) |

Test coverage at `__tests__/serviceWOCreateRoute.test.ts:293-315` and `__tests__/serviceUpdateInternalAuth.test.ts:182-204` confirms 409 + code + zero downstream side-effect.

## 5. Consistency check — ungated mutation routes on the service WO surface

Cross-referencing against the BAN-307 MC route inventory, the service WO surface contains additional mutation endpoints that **do not** import the guard:

| Route | HTTP | Imports `postgres-read-guard`? | Notes |
|---|---|---|---|
| `/api/service/quote` | POST | **No** | Submits quote overrides; downstream writes plausible. **Flagged: guard missing.** |
| `/api/service/quote/validate` | POST | No | Pure validator — returns shape decision; appears side-effect free. No guard needed. |
| `/api/service/intake` | POST | No | Anthropic-API intake parser → returns JSON; no Sheet/Postgres write inline. No guard needed. |
| `/api/service/estimate-pdf` | POST | No | PDF render; Sheets read only. No guard needed. |
| `/api/service/dispatch-pdf` | POST | No | PDF render; Sheets read only. No guard needed. |
| `/api/service/customers` | various | No | Customer-only surface; not a WO mutation. Out of guard scope as defined. |
| `/api/service/wo-list` | GET | No (uses read-side switch instead) | Read endpoint; switches source via `shouldReadServiceWorkOrdersFromPostgres()`. Correct pattern. |
| `/api/service` | GET | No (uses read-side switch) | Read endpoint; same. Correct pattern. |

**The single inconsistency is `/api/service/quote` (POST) — needs the guard if it persists data on the WO surface.** This route should be reviewed in BAN-300 follow-up to confirm whether it writes WO-side state and, if so, add `blockWOStagingPostgresReadOnlyMutation('/api/service/quote')` at the top of its POST handler. (Recommended action; not in scope for this BAN-307 investigation.)

No banner-text drift detected. The single source of truth is `lib/service-work-orders/postgres-read-guard.ts:15`.

## 6. Scope of "Postgres read-only smoke mode" is narrow

This pattern **does not** affect MC's many other write surfaces (engagements, projects, organizations, estimating, PM, QBO, war-room, work-records, etc.). Those routes are not gated by `WO_POSTGRES_READ_ENABLED` and continue to write normally in staging when the flag is on. That is consistent with the BAN-297 design — the smoke-mode shim exists to validate the **service WO** Postgres shadow read specifically, not as a global "freeze MC writes" switch.

## 7. STOP-condition assessment

| STOP condition | Triggered? | Notes |
|---|---|---|
| Guard pattern inconsistent (some routes blocked, others not, no toggle) | **Partial** — one WO-surface mutation route (`/api/service/quote`) does not import the guard. Banner string is consistent across guard sites. Surfacing as a "consistency review for BAN-300", not a hard STOP — the guard intent is per-route opt-in, but `/api/service/quote` looks like it should be opted in. |
| Production-tenant data in staging Postgres reads | **No** — `isStaging()` predicate blocks production from ever entering smoke mode. |
| Banner text varies between routes | **No** — single literal at `postgres-read-guard.ts:15`; all routes use the same constant. |
| Write destination outside taxonomy | **N/A** to this doc (covered in Output 2). |

## 8. Recommendation

**Keep the guard pattern as-is, with one small follow-up:**

1. **Confirm and (if appropriate) add the guard to `/api/service/quote` POST.** Investigate whether this route persists WO-side state in staging when smoke mode is active. If yes, add `blockWOStagingPostgresReadOnlyMutation('/api/service/quote')` at the top of POST. Should be a 2-line change with a matching test.
2. **Treat the pattern as a migration shim, not a permanent feature.** The guard exists to support BAN-297-style read-side migrations. Once Service WO writes themselves move to Postgres (or once the shadow read is validated and removed), this guard and the `WO_POSTGRES_READ_ENABLED` env var can be deleted in a single sweep. A short header comment at the top of `lib/service-work-orders/postgres-read-guard.ts` documenting this intent would prevent the shim from being treated as load-bearing in future feature work.
3. **Do not generalize the pattern** to MC-wide write blocking. The current narrow scope (WO-surface mutations only) is correct — broadening it would require a different design (e.g., per-tenant or per-entity feature flag service).
4. **Do not remove the guard** before the shadow-read smoke validation is complete. Removing prematurely would let staging write Sheets data that the Postgres-backed staging UI cannot read back — the exact failure mode the guard exists to prevent.

## Acceptance summary

- Every occurrence of the banner text and its controlling flag enumerated with `file:line`.
- Toggle mechanism documented (two-condition AND on `WO_POSTGRES_READ_ENABLED` + `VERCEL_TARGET_ENV`).
- Production vs staging default-state table provided.
- Recommendation: **Keep** with a per-route consistency fix for `/api/service/quote`.
- Cross-referenced with the MC write-path inventory (Output 2) to confirm guard coverage gaps.
