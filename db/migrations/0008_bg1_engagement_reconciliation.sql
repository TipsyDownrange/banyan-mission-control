-- BG1 Slice A: Packet 003 Wave 2 — Engagement schema reconciliation
-- Branch: feat/bg1-schema-foundation
-- Linear: BAN-### (Packet 003 W2)
--
-- Adds 10 columns to public.engagements per BQS Packet 003 §6.3 reconciled to
-- staging-actual schema names (engagement_id PK, status column, users.user_id FK).
-- Relaxes the engagement_type CHECK to allow both legacy + new values, migrates
-- 177 existing rows via the dispatch-authoritative mapping, populates
-- routing_decision, then tightens the CHECK to canonical values only.
--
-- Authoring lane: Claude Code. DB execution lane: Kai applies to Supabase staging.
-- Production impact: none this dispatch (staging-only per ADR-026).
--
-- Engagement-type → new mapping (per dispatch):
--   service_work_order   → work_order_small  + pm_handoff_state='active'
--   project_bid          → project           + pm_handoff_state='awaiting_handoff'
--   project_active       → project           + pm_handoff_state='active'
--   quote                → project           + pm_handoff_state='estimating'
--   inquiry              → project           + pm_handoff_state='estimating'
--   maintenance_contract → maintenance       + pm_handoff_state='active'
--   other                → internal          + pm_handoff_state='active'
--
-- Routing-decision backfill:
--   service_wo : work_order_small | work_order_large | maintenance |
--                warranty_small | warranty_large
--   project    : project | internal
--
-- Smoke queries after apply:
--   SELECT engagement_type, count(*) FROM public.engagements GROUP BY 1;
--   -- expected: all 177 rows on canonical new-value set
--
--   SELECT pm_handoff_state, routing_decision, count(*) FROM public.engagements
--     GROUP BY 1, 2 ORDER BY 1, 2;
--
--   SELECT count(*) FROM public.service_work_orders;  -- expected 577 (integrity gate)
--
-- DOWN SQL (manual rollback, if Sean directs):
--   1. ALTER TABLE public.engagements DROP CONSTRAINT engagements_engagement_type_check;
--   2. ALTER TABLE public.engagements ADD CONSTRAINT engagements_engagement_type_check
--        CHECK (engagement_type IN ('service_work_order','project_bid','project_active',
--          'quote','inquiry','maintenance_contract','other'));
--   3. UPDATE public.engagements SET engagement_type='service_work_order' WHERE engagement_type='work_order_small';
--      -- and the other inverse mappings; cannot reverse pm_handoff_state losslessly
--   4. ALTER TABLE public.engagements DROP COLUMN routing_decision, DROP COLUMN ...
--      (drop all 10 new columns).
--   5. DROP INDEX engagements_tenant_status_pm_handoff_idx.

-- ─── Step 1: add 10 columns ─────────────────────────────────────────────────
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "routing_decision" text;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "routing_assigned_by" uuid;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "routing_assigned_at" timestamptz;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "routing_rationale" text;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "pm_handoff_state" text NOT NULL DEFAULT 'estimating';
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "pm_assigned_user_id" uuid;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "warranty_supplement_routing" text;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "drive_folder_template" text;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "target_completion_date" date;
ALTER TABLE "engagements" ADD COLUMN IF NOT EXISTS "actual_completion_date" date;
--> statement-breakpoint

-- ─── Step 2: relax engagement_type CHECK to allow both old + new values ─────
ALTER TABLE "engagements" DROP CONSTRAINT IF EXISTS "engagements_engagement_type_check";
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_engagement_type_check_transitional"
  CHECK ("engagement_type" IN (
    -- legacy values (BQS pre-Packet-003 W2)
    'service_work_order','project_bid','project_active','quote','inquiry','maintenance_contract','other',
    -- canonical values per BQS Packet 003 §6.3
    'project','work_order_small','work_order_large','warranty_small','warranty_large','maintenance','internal'
  ));
--> statement-breakpoint

-- ─── Step 3: migrate engagement_type values + populate pm_handoff_state ─────
UPDATE "engagements" SET "engagement_type"='work_order_small', "pm_handoff_state"='active'           WHERE "engagement_type"='service_work_order';
UPDATE "engagements" SET "engagement_type"='project',          "pm_handoff_state"='awaiting_handoff' WHERE "engagement_type"='project_bid';
UPDATE "engagements" SET "engagement_type"='project',          "pm_handoff_state"='active'           WHERE "engagement_type"='project_active';
UPDATE "engagements" SET "engagement_type"='project',          "pm_handoff_state"='estimating'       WHERE "engagement_type"='quote';
UPDATE "engagements" SET "engagement_type"='project',          "pm_handoff_state"='estimating'       WHERE "engagement_type"='inquiry';
UPDATE "engagements" SET "engagement_type"='maintenance',      "pm_handoff_state"='active'           WHERE "engagement_type"='maintenance_contract';
UPDATE "engagements" SET "engagement_type"='internal',         "pm_handoff_state"='active'           WHERE "engagement_type"='other';
--> statement-breakpoint

