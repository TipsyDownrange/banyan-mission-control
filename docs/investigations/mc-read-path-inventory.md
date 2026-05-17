# MC Read-Path Inventory — BAN-307

**Repo:** `TipsyDownrange/banyan-mission-control`
**Base SHA:** `a5b28448a765b0cb37fe825c1a84923d2f8c9d3e`
**Branch:** `claude/ban-307-mc-write-read-inventory`
**Date:** 2026-05-17
**Linear:** [BAN-307](https://linear.app/banyan-os/issue/BAN-307)

Documentation only. No app/, lib/, components/, db/ source modified.

## Methodology

For the four canonical entities named in BAN-307 — `field_events`, `engagements`, `service_work_orders` (a.k.a. service work orders), `projects`, `users` — every API route and UI surface (`app/**/page.tsx`, `app/layout.tsx`, components under `components/`) that **reads** them was catalogued. Writes are out of scope here (see Output 2 — `mc-write-path-inventory.md`).

Data sources discovered:

- **Sheets** (`googleapis` `sheets.spreadsheets.values.get`), via the canonical tabs `Field_Events_V1`, `Service_Work_Orders`, `Core_Entities`, `Users_Roles`, `Sites`, `Contacts`, plus product-specific tabs (`Bids`, `GC Quotes`, etc).
- **Postgres** (via `query`/`queryOne` from `lib/work-records/db.ts` and `db.select(...)` Drizzle calls).
- **Postgres shadow** (`loadServiceWorkOrdersFromPostgresShadow` and `loadWorkOrderPickerFromPostgresShadow` in `lib/service-work-orders/postgres-read.ts:200-226`), gated by `shouldReadServiceWorkOrdersFromPostgres()` at `:89-91`.
- **External read** (e.g. Linear API for war-room, Smartsheet for bids/finance) — noted where relevant but not part of the four canonical entities.

## Section 1 — Read inventory table

| Route or surface | Reads from (Sheets / Postgres / both) | Reconciliation logic? | File:line |
|---|---|---|---|
| **API — field_events** | | | |
| `GET /api/events` | Sheets (`Field_Events_V1`) | No | `app/api/events/route.ts` (reads `Field_Events_V1` via `sheets.spreadsheets.values.get`) |
| `GET /api/events/[eventId]` | Sheets (`Field_Events_V1`) | No | `app/api/events/[eventId]/route.ts` (single-row fetch) |
| `GET /api/notify/field-issue` | Sheets (`Service_Work_Orders` + `Users_Roles`) | No | `app/api/notify/field-issue/route.ts:55, 63` |
| `GET /api/notify/crew-impact` | Sheets (`Service_Work_Orders` + `Users_Roles`) | No | `app/api/notify/crew-impact/route.ts:49, 55` |
| `GET /api/daily-report/pdf` | Sheets (`Field_Events_V1` + `Users_Roles` + `Core_Entities` + `Service_Work_Orders`) | No | `app/api/daily-report/pdf/route.ts:26, 34, 44, 60, 69, 175` |
| `GET /api/admin/backfill-user-names` | Sheets (`Users_Roles` + `Field_Events_V1`) | Backfill diff log (not real-time reconciliation) | `app/api/admin/backfill-user-names/route.ts:33, 45` |
| `GET /api/field-issue/pdf` | Sheets (`Users_Roles` + `Field_Events_V1`) | No | `app/api/field-issue/pdf/route.ts:29, 180` |
| `GET /api/projects` | Sheets (`Core_Entities` + `Field_Events_V1` + `Users_Roles`) | Sheets `Users_Roles` falls back to a static map if read fails — not a Sheets-vs-Postgres reconciliation but a Sheets resilience fallback | `app/api/projects/route.ts:33, 34, 40` |
| **API — service_work_orders** | | | |
| `GET /api/service` | **Both** — Sheets `Service_Work_Orders` by default; Postgres `service_work_orders` shadow when `WO_POSTGRES_READ_ENABLED=true && isStaging()` | Source tagged in response (`source: 'postgres_shadow'` vs Sheets); no row-count or field-level diff logged | `app/api/service/route.ts:131, 133, 140` |
| `GET /api/service/wo-list` | **Both** — Sheets `Service_Work_Orders` by default; Postgres `service_work_orders` shadow when flag is on | Same — source tag only, no reconciliation log | `app/api/service/wo-list/route.ts:57, 58` |
| `GET /api/service/route` (customers branch) | Sheets (`Customers`) | No | `app/api/service/route.ts:154-159` |
| `GET /api/notify/field-issue` (WO lookup) | Sheets (`Service_Work_Orders`) | No | `app/api/notify/field-issue/route.ts:55` |
| `GET /api/notify/crew-impact` (WO lookup) | Sheets (`Service_Work_Orders`) | No | `app/api/notify/crew-impact/route.ts:49` |
| `GET /api/superintendent-scheduling` | Sheets (`Service_Work_Orders` + `Users_Roles`) | No | `app/api/superintendent-scheduling/route.ts:274, 275, 761` |
| `GET /api/organizations` | Sheets (`Service_Work_Orders` for org→WO rollup) | No | `app/api/organizations/route.ts:101` |
| `GET /api/organizations/[orgId]` | Sheets (`Service_Work_Orders` + `Contacts` + `Core_Entities`) | No | `app/api/organizations/[orgId]/route.ts:30, 32, 33` |
| `GET /api/qbo/sync-all` (sync source) | Sheets (`Service_Work_Orders`) | No | `app/api/qbo/sync-all/route.ts:33` |
| `GET /api/qbo/sync-invoices` | Sheets (`Service_Work_Orders`) | No | `app/api/qbo/sync-invoices/route.ts:84` |
| **API — engagements** | | | |
| `GET /api/engagements` | **Postgres only** — `engagements` joined to `organizations`, `sites`, `users` | No (no Sheets fallback) | `app/api/engagements/route.ts:18-28` |
| `GET /api/engagements/options` | Postgres only | No | `app/api/engagements/options/route.ts:3` (imports `query` from `lib/work-records/db`) |
| **API — projects** | | | |
| `GET /api/projects` | Sheets (`Core_Entities`) | n/a | `app/api/projects/route.ts:33` |
| `GET /api/kai` (project context) | Sheets (`Core_Entities`) — conditional on `backendSheetId` env | n/a | `app/api/kai/route.ts:43` |
| `GET /api/daily-report/pdf` (project lookup) | Sheets (`Core_Entities`) | n/a | `app/api/daily-report/pdf/route.ts:26` |
| `GET /api/organizations/[orgId]` (sites/projects) | Sheets (`Core_Entities`) | n/a | `app/api/organizations/[orgId]/route.ts:33` |
| **API — users** | | | |
| `GET /api/users` | Sheets (`Users_Roles`) — `@kulaglass.com` session required | n/a | `app/api/users/route.ts:46-49` |
| `GET /api/notify/field-issue` (user lookup) | Sheets (`Users_Roles`) | n/a | `app/api/notify/field-issue/route.ts:63` |
| `GET /api/notify/crew-impact` (user lookup) | Sheets (`Users_Roles`) | n/a | `app/api/notify/crew-impact/route.ts:55` |
| `GET /api/superintendent-scheduling` (user lookup) | Sheets (`Users_Roles`) | n/a | `app/api/superintendent-scheduling/route.ts:274` |
| `GET /api/field-issue/pdf` (user lookup) | Sheets (`Users_Roles`) | n/a | `app/api/field-issue/pdf/route.ts:29` |
| `GET /api/daily-report/pdf` (user lookup, 3 sites) | Sheets (`Users_Roles`) | n/a | `app/api/daily-report/pdf/route.ts:34, 44, 69` |
| `GET /api/admin/permissions` (user list) | Sheets (`Users_Roles`) | n/a | `app/api/admin/permissions/route.ts:206` |
| **UI surfaces — pages** | | | |
| `app/page.tsx` (home dashboard) | Calls `/api/projects` (Sheets) and embeds the ServicePanel which calls `/api/service` (Sheets-or-shadow) | Inherits the API's source tag | `app/page.tsx:97`, `:253` (ServicePanel mount) |
| `app/work-orders/page.tsx` | Calls `/api/service` (Sheets-or-shadow) | Inherits source tag | `app/work-orders/page.tsx` (loads via ServicePanel chain) |
| `app/work-orders/[kID]/page.tsx` | Calls `/api/service` then filters by kID | Inherits source tag | `app/work-orders/[kID]/page.tsx` |
| `app/war-room/page.tsx` | Reads Linear API via `lib/war-room/data.ts` — **not** Sheets/Postgres for canonical entities | n/a | `app/war-room/page.tsx`; `lib/war-room/data.ts` |
| `app/admin/permissions/page.tsx` | Calls `/api/admin/permissions` (Sheets `Users_Roles`) | n/a | `app/admin/permissions/page.tsx` |
| `app/admin/health/page.tsx` | Calls `/api/health-check` + war-room source-health | n/a | `app/admin/health/page.tsx` |
| `app/operations/step-library/page.tsx` | Calls `/api/step-templates` (Sheets) | n/a | `app/operations/step-library/page.tsx` |
| `app/login/page.tsx` | Auth handler | n/a | `app/login/page.tsx` |
| **UI surfaces — components** | | | |
| `components/ServicePanel.tsx` | `/api/service` (Sheets-or-shadow) | Surfaces `source` tag | `components/ServicePanel.tsx:247` |
| `components/DispatchBoard.tsx` | `/api/projects` + `/api/service` + `/api/service/wo-list` | Inherits API source tags | `components/DispatchBoard.tsx:135, 136, 523` |
| `components/WODetailPanel.tsx` | `/api/service/customers`, `/api/service/folder-link`, `/api/events` | Inherits | `components/WODetailPanel.tsx:306, 339, 748` |
| `components/WOEstimatePanel.tsx` | `/api/service/estimate` (Sheets), `/api/service/estimate-pdf` (PDF) | Inherits | `components/WOEstimatePanel.tsx:361, 475, 991, 1020` |
| `components/QuoteBuilder.tsx` | `/api/service/quote`, `/api/service/estimate`, `/api/service/proposal` | Inherits | `components/QuoteBuilder.tsx:495, 511, 641, 703, 707` |
| `components/IssuesPanel.tsx` | `/api/events?event_type=FIELD_ISSUE&limit=200` (Sheets) | n/a | `components/IssuesPanel.tsx:73, 120, 137` |
| `components/OverviewPanel.tsx` | `/api/projects`, `/api/events?limit=20`, `/api/events?event_type=FIELD_ISSUE&limit=200` | n/a | `components/OverviewPanel.tsx:63, 64, 65` |
| `components/EventFeedPanel.tsx` | `/api/events?limit=100` | n/a | `components/EventFeedPanel.tsx:47` |
| `components/ActivityTimeline.tsx` | `/api/users`, `/api/events/{id}`, `/api/events` | n/a | `components/ActivityTimeline.tsx:591, 1601, 1617` |
| `components/TodayPanel.tsx` | `/api/today`, `/api/projects` | n/a | `components/TodayPanel.tsx:30, 34, 44` |
| `components/PMPanel.tsx` | `/api/projects` | n/a | `components/PMPanel.tsx:102` |
| `components/ProjectsPanel.tsx` | `/api/projects` | n/a | `components/ProjectsPanel.tsx:363` |
| `components/AdminPanel.tsx` | `/api/projects` (subset) | n/a | `components/AdminPanel.tsx:203` |
| `components/engagements/EngagementCreationForm.tsx` | `/api/engagements/options` (Postgres), `/api/engagements` (Postgres) | n/a — Postgres single source | `components/engagements/EngagementCreationForm.tsx:24, 41` |
| `components/shared/WorkBreakdown.tsx` | `/api/events/{id}`, `/api/events?kID=…&event_type=FIELD_MEASUREMENT` | n/a | `components/shared/WorkBreakdown.tsx:1959, 1963` |

### Read-source roll-up for the four BAN-307 canonical entities

| Entity | Sheets reads | Postgres reads | Postgres shadow reads | Reconciliation? |
|---|---|---|---|---|
| `field_events` | Multiple — `/api/events`, `/api/events/[eventId]`, `/api/daily-report/pdf`, `/api/field-issue/pdf`, `/api/admin/backfill-user-names`, all UI feeds | None | None | n/a |
| `engagements` | None (the legacy "Engagements" sheet tab is referenced by `/api/projects/handoff` only as a write target, not read by the engagements API) | `/api/engagements` (GET / POST / PATCH all hit Postgres), `/api/engagements/options` | None | n/a — single source |
| `service_work_orders` | Default path — many routes + UI | None outside the shadow read | `/api/service` GET (`:140`) and `/api/service/wo-list` GET (`:58`), gated by `WO_POSTGRES_READ_ENABLED && isStaging()` | Source tag returned to caller (`source: 'postgres_shadow'`); **no row-count, sample-ID, or field-level reconciliation logging** |
| `projects` | `/api/projects`, `/api/kai`, `/api/daily-report/pdf`, `/api/organizations/[orgId]` | None | None | n/a |
| `users` | `/api/users` and ~9 other lookup sites | None | None | n/a |

## Section 2 — Shadow / feature-flagged Postgres reads

### 2.1 `shouldReadServiceWorkOrdersFromPostgres()` — the toggle

`lib/service-work-orders/postgres-read.ts:89-91`:

```ts
export function shouldReadServiceWorkOrdersFromPostgres(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WO_POSTGRES_READ_ENABLED === 'true' && isStaging();
}
```

- Returns true only when **both** `WO_POSTGRES_READ_ENABLED === 'true'` and `isStaging() === true` (`lib/env.ts:5-7`: `process.env.VERCEL_TARGET_ENV === 'staging'`).
- Production is structurally blocked (`isStaging()` always false in prod).
- Config sanity check `assertPostgresReadConfig` at `:93-98` throws `'WO_POSTGRES_READ_ENABLED is true, but DATABASE_URL is missing. Refusing silent fallback for staging Postgres read smoke.'` if the env vars are inconsistent — explicit refusal to silently fall back.

### 2.2 `loadServiceWorkOrdersFromPostgresShadow()` — the loader

`lib/service-work-orders/postgres-read.ts:200-205`:

```ts
export async function loadServiceWorkOrdersFromPostgresShadow(): Promise<ServiceWorkOrderApiRecord[]> {
  assertPostgresReadConfig();
  const { db, service_work_orders } = await import('@/db');
  const rows = await db.select().from(service_work_orders).orderBy(desc(service_work_orders.created_at));
  return rows.map(row => postgresShadowRowToServiceWorkOrder(row));
}
```

- **What it does:** selects all rows from `service_work_orders` (Drizzle), orders by `created_at` desc, maps each to the API shape via `postgresShadowRowToServiceWorkOrder` (`:125-198`).
- **Fallback path:** none. If the loader throws, the caller (`/api/service/route.ts`) catches and falls back to Sheets — see `/api/service/route.ts:140-144` (try/catch around the loader; logs and falls through to Sheets read on error). Recommend reviewing whether the catch silently masks Postgres errors at runtime; today the source tag would show "sheets" so an operator could detect drift, but there is no metric or alert.
- **Reconciliation:** none. The result is returned with each row marked `postgres_shadow: true` and `source: 'postgres_shadow'` (set in `postgresShadowRowToServiceWorkOrder`, `:195-197`); no row-count comparison to Sheets, no sample IDs, no field-level diff. The smoke test is essentially "does the staging UI render correctly when fed Postgres rows?" — passing the smoke means the *shape* is right, not that the *data* matches Sheets.

### 2.3 `loadWorkOrderPickerFromPostgresShadow()` — the picker variant

`lib/service-work-orders/postgres-read.ts:207-226`:

```ts
export async function loadWorkOrderPickerFromPostgresShadow() {
  const rows = await loadServiceWorkOrdersFromPostgresShadow();
  const terminal = new Set(['closed', 'lost', 'completed', 'rejected', 'declined']);
  const seen = new Set<string>();
  const workOrders = [];
  for (const wo of rows) {
    if (!wo.name || terminal.has(wo.status.toLowerCase())) continue;
    const key = wo.wo_number || wo.id || wo.name;
    if (seen.has(key)) continue;
    seen.add(key);
    workOrders.push({
      id: wo.wo_number || wo.id,
      name: wo.name.split('\n')[0].substring(0, 80),
      island: wo.island,
      status: wo.status,
      contact: wo.contact.substring(0, 60),
    });
  }
  return workOrders;
}
```

- Wraps the full loader, filters terminal-status WOs, dedupes by `wo_number`/`id`/`name`, and returns a trimmed picker shape (`id`, `name` truncated to 80 chars, `island`, `status`, `contact` truncated to 60 chars).
- Used by `/api/service/wo-list/route.ts:58` when the shadow read is enabled.
- **Reconciliation:** none. No drift detection between Sheets-derived picker and Postgres-derived picker.

### 2.4 `postgresShadowRowToServiceWorkOrder()` — the row mapper

`lib/service-work-orders/postgres-read.ts:125-198`: maps a Postgres row (with nested `metadata` + `legacy_payload` JSON blobs) into the API shape. Key transformations:

- `postgresStatusToServiceStatus(row.status)` at `:128` (defined `:100-105`; maps `''` → `'lead'`, `'declined'` → `'lost'`, else passes through).
- `resolveWorkOrderIsland(row.island, addressRaw)` for island inference.
- Marks the output with `source: 'postgres_shadow'` and `postgres_shadow: true` at `:196-197`.

This mapper is the implicit contract between the new `service_work_orders` Postgres schema and the legacy `ServiceWorkOrderApiRecord` shape consumed by every MC UI. Drift in either schema breaks the shadow read.

### 2.5 Where the shadow read is invoked

Two routes, both via the `shouldReadServiceWorkOrdersFromPostgres()` selector:

- `/api/service/route.ts:131-144` — full WO list. Source tagged in response.
- `/api/service/wo-list/route.ts:57-58` — dispatch picker. No source tag in response.

No other route, page, or component invokes the shadow read directly. The pattern is **scoped narrowly to service work orders**; no shadow-read pattern exists for `field_events`, `engagements`, `projects`, or `users` anywhere in the repo.

### 2.6 Production usage today

Per `lib/env.ts:5-7` and `lib/service-work-orders/postgres-read.ts:89-91`:

- **Production:** shadow read is **structurally off** — `isStaging()` returns false, so `shouldReadServiceWorkOrdersFromPostgres()` is always false. No production traffic reaches `loadServiceWorkOrdersFromPostgresShadow`.
- **Staging, default:** off until `WO_POSTGRES_READ_ENABLED=true` is set in the Vercel staging environment.
- **Staging, opt-in:** active for `/api/service` and `/api/service/wo-list`. The 5 mutation routes guarded by `blockWOStagingPostgresReadOnlyMutation` are simultaneously blocked (see Output 4). No other routes change behavior.

## Section 3 — STOP-condition assessment

| STOP condition | Triggered? | Notes |
|---|---|---|
| Production-tenant data read from staging Postgres without env boundary | **No** — `isStaging()` gate at `lib/service-work-orders/postgres-read.ts:90` requires `VERCEL_TARGET_ENV === 'staging'`; production cannot enter shadow read. `assertPostgresReadConfig` at `:93-98` additionally throws if the flag is on without `DATABASE_URL`, refusing silent fallback. |
| Read source outside {Sheets / Postgres / both} for canonical entities | **No** for the four named entities. (`/app/war-room/page.tsx` reads Linear API but that's a coordination dashboard, not a canonical-entity read; classified as "External" in the read inventory.) |
| Reconciliation logic missing for a dual-read surface | **Partial — surface as BAN-300/BAN-307 follow-up.** The two shadow-read routes (`/api/service`, `/api/service/wo-list`) return source tags but do **not** log row-count diffs or sample IDs vs Sheets. There is no automated drift detection. Recommend a log line on every shadow read with `{ source, row_count, top_3_ids }` so an operator can compare Postgres and Sheets snapshots manually. Not a hard STOP — the system is still safe (writes blocked while shadow read is active) — but a meaningful smoke-quality gap. |

## Section 4 — Cross-references

- Output 1 (`fa-write-path-inventory.md` in the FA repo) confirms the FA writes only Sheets for `field_events`. Combined with the MC finding here that **no MC route reads `field_events` from Postgres** and **`emitMCEvent` in MC writes Sheets only** (`lib/events.ts:130` — verified in Output 2), the four MC read sites for events (`/api/events`, `/api/events/[eventId]`, `/api/daily-report/pdf`, `/api/field-issue/pdf`) are all reading the same store the FA writes into. The 505 historical rows in Postgres `field_events` are **not consulted** by any MC read path. Strong corroboration of Hypothesis B.
- Output 4 (`postgres-smoke-mode-guard-scope.md`) details the write-side guard that complements the shadow-read pattern documented here.

## Acceptance summary

- Every MC route and UI surface reading any of `field_events` / `engagements` / `service_work_orders` / `projects` / `users` is in the inventory table with file:line citations.
- Shadow / feature-flagged Postgres reads — only two routes today (`/api/service`, `/api/service/wo-list`) via `shouldReadServiceWorkOrdersFromPostgres`. Full helper code excerpts and behavior documented.
- No other "shadow", "postgres-read", or "feature-flagged Postgres read" patterns exist in the codebase (verified by `grep -rnE "shouldRead|postgres-?shadow|loadShadow" --include="*.ts" --include="*.tsx" app/ components/ lib/` returns only the service-WO references).
- STOP conditions: none triggered. One soft observation forwarded — shadow-read sites lack drift logging.
