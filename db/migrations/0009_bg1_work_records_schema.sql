-- BG1 Slice C: Packet 005 — Work Records foundation (schema only, no app logic)
-- Branch: feat/bg1-schema-foundation
-- Linear: BAN-### (Packet 005)
--
-- Creates 8 new tables per BQS Packet 005 §6.1-§6.6 with entity-prefixed PKs
-- per BanyanOS convention:
--   work_records         (work_record_id PK)        — unified work aggregate per ADR-001
--   bids                 (bid_id PK)                — Estimating bid pipeline
--   estimates            (estimate_id PK)           — Estimate header
--   estimate_versions    (estimate_version_id PK)   — versioned snapshot per ADR-038
--   proposals            (proposal_id PK)           — Proposal header
--   proposal_versions    (proposal_version_id PK)   — versioned snapshot
--   pricing_evidence     (pricing_evidence_id PK)   — Finance domain per ADR-007
--   work_state_history   (state_history_id PK)      — append-only state transitions
--
-- service_work_orders is UNTOUCHED — Phase 1 coexistence per BQS §11.
-- No app-layer routing / API routes / Bid Queue refactor this dispatch
-- (Packet 005 §3.3 / dispatch DO-NOT scope).
--
-- Decisions locked by dispatch resume (5c):
--   (i)   work_records.status — plain TEXT NOT NULL, NO CHECK constraint.
--         App layer enforces (work_type → valid_status) mapping per ADR-038.
--   (ii)  estimates.current_version_id — nullable UUID, NO FK enforcement
--         (circular with estimate_versions.estimate_id). App layer guarantees
--         integrity per ADR-038. Same for proposals.current_version_id.
--   (iii) estimate_versions.priced_against_document_set_id — UUID nullable,
--         NO FK (Documents domain TBD).
--
-- Smoke queries after apply:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public' AND table_name IN
--       ('work_records','bids','estimates','estimate_versions','proposals',
--        'proposal_versions','pricing_evidence','work_state_history')
--     ORDER BY 1;  -- expected: all 8 present
--
--   SELECT count(*) FROM public.service_work_orders;  -- expected 577 (integrity gate)
--
--   SELECT table_name, count(*) FROM public.schema_metadata
--     WHERE table_name IN ('work_records','bids','estimates','estimate_versions',
--       'proposals','proposal_versions','pricing_evidence','work_state_history')
--     GROUP BY 1 ORDER BY 1;
--
-- DOWN SQL (manual rollback, if Sean directs):
--   DELETE FROM public.schema_metadata WHERE table_name IN (
--     'work_records','bids','estimates','estimate_versions',
--     'proposals','proposal_versions','pricing_evidence','work_state_history');
--   DROP TABLE IF EXISTS public.work_state_history;
--   DROP TABLE IF EXISTS public.pricing_evidence;
--   DROP TABLE IF EXISTS public.proposal_versions;
--   DROP TABLE IF EXISTS public.proposals;
--   DROP TABLE IF EXISTS public.estimate_versions;
--   DROP TABLE IF EXISTS public.estimates;
--   DROP TABLE IF EXISTS public.bids;
--   DROP TABLE IF EXISTS public.work_records;

