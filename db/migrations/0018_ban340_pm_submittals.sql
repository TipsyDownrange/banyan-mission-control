-- BAN-340 PM-V1.0-A — Submittal Log v1.0
-- Source: PM Trunk v1.0 §5 (Submittal Log) — ratified GC-D068 2026-05-01.
--
-- Adds the submittals entity + supporting enums. CSI-based numbering per spec:
--   PRJ-YY-NNNN-SUB-{csi_spec_section}-{csi_subsection}-{csi_sub_subsection}
-- Number itself is informationally dense; validation rules:
--   csi_spec_section:  5-digit MF95 (e.g., 08410) OR 6-digit MF18 (e.g., 084113)
--   csi_subsection:    N.N (e.g., 1.3)
--   csi_sub_subsection: single A-Z OR single 1-9
--
-- Uniqueness on (engagement_id, csi_spec_section, csi_subsection, csi_sub_subsection)
-- prevents duplicate item per project per CSI coordinate.
--
-- Activity Spine event SUBMITTAL_STATE_CHANGED (Pattern B) is added in
-- lib/activity-spine/event-contract.ts; field_events.event_type CHECK is NOT
-- modified here (the BAN-293 canon set governs the CHECK at the DB level).

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.submittal_type AS ENUM ('ACTION','PHYSICAL','CLOSEOUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.submittal_status AS ENUM (
    'REQUIRED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW',
    'APPROVED','APPROVED_AS_NOTED','REVISE_RESUBMIT','REJECTED','CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.submittal_submitted_to AS ENUM ('GC','ARCHITECT','ENGINEER','OWNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.submittal_ball_in_court AS ENUM ('SUBCONTRACTOR','GC','ARCHITECT','ENGINEER','OWNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.submittal_source AS ENUM ('PM_MANUAL','KAI_EXTRACTED_FROM_SPEC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ── submittals table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submittals (
  submittal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),

  submittal_number text NOT NULL,
  display_label text,

  csi_division text,
  csi_spec_section text NOT NULL,
  csi_subsection text NOT NULL,
  csi_sub_subsection text NOT NULL,
  spec_document_ref text,

  submittal_type public.submittal_type NOT NULL,
  description text,
  requirements_text text,
  required_quantity integer,

  status public.submittal_status NOT NULL DEFAULT 'REQUIRED',

  required_by_date date,
  submitted_to public.submittal_submitted_to,
  submitted_date date,
  reviewed_date date,
  approved_date date,
  closed_date date,

  lead_time_days integer,

  ball_in_court public.submittal_ball_in_court,
  current_assignee_user_id uuid REFERENCES public.users (user_id),

  submitted_documents text[] NOT NULL DEFAULT ARRAY[]::text[],
  review_comments_documents text[] NOT NULL DEFAULT ARRAY[]::text[],
  approved_documents text[] NOT NULL DEFAULT ARRAY[]::text[],

  external_visible boolean NOT NULL DEFAULT false,

  source public.submittal_source NOT NULL DEFAULT 'PM_MANUAL',
  kai_extraction_confidence numeric(3,2),
  kai_extraction_ref uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

-- ── Uniqueness + indexes ────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS submittals_number_uidx
  ON public.submittals (submittal_number);
CREATE UNIQUE INDEX IF NOT EXISTS submittals_engagement_csi_uidx
  ON public.submittals (engagement_id, csi_spec_section, csi_subsection, csi_sub_subsection);
CREATE INDEX IF NOT EXISTS submittals_engagement_idx
  ON public.submittals (engagement_id);
CREATE INDEX IF NOT EXISTS submittals_status_idx
  ON public.submittals (status);
CREATE INDEX IF NOT EXISTS submittals_ball_in_court_idx
  ON public.submittals (ball_in_court);
CREATE INDEX IF NOT EXISTS submittals_required_by_date_idx
  ON public.submittals (required_by_date);
--> statement-breakpoint

-- ── CSI format checks ──────────────────────────────────────────────────────
ALTER TABLE public.submittals
  DROP CONSTRAINT IF EXISTS submittals_csi_spec_section_format;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_csi_spec_section_format
  CHECK (csi_spec_section ~ '^[0-9]{5}$|^[0-9]{6}$') NOT VALID;
ALTER TABLE public.submittals VALIDATE CONSTRAINT submittals_csi_spec_section_format;

ALTER TABLE public.submittals
  DROP CONSTRAINT IF EXISTS submittals_csi_subsection_format;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_csi_subsection_format
  CHECK (csi_subsection ~ '^[0-9]+\.[0-9]+$') NOT VALID;
ALTER TABLE public.submittals VALIDATE CONSTRAINT submittals_csi_subsection_format;

ALTER TABLE public.submittals
  DROP CONSTRAINT IF EXISTS submittals_csi_sub_subsection_format;
ALTER TABLE public.submittals
  ADD CONSTRAINT submittals_csi_sub_subsection_format
  CHECK (csi_sub_subsection ~ '^[A-Z]$|^[1-9]$') NOT VALID;
ALTER TABLE public.submittals VALIDATE CONSTRAINT submittals_csi_sub_subsection_format;
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with SUBMITTAL_STATE_CHANGED
-- Drops + re-adds the canonical CHECK constraint to include the new
-- PM Pattern B event. Mirrors the original 0012 statement set.
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
      'SOV_STATE_CHANGED','PAY_APP_STATE_CHANGED','LIEN_WAIVER_STATE_CHANGED',
      'PROJECT_STATE_CHANGED','PUNCH_LIST_ITEM_STATE_CHANGED','WARRANTY_STATE_CHANGED',
      'TM_AUTHORIZATION_STATE_CHANGED','TM_TICKET_STATE_CHANGED',
      'TEST_PROJECT_STATE_CHANGED','BACK_CHARGE_STATE_CHANGED',
      'SUBMITTAL_STATE_CHANGED'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_events
  VALIDATE CONSTRAINT field_events_event_type_ban293_check;
