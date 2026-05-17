-- BAN-304 Pass 3b — Closeout v1.1 enum types (10 enums)
-- Source: Closeout Trunk v1.1 §5, §6.2, §7, §8.1, §8.6, §9.3, §11.3, §12, §13, §16.2, §19.1
-- Ratification: BAN-304 D1 (10 fully-additive tables) + D5/D6 (no event_type changes) — Sean 2026-05-17 HST
--
-- DESIGN NOTE — divergence from BAN-293 / 0014 pattern:
--   Migrations 0012-0014 use text + CHECK constraints. Pass 3b introduces ten
--   genuine PostgreSQL ENUM types via CREATE TYPE per BAN-304 dispatch direction
--   ("all CREATE TYPE statements, isolated, IF NOT EXISTS idempotent").
--   Rationale captured in ADR-013. Isolation in a separate migration file
--   follows the BAN-293 lesson: ALTER TYPE ADD VALUE cannot run in the same
--   transaction as DDL that consumes the type, so future enum extensions will
--   each live in their own isolated migration.
--
-- IDEMPOTENCY: CREATE TYPE does not natively support IF NOT EXISTS in PostgreSQL.
-- Each statement is wrapped in a DO block that catches duplicate_object so reruns
-- are safe.
--
-- DOWN SQL (manual, if Sean directs): in reverse declaration order
--   DROP TYPE IF EXISTS public.deliverable_type;
--   DROP TYPE IF EXISTS public.warranty_claim_resolution;
--   DROP TYPE IF EXISTS public.warranty_claim_triage_result;
--   DROP TYPE IF EXISTS public.warranty_claim_inbound_source;
--   DROP TYPE IF EXISTS public.warranty_status;
--   DROP TYPE IF EXISTS public.punch_list_item_status;
--   DROP TYPE IF EXISTS public.punch_list_responsible_party;
--   DROP TYPE IF EXISTS public.punch_list_item_category;
--   DROP TYPE IF EXISTS public.punch_list_item_source;
--   DROP TYPE IF EXISTS public.project_lifecycle_state;
--
-- PROTECTED: Migrations 0000-0014 frozen. field_events.event_type CHECK frozen at 34 values (BAN-293).

DO $$ BEGIN
  CREATE TYPE public.project_lifecycle_state AS ENUM (
    'IN_CLOSEOUT',
    'SUBSTANTIALLY_COMPLETE',
    'FINAL_COMPLETE',
    'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_source AS ENUM (
    'FIELD_ISSUE',
    'SUBSTANTIAL_WALKTHROUGH',
    'GC_TRANSMITTAL',
    'OWNER_WALKTHROUGH',
    'ARCHITECT_WALKTHROUGH',
    'INTERNAL_QA'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_category AS ENUM (
    'GLASS',
    'FRAMING',
    'HARDWARE',
    'SEALANT',
    'FINISH',
    'CLEANING',
    'DOCUMENTATION',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_responsible_party AS ENUM (
    'KULA',
    'OTHER_TRADE',
    'GC',
    'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.punch_list_item_status AS ENUM (
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'SIGNED_OFF',
    'DISPUTED',
    'DEFERRED_TO_WARRANTY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_status AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'PARTIALLY_EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_claim_inbound_source AS ENUM (
    'EMAIL',
    'PHONE',
    'PORTAL',
    'FIELD_DISCOVERY'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_claim_triage_result AS ENUM (
    'KULA_RESPONSIBLE',
    'MANUFACTURER_RESPONSIBLE',
    'OTHER_TRADE_RESPONSIBLE',
    'OUT_OF_WARRANTY',
    'DISPUTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.warranty_claim_resolution AS ENUM (
    'COMPLETED',
    'REFERRED',
    'WRITTEN_OFF',
    'UNRESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.deliverable_type AS ENUM (
    'AS_BUILT_DRAWING',
    'OM_MANUAL_COMPONENT',
    'OM_MANUAL_COMPLETE',
    'UNIFIED_JOB_PACKET',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