-- ─── work_records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "work_records" (
  "work_record_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid" text NOT NULL,
  "work_type" text NOT NULL,
  "parent_work_id" uuid,
  "engagement_id" uuid NOT NULL,
  "primary_organization_id" uuid NOT NULL,
  "primary_contact_id" uuid,
  "primary_site_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "assigned_user_id" uuid,
  "created_from_bid_id" uuid,
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "work_records" ADD CONSTRAINT "work_records_tenant_kid_unique" UNIQUE ("tenant_id", "kid");
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_work_type_check"
  CHECK ("work_type" IN ('project','work_order','warranty'));
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_parent_work_id_fk"
  FOREIGN KEY ("parent_work_id") REFERENCES "public"."work_records"("work_record_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_engagement_id_fk"
  FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("engagement_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_primary_organization_id_fk"
  FOREIGN KEY ("primary_organization_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_primary_contact_id_fk"
  FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("contact_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_primary_site_id_fk"
  FOREIGN KEY ("primary_site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_assigned_user_id_fk"
  FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "work_records_tenant_type_status_idx" ON "work_records" ("tenant_id", "work_type", "status");
CREATE INDEX IF NOT EXISTS "work_records_tenant_engagement_idx" ON "work_records" ("tenant_id", "engagement_id");
CREATE INDEX IF NOT EXISTS "work_records_tenant_org_idx" ON "work_records" ("tenant_id", "primary_organization_id");
CREATE INDEX IF NOT EXISTS "work_records_tenant_assigned_status_idx" ON "work_records" ("tenant_id", "assigned_user_id", "status");
COMMENT ON COLUMN public.work_records.status IS
  'BG1 Slice C decision 5c-(i): plain TEXT, no CHECK. Valid values depend on work_type per Packet 005 BQS §6.1. State-machine enforcement deferred to app layer per ADR-038 Universal Modifiability.';
--> statement-breakpoint

-- ─── bids ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bids" (
  "bid_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid" text NOT NULL,
  "work_record_id" uuid,
  "bid_state" text,
  "estimator_id" uuid,
  "source_channel" text,
  "due_date" date,
  "bid_amount" numeric(12,2),
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "bids" ADD CONSTRAINT "bids_tenant_kid_unique" UNIQUE ("tenant_id", "kid");
ALTER TABLE "bids" ADD CONSTRAINT "bids_bid_state_check"
  CHECK ("bid_state" IS NULL OR "bid_state" IN ('candidate','go_decision','in_progress','submitted','awarded','lost','withdrawn'));
ALTER TABLE "bids" ADD CONSTRAINT "bids_work_record_id_fk"
  FOREIGN KEY ("work_record_id") REFERENCES "public"."work_records"("work_record_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bids" ADD CONSTRAINT "bids_estimator_id_fk"
  FOREIGN KEY ("estimator_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bids" ADD CONSTRAINT "bids_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bids" ADD CONSTRAINT "bids_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "bids" ADD CONSTRAINT "bids_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "bids_tenant_state_idx" ON "bids" ("tenant_id", "bid_state");
CREATE INDEX IF NOT EXISTS "bids_tenant_estimator_idx" ON "bids" ("tenant_id", "estimator_id");
-- Backfill the soft work_records.created_from_bid_id FK once bids exists.
ALTER TABLE "work_records" ADD CONSTRAINT "work_records_created_from_bid_id_fk"
  FOREIGN KEY ("created_from_bid_id") REFERENCES "public"."bids"("bid_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ─── estimates ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "estimates" (
  "estimate_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid" text NOT NULL,
  "bid_id" uuid,
  "current_version_id" uuid,
  "status" text NOT NULL DEFAULT 'draft',
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "estimates" ADD CONSTRAINT "estimates_tenant_kid_unique" UNIQUE ("tenant_id", "kid");
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_bid_id_fk"
  FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("bid_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "estimates_tenant_bid_idx" ON "estimates" ("tenant_id", "bid_id");
COMMENT ON COLUMN public.estimates.current_version_id IS
  'BG1 Slice C decision 5c-(ii): soft reference to estimate_versions.estimate_version_id. Not enforced at DB layer due to circular dependency at table creation. App layer guarantees integrity per ADR-038.';
--> statement-breakpoint

-- ─── estimate_versions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "estimate_versions" (
  "estimate_version_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "estimate_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "priced_against_document_set_id" uuid,
  "snapshot_get_rate" numeric(5,4),
  "snapshot_labor_rate" numeric(8,2),
  "snapshot_overhead_markup_pct" numeric(5,4),
  "snapshot_profit_markup_pct" numeric(5,4),
  "total_amount" numeric(12,2),
  "accepted_at" timestamptz,
  "frozen_at" timestamptz,
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_tenant_estimate_version_unique"
  UNIQUE ("tenant_id", "estimate_id", "version_number");
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_estimate_id_fk"
  FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("estimate_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "estimate_versions" ADD CONSTRAINT "estimate_versions_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "estimate_versions_tenant_estimate_idx" ON "estimate_versions" ("tenant_id", "estimate_id");
COMMENT ON COLUMN public.estimate_versions.priced_against_document_set_id IS
  'BG1 Slice C decision 5c-(iii): future Documents domain reference. FK will be added when document_sets table lands in a future packet.';
COMMENT ON COLUMN public.estimate_versions.snapshot_get_rate IS
  'Business Rules registry G&T rate snapshotted at version creation per ADR-038. Future rule changes do not retroactively alter existing versions.';
--> statement-breakpoint

-- ─── proposals ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "proposals" (
  "proposal_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid" text NOT NULL,
  "estimate_id" uuid,
  "current_version_id" uuid,
  "status" text NOT NULL DEFAULT 'draft',
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_kid_unique" UNIQUE ("tenant_id", "kid");
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_estimate_id_fk"
  FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("estimate_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "proposals_tenant_estimate_idx" ON "proposals" ("tenant_id", "estimate_id");
COMMENT ON COLUMN public.proposals.current_version_id IS
  'BG1 Slice C decision 5c-(ii): soft reference to proposal_versions.proposal_version_id. Not enforced at DB layer due to circular dependency. App layer guarantees integrity per ADR-038.';
--> statement-breakpoint

-- ─── proposal_versions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "proposal_versions" (
  "proposal_version_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "total_amount" numeric(12,2),
  "accepted_at" timestamptz,
  "frozen_at" timestamptz,
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_tenant_proposal_version_unique"
  UNIQUE ("tenant_id", "proposal_id", "version_number");
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_fk"
  FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("proposal_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "proposal_versions_tenant_proposal_idx" ON "proposal_versions" ("tenant_id", "proposal_id");
--> statement-breakpoint

-- ─── pricing_evidence (Finance domain per ADR-007) ──────────────────────────
CREATE TABLE IF NOT EXISTS "pricing_evidence" (
  "pricing_evidence_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kid" text NOT NULL,
  "estimate_version_id" uuid,
  "source" text,
  "amount" numeric(12,2),
  "vendor_organization_id" uuid,
  "manufacturer_id" uuid,
  "system_type_id" uuid,
  "document_reference" jsonb,
  "received_at" date,
  "confidence_level" text,
  "tenant_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid
);
--> statement-breakpoint

ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_tenant_kid_unique" UNIQUE ("tenant_id", "kid");
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_source_check"
  CHECK ("source" IS NULL OR "source" IN ('vendor_quote_pdf','verbal_quote','historical_reference','owner_priced_assumption','invoice_actual'));
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_confidence_level_check"
  CHECK ("confidence_level" IS NULL OR "confidence_level" IN ('firm','secondhand','rumor'));
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_estimate_version_id_fk"
  FOREIGN KEY ("estimate_version_id") REFERENCES "public"."estimate_versions"("estimate_version_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_vendor_organization_id_fk"
  FOREIGN KEY ("vendor_organization_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_manufacturer_id_fk"
  FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("manufacturer_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_system_type_id_fk"
  FOREIGN KEY ("system_type_id") REFERENCES "public"."system_types"("system_type_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "pricing_evidence" ADD CONSTRAINT "pricing_evidence_updated_by_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "pricing_evidence_tenant_estimate_version_idx"
  ON "pricing_evidence" ("tenant_id", "estimate_version_id");
--> statement-breakpoint

-- ─── work_state_history (append-only) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "work_state_history" (
  "state_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "work_record_id" uuid NOT NULL,
  "prior_state" text,
  "new_state" text NOT NULL,
  "actor" uuid NOT NULL,
  "rationale" text,
  "ts" timestamptz NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL
);
--> statement-breakpoint

ALTER TABLE "work_state_history" ADD CONSTRAINT "work_state_history_work_record_id_fk"
  FOREIGN KEY ("work_record_id") REFERENCES "public"."work_records"("work_record_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_state_history" ADD CONSTRAINT "work_state_history_actor_fk"
  FOREIGN KEY ("actor") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "work_state_history" ADD CONSTRAINT "work_state_history_tenant_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "work_state_history_work_record_ts_idx" ON "work_state_history" ("work_record_id", "ts");
COMMENT ON TABLE public.work_state_history IS
  'Append-only state transition history per ADR-012. ADR-038 rationale captured when required.';
--> statement-breakpoint

-- ─── schema_metadata seeds (per ADR-027) ────────────────────────────────────
-- Per-table defaults applied; universal: tenant_scoped=true, source_system='internal',
-- migration_status='current', pii=false. Per Sean's authoritative table:
--   work_records       → Work,                pm,        changes_only,  {MC,FA}
--   bids               → Work,                estimator, changes_only,  {MC}
--   estimates          → Work,                estimator, changes_only,  {MC}
--   estimate_versions  → Work,                estimator, changes_only,  {MC}
--   proposals          → Work,                estimator, changes_only,  {MC}
--   proposal_versions  → Work,                estimator, changes_only,  {MC}
--   pricing_evidence   → Finance,             estimator, full,          {MC}
--   work_state_history → Platform Governance, system,    full,          {MC}

INSERT INTO public.schema_metadata
  (table_name, column_name, plain_english_meaning, domain_owner, write_owner, allowed_writers, consumers, tenant_scoped, source_system, migration_status, audit_requirement, pii)
VALUES
-- work_records (17 cols)
('work_records','work_record_id','Primary key — unique work record identifier per ADR-001.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','kid','Human-readable identifier — PRJ-2X / WO-2X / WRN-2X per BQS Packet 005 §6.1.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','work_type','Work classification: project | work_order | warranty per ADR-001.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','parent_work_id','Self-reference for warranty callbacks linking to original work.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','engagement_id','FK engagements — engagement scope context per Packet 003.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','primary_organization_id','FK organizations — primary org for this work.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','primary_contact_id','FK contacts — primary contact (nullable).','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','primary_site_id','FK sites — primary jobsite per ADR-032.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','name','Display name for the work record.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','status','Current state — valid values depend on work_type (app-layer enforcement per ADR-038).','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','assigned_user_id','FK users — PM or Service PM assigned.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','created_from_bid_id','FK bids — bid lineage for project-typed work records.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','tenant_id','Tenant scope per multi-tenant pattern.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','created_at','Audit timestamp set at row creation.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','updated_at','Audit timestamp updated on row mutation.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','created_by','FK users — actor at row creation.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),
('work_records','updated_by','FK users — last actor to mutate the row.','Work','pm',ARRAY['super_admin','owner','gm','business_admin','pm'],ARRAY['MC','FA'],true,'internal','current','changes_only',false),

-- bids (13 cols)
('bids','bid_id','Primary key — unique bid identifier.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','kid','Human-readable identifier — BID-2X per BQS Packet 005 §6.2.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','work_record_id','FK work_records — set on bid award to link to created work_record.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','bid_state','Bid pipeline state: candidate | go_decision | in_progress | submitted | awarded | lost | withdrawn.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','estimator_id','FK users — estimator responsible for the bid.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','source_channel','How the bid opportunity was sourced (referral / dodge / direct / etc).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','due_date','Bid submission deadline.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','bid_amount','Bid dollar amount submitted.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','tenant_id','Tenant scope.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','created_at','Audit timestamp set at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','updated_at','Audit timestamp updated on row mutation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','created_by','FK users — actor at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('bids','updated_by','FK users — last actor to mutate the row.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),

-- estimates (10 cols)
('estimates','estimate_id','Primary key — unique estimate identifier.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','kid','Human-readable identifier — EST-2X per BQS Packet 005 §6.3.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','bid_id','FK bids — bid that originated this estimate.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','current_version_id','Soft reference to current estimate_versions row (no FK; circular dep).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','status','Estimate status (draft / in_progress / accepted / archived).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','tenant_id','Tenant scope.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','created_at','Audit timestamp set at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','updated_at','Audit timestamp updated on row mutation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','created_by','FK users — actor at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimates','updated_by','FK users — last actor to mutate the row.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),

-- estimate_versions (16 cols)
('estimate_versions','estimate_version_id','Primary key — unique estimate version identifier.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','estimate_id','FK estimates — parent estimate row.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','version_number','Monotonically increasing version number scoped to estimate_id.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','priced_against_document_set_id','Future Documents domain reference — no FK until document_sets ships.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','snapshot_get_rate','Business Rules registry G&T rate snapshotted at version creation per ADR-038.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','snapshot_labor_rate','Business Rules labor rate snapshotted at version creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','snapshot_overhead_markup_pct','Business Rules overhead markup snapshotted at version creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','snapshot_profit_markup_pct','Business Rules profit markup snapshotted at version creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','total_amount','Total estimated amount for this version.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','accepted_at','Timestamp when this version was accepted by the customer.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','frozen_at','Timestamp when this version was frozen (immutable thereafter).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','tenant_id','Tenant scope.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','created_at','Audit timestamp set at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','updated_at','Audit timestamp updated on row mutation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','created_by','FK users — actor at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('estimate_versions','updated_by','FK users — last actor to mutate the row.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),

-- proposals (10 cols)
('proposals','proposal_id','Primary key — unique proposal identifier.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','kid','Human-readable identifier — PRO-2X per BQS Packet 005 §6.4.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','estimate_id','FK estimates — estimate that originated this proposal.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','current_version_id','Soft reference to current proposal_versions row (no FK; circular dep).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','status','Proposal status (draft / sent / accepted / declined / archived).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','tenant_id','Tenant scope.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','created_at','Audit timestamp set at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','updated_at','Audit timestamp updated on row mutation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','created_by','FK users — actor at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposals','updated_by','FK users — last actor to mutate the row.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),

-- proposal_versions (10 cols)
('proposal_versions','proposal_version_id','Primary key — unique proposal version identifier.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','proposal_id','FK proposals — parent proposal row.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','version_number','Monotonically increasing version number scoped to proposal_id.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','total_amount','Total proposed amount for this version.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','accepted_at','Timestamp when this proposal version was accepted.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','frozen_at','Timestamp when this version was frozen (immutable thereafter).','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','tenant_id','Tenant scope.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','created_at','Audit timestamp set at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','updated_at','Audit timestamp updated on row mutation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),
('proposal_versions','created_by','FK users — actor at row creation.','Work','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','changes_only',false),

-- pricing_evidence (Finance, full audit)
('pricing_evidence','pricing_evidence_id','Primary key — unique pricing evidence identifier.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','kid','Human-readable identifier — PRC-2X per BQS Packet 005 §6.5.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','estimate_version_id','FK estimate_versions — version this evidence supports.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','source','Evidence source: vendor_quote_pdf | verbal_quote | historical_reference | owner_priced_assumption | invoice_actual.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','amount','Dollar amount documented by this evidence.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','vendor_organization_id','FK organizations — vendor providing the pricing (nullable).','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','manufacturer_id','FK manufacturers — manufacturer for parts pricing (nullable).','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','system_type_id','FK system_types — system type context (nullable).','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','document_reference','JSONB — Drive file ID + page reference for the source document.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','received_at','Date the evidence was received from vendor / source.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','confidence_level','Evidence confidence: firm | secondhand | rumor per Business Rules registry.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','tenant_id','Tenant scope.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','created_at','Audit timestamp set at row creation.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','updated_at','Audit timestamp updated on row mutation.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','created_by','FK users — actor at row creation.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),
('pricing_evidence','updated_by','FK users — last actor to mutate the row.','Finance','estimator',ARRAY['super_admin','owner','gm','business_admin','estimator'],ARRAY['MC'],true,'internal','current','full',false),

-- work_state_history (Platform Governance, system writer, full audit, append-only)
('work_state_history','state_history_id','Primary key — append-only state transition row identifier.','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','work_record_id','FK work_records — work record whose state transitioned.','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','prior_state','State before the transition (NULL for initial state).','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','new_state','State after the transition (required).','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','actor','FK users — actor who caused the transition.','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','rationale','ADR-038 rationale captured when required by transition rules.','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','ts','Transition timestamp.','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false),
('work_state_history','tenant_id','Tenant scope.','Platform Governance','system',ARRAY['system'],ARRAY['MC'],true,'internal','current','full',false)
ON CONFLICT DO NOTHING;
