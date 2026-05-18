-- BAN-343 PM-V1.0-D — Meeting Intelligence (MANUAL source)
-- Source: PM Trunk v1.0 §8 (Meeting Intelligence — MANUAL only in v1.0).
--
-- Adds the meetings + meeting_attendees entities and Pattern A Activity
-- Spine events MEETING_LOGGED and MEETING_SUMMARY_UPDATED.  Auto-population
-- from Read.ai / Otter.ai / Fireflies.ai is deferred to ADR-042 Connector
-- Framework activation; v1.0 reserves the source_platform enum so the
-- connector lane is additive only.
--
-- Additive per ADR-026; no destructive drops.

DO $$ BEGIN
  CREATE TYPE public.meeting_type AS ENUM (
    'PROJECT_KICKOFF',
    'OAC',
    'DESIGN_REVIEW',
    'CONSTRUCTION_PROGRESS',
    'PRECON',
    'PRE_INSTALL',
    'PUNCHWALK',
    'PROJECT_CLOSEOUT',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.meeting_source_platform AS ENUM (
    'MANUAL',
    'READ_AI',
    'OTTER_AI',
    'FIREFLIES_AI',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.meetings (
  meeting_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid REFERENCES public.engagements (engagement_id),

  title text NOT NULL,
  meeting_date timestamptz NOT NULL,
  duration_minutes integer,

  meeting_type public.meeting_type,

  summary text,
  key_topics text[] NOT NULL DEFAULT ARRAY[]::text[],
  decisions_made text[] NOT NULL DEFAULT ARRAY[]::text[],

  transcript_drive_file_id text,
  source_recording_url text,

  source_platform public.meeting_source_platform NOT NULL DEFAULT 'MANUAL',
  source_external_id text,

  external_visible boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users (user_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_meetings_engagement
  ON public.meetings (engagement_id);
CREATE INDEX IF NOT EXISTS idx_meetings_date
  ON public.meetings (meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_type
  ON public.meetings (meeting_type);
--> statement-breakpoint

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_title_length;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_title_length
  CHECK (char_length(title) <= 200) NOT VALID;
ALTER TABLE public.meetings VALIDATE CONSTRAINT meetings_title_length;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.meeting_attendees (
  meeting_attendee_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  meeting_id uuid NOT NULL REFERENCES public.meetings (meeting_id) ON DELETE CASCADE,

  name text NOT NULL,
  email text,
  organization text,
  role text,

  is_kula_user boolean NOT NULL DEFAULT false,
  kula_user_id uuid REFERENCES public.users (user_id),

  attended boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting
  ON public.meeting_attendees (meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_kula_user
  ON public.meeting_attendees (kula_user_id)
  WHERE kula_user_id IS NOT NULL;
--> statement-breakpoint

-- A kula_user_id link implies is_kula_user=true.  is_kula_user=true is
-- allowed without a kula_user_id link because /api/users is sourced from
-- the backend Sheet today and the sheet user_id may not always resolve to
-- a public.users row.  When the Connector Framework lands and we move the
-- Sheet ↔ users sync onto Postgres we can tighten this CHECK.
ALTER TABLE public.meeting_attendees
  DROP CONSTRAINT IF EXISTS meeting_attendees_kula_user_consistency;
ALTER TABLE public.meeting_attendees
  ADD CONSTRAINT meeting_attendees_kula_user_consistency
  CHECK (kula_user_id IS NULL OR is_kula_user = true) NOT VALID;
ALTER TABLE public.meeting_attendees VALIDATE CONSTRAINT meeting_attendees_kula_user_consistency;
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with MEETING_LOGGED +
--    MEETING_SUMMARY_UPDATED.  This restores VERBAL_AGREEMENT_* and RFI_*
--    event types that were inadvertently dropped from the CHECK by
--    migration 0022 (BAN-338 PR branched before BAN-341/BAN-342 landed).
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
      'PAY_APP_NOTARIZED','PAY_APP_NOTARIZATION_SKIPPED','PAY_APP_SUBMITTED',
      'RETAINAGE_RELEASED','PUNCH_LIST_CLEARED',
      'NOTICE_OF_COMPLETION_FILED','JOB_COST_RECONCILED','GOLD_DATASET_ENTRY_WRITTEN',
      'DELIVERABLE_PRODUCED','TM_AUTHORIZATION_CONVERTED_TO_CO','TEST_PROJECT_RESET',
      'BACK_CHARGE_APPLIED_CROSS_PROJECT','SOV_MODIFIED','HANDOFF_PROCESSED',
      'CASH_RECEIPT_RECORDED',
      'RFI_GENERATED_CO',
      'VERBAL_AGREEMENT_LOGGED','VERBAL_AGREEMENT_FOLLOWUP_SENT',
      'VERBAL_AGREEMENT_FORMALIZED','VERBAL_AGREEMENT_RESOLVED',
      'LIEN_WAIVER_GENERATED',
      'JOINT_CHECK_AGREEMENT_STATE_CHANGED',
      'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      'GC_REQUIRED_DOCS_CHECKLIST_UPDATED',
      'MEETING_LOGGED','MEETING_SUMMARY_UPDATED',
      'SOV_STATE_CHANGED','PAY_APP_STATE_CHANGED','LIEN_WAIVER_STATE_CHANGED',
      'PROJECT_STATE_CHANGED','PUNCH_LIST_ITEM_STATE_CHANGED','WARRANTY_STATE_CHANGED',
      'TM_AUTHORIZATION_STATE_CHANGED','TM_TICKET_STATE_CHANGED',
      'TEST_PROJECT_STATE_CHANGED','BACK_CHARGE_STATE_CHANGED',
      'SUBMITTAL_STATE_CHANGED','RFI_STATE_CHANGED'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_events
  VALIDATE CONSTRAINT field_events_event_type_ban293_check;
--> statement-breakpoint

-- ── Done. All additive — no rollback artefact required. ─────────────────────
