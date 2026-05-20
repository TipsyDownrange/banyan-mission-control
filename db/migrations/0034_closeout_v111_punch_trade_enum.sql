-- BAN-375 Closeout v1.1.1 Phase 1 — punch_trade enum (Sean delta 1)
-- Source: Closeout v1.1.1 Phase 1 dispatch
--
-- Trade is a separate axis from category. Existing punch_list_item_category
-- captures system/material category (GLASS / FRAMING / HARDWARE / SEALANT /
-- FINISH / CLEANING / DOCUMENTATION / OTHER). Trade captures who performs the
-- remediation work. The two are intentionally orthogonal.
--
-- ISOLATED PER BAN-293 rule: CREATE TYPE lives in its own migration so future
-- ALTER TYPE ADD VALUE extensions don't collide with DDL that consumes the
-- enum in the same transaction.
--
-- DOWN SQL (manual): DROP TYPE IF EXISTS public.punch_trade;

DO $$ BEGIN
  CREATE TYPE public.punch_trade AS ENUM (
    'glazier',
    'framer',
    'waterproofer',
    'electrician',
    'plumber',
    'hvac',
    'drywall',
    'paint',
    'cleaning',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