-- ─── Step 4: populate routing_decision per dispatch mapping ─────────────────
UPDATE "engagements" SET "routing_decision"='service_wo'
  WHERE "engagement_type" IN ('work_order_small','work_order_large','maintenance','warranty_small','warranty_large');
UPDATE "engagements" SET "routing_decision"='project'
  WHERE "engagement_type" IN ('project','internal');
--> statement-breakpoint

-- ─── Step 5: tighten engagement_type CHECK to canonical values only ─────────
ALTER TABLE "engagements" DROP CONSTRAINT "engagements_engagement_type_check_transitional";
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_engagement_type_check"
  CHECK ("engagement_type" IN (
    'project','work_order_small','work_order_large','warranty_small','warranty_large','maintenance','internal'
  ));
--> statement-breakpoint

-- ─── Step 6: add new CHECK constraints ──────────────────────────────────────
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_routing_decision_check"
  CHECK ("routing_decision" IS NULL OR "routing_decision" IN ('service_wo','project'));
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_pm_handoff_state_check"
  CHECK ("pm_handoff_state" IN ('estimating','awaiting_handoff','pm_assigned','active','handoff_blocked','closed'));
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_warranty_supplement_routing_check"
  CHECK ("warranty_supplement_routing" IS NULL OR "warranty_supplement_routing" IN ('gc','owner','both','auto'));
--> statement-breakpoint

-- ─── Step 7: add FKs for routing_assigned_by + pm_assigned_user_id ──────────
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_routing_assigned_by_users_user_id_fk"
  FOREIGN KEY ("routing_assigned_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_pm_assigned_user_id_users_user_id_fk"
  FOREIGN KEY ("pm_assigned_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ─── Step 8: add new indexes ────────────────────────────────────────────────
-- Note: existing engagements_type_status_idx already covers (tenant_id, engagement_type)
-- as a prefix, so the dispatch's (tenant_id, engagement_type) index is omitted as
-- redundant. The (tenant_id, status, pm_handoff_state) lookup index is net-new.
CREATE INDEX IF NOT EXISTS "engagements_tenant_status_pm_handoff_idx"
  ON "engagements" USING btree ("tenant_id", "status", "pm_handoff_state");
--> statement-breakpoint

-- ─── Step 9: column comments per ADR-027 ────────────────────────────────────
COMMENT ON COLUMN public.engagements.routing_decision IS
  'BG1 Packet 003 W2: leadership routing call per Bundle G v1.1. service_wo | project. Nullable until backfill complete.';
COMMENT ON COLUMN public.engagements.routing_assigned_by IS
  'FK users.user_id. Leadership user (Jody / Sean / authorized) who set routing_decision per Bundle G v1.1.';
COMMENT ON COLUMN public.engagements.routing_assigned_at IS
  'BG1 Packet 003 W2: timestamp the routing_decision was set.';
COMMENT ON COLUMN public.engagements.routing_rationale IS
  'BG1 Packet 003 W2: rationale required per ADR-038 for routing decision audit.';
COMMENT ON COLUMN public.engagements.pm_handoff_state IS
  'BG1 Packet 003 W2: PM handoff state machine per BAN-198 v1.1. estimating | awaiting_handoff | pm_assigned | active | handoff_blocked | closed.';
COMMENT ON COLUMN public.engagements.pm_assigned_user_id IS
  'FK users.user_id. PM assigned to this engagement once state transitions to pm_assigned per BAN-198 v1.1.';
COMMENT ON COLUMN public.engagements.warranty_supplement_routing IS
  'BG1 Packet 003 W2: warranty supplement routing per BAN-198 v1.1. gc | owner | both | auto.';
COMMENT ON COLUMN public.engagements.drive_folder_template IS
  'BG1 Packet 003 W2: Drive folder template selector per BQS Packet 003 §6.6 (project_full | wo_small | wo_large).';
COMMENT ON COLUMN public.engagements.target_completion_date IS
  'BG1 Packet 003 W2: target completion date (planned).';
COMMENT ON COLUMN public.engagements.actual_completion_date IS
  'BG1 Packet 003 W2: actual completion date (final).';
