-- BAN-341 PM-V1.0-B — RFI Log v1.0
-- Source: PM Trunk v1.0 §6 (RFI Log) + §10 Contextual Document Surfacing
-- ratified GC-D068 2026-05-01.
--
-- Adds the rfis entity + supporting enums. Per-project sequential numbering:
--   PRJ-YY-NNNN-RFI-NNN   (NNN = 3-digit per-project sequence)
--
-- Activity Spine event RFI_STATE_CHANGED (Pattern B) + RFI_GENERATED_CO
-- (Pattern A) are added in lib/activity-spine/event-contract.ts and the
-- field_events.event_type CHECK constraint is extended below.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.rfi_reason AS ENUM (
    'SCOPE_CLARIFICATION','DRAWING_CONFLICT','SPEC_AMBIGUITY',
    'FIELD_CONDITION','DESIGN_INTENT','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.rfi_status AS ENUM (
    'DRAFT','SUBMITTED','UNDER_REVIEW','ANSWERED','RESOLVED','CLOSED','VOID'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.rfi_submitted_to AS ENUM ('GC','ARCHITECT','ENGINEER','OWNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.rfi_ball_in_court AS ENUM ('SUBCONTRACTOR','GC','ARCHITECT','ENGINEER','OWNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ── rfis table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rfis (
  rfi_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),

  rfi_number text NOT NULL,

  subject text NOT NULL,
  question text NOT NULL,
  reason_for_rfi public.rfi_reason,

  cost_or_schedule_impact_anticipated boolean NOT NULL DEFAULT false,
  cost_impact_estimate numeric(14,2),
  schedule_impact_days integer,

  submitted_to public.rfi_submitted_to,
  submitted_date date,
  required_response_by_date date,

  status public.rfi_status NOT NULL DEFAULT 'DRAFT',
  ball_in_court public.rfi_ball_in_court,

  response_received_date date,
  response_text text,
  response_documents text[] NOT NULL DEFAULT ARRAY[]::text[],

  generates_change_order boolean NOT NULL DEFAULT false,
  linked_change_order_id uuid,

  rfi_pdf_drive_id text,
  submitted_attachments text[] NOT NULL DEFAULT ARRAY[]::text[],

  external_visible boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

-- ── Uniqueness + indexes ────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS rfis_number_uidx
  ON public.rfis (rfi_number);
CREATE INDEX IF NOT EXISTS rfis_engagement_idx
  ON public.rfis (engagement_id);
CREATE INDEX IF NOT EXISTS rfis_status_idx
  ON public.rfis (status);
CREATE INDEX IF NOT EXISTS rfis_ball_in_court_idx
  ON public.rfis (ball_in_court);
CREATE INDEX IF NOT EXISTS rfis_required_response_idx
  ON public.rfis (required_response_by_date);
--> statement-breakpoint

-- ── RFI number format check ────────────────────────────────────────────────
-- Format: PRJ-YY-NNNN-RFI-NNN (3-digit per-project sequence)
ALTER TABLE public.rfis
  DROP CONSTRAINT IF EXISTS rfis_number_format;
ALTER TABLE public.rfis
  ADD CONSTRAINT rfis_number_format
  CHECK (rfi_number ~ '-RFI-[0-9]{3}$') NOT VALID;
ALTER TABLE public.rfis VALIDATE CONSTRAINT rfis_number_format;
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with RFI events ──────────
-- Adds RFI_STATE_CHANGED (Pattern B) and RFI_GENERATED_CO (Pattern A)
-- while preserving BAN-337 v2b PAY_APP_NOTARIZATION_SKIPPED,
-- PAY_APP_SUBMITTED, and CASH_RECEIPT_RECORDED.
ALTER TABLE public.field_events
  DROP CONSTRAINT IF EXISTS field_events_event_type_ban293_check;
--> statement-breakpoint
ALTER TABLE public.field_events
  ADD CONSTRAINT field_events_event_type_ban293_check
  CHECK (
    event_type IS NULL OR event_type IN (
      'INSTALL_STEP','FIELD_ISSUE','DAILY_LOG','FIELD_MEASUREMENT','NOTE',
      'TM_CAPTURE','PHOTO_ONLY','PUNCH_LIST','SITE_VISIT','TESTING',
      'WARRANTY_CALLBACK','wo_completion',
      'PAY_APP_NOTARIZED','RETAINAGE_RELEASED','PUNCH_LIST_CLEARED',
      'NOTICE_OF_COMPLETION_FILED','JOB_COST_RECONCILED','GOLD_DATASET_ENTRY_WRITTEN',
      'DELIVERABLE_PRODUCED','TM_AUTHORIZATION_CONVERTED_TO_CO','TEST_PROJECT_RESET',
      'BACK_CHARGE_APPLIED_CROSS_PROJECT','SOV_MODIFIED','HANDOFF_PROCESSED',
      'PAY_APP_NOTARIZATION_SKIPPED','PAY_APP_SUBMITTED','CASH_RECEIPT_RECORDED',
      'SOV_STATE_CHANGED','PAY_APP_STATE_CHANGED','LIEN_WAIVER_STATE_CHANGED',
      'PROJECT_STATE_CHANGED','PUNCH_LIST_ITEM_STATE_CHANGED','WARRANTY_STATE_CHANGED',
      'TM_AUTHORIZATION_STATE_CHANGED','TM_TICKET_STATE_CHANGED',
      'TEST_PROJECT_STATE_CHANGED','BACK_CHARGE_STATE_CHANGED',
      'SUBMITTAL_STATE_CHANGED',
      'RFI_STATE_CHANGED','RFI_GENERATED_CO'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_events
  VALIDATE CONSTRAINT field_events_event_type_ban293_check;
