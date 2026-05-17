-- BAN-304 Pass 3b — Closeout v1.1 enum types (isolated per BAN-293 lesson)
-- Source: Closeout Trunk Spec v1.1 §5, §6.2, §8.1, §8.6, §11.3
-- Ratification: BAN-304 D1-D6 — Sean 2026-05-17 HST
--
-- Per BAN-293 lesson, CREATE TYPE ... AS ENUM statements live in their own
-- migration file because Postgres cannot run them in the same transaction as
-- DDL that consumes the new type. Migration 0016 references these types.
-- All statements use the IF NOT EXISTS pattern via DO $$ BEGIN / EXCEPTION
-- duplicate_object idiom (Postgres lacks CREATE TYPE IF NOT EXISTS).
--
-- DOWN SQL (manual, if Sean directs):
--   DROP TYPE IF EXISTS public.deliverable_type;
--   DROP TYPE IF EXISTS public.warranty_claim_resolution;
--   DROP TYPE IF EXISTS public.warranty_claim_triage_result;
--   DROP TYPE IF EXISTS public.warranty_claim_inbound_source;
--   DROP TYPE IF EXISTS public.warranty_status;
--   DROP TYPE IF EXISTS public.punch_list_item_status;
--   DROP TYPE IF EXISTS public.punch_list_item_responsible_party;
--   DROP TYPE IF EXISTS public.punch_list_item_category;
--   DROP TYPE IF EXISTS public.punch_list_item_source;
--   DROP TYPE IF EXISTS public.project_lifecycle_state;

DO $$ BEGIN
  CREATE TYPE public.project_lifecycle_state AS ENUM (
    'IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE', 'FINAL_COMPLETE', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_source AS ENUM (
    'FIELD_ISSUE', 'SUBSTANTIAL_WALKTHROUGH', 'GC_TRANSMITTAL',
    'OWNER_WALKTHROUGH', 'ARCHITECT_WALKTHROUGH', 'INTERNAL_QA'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_category AS ENUM (
    'GLASS', 'FRAMING', 'HARDWARE', 'SEALANT',
    'FINISH', 'CLEANING', 'DOCUMENTATION', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_responsible_party AS ENUM (
    'KULA', 'OTHER_TRADE', 'GC', 'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_status AS ENUM (
    'NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED',
    'SIGNED_OFF', 'DISPUTED', 'DEFERRED_TO_WARRANTY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_status AS ENUM (
    'ACTIVE', 'EXPIRED', 'PARTIALLY_EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_claim_inbound_source AS ENUM (
    'EMAIL', 'PHONE', 'PORTAL', 'FIELD_DISCOVERY'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_claim_triage_result AS ENUM (
    'KULA_RESPONSIBLE', 'MANUFACTURER_RESPONSIBLE',
    'OTHER_TRADE_RESPONSIBLE', 'OUT_OF_WARRANTY', 'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_claim_resolution AS ENUM (
    'COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.deliverable_type AS ENUM (
    'AS_BUILT_DRAWING', 'OM_MANUAL_COMPONENT', 'OM_MANUAL_COMPLETE',
    'UNIFIED_JOB_PACKET', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
