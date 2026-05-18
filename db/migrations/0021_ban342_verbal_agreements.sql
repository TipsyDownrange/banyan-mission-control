-- BAN-342 PM-V1.0-C — Verbal Agreement Log
-- Source: PM Trunk v1.0 §7 (Verbal Agreement Log) + §10 Contextual Document Surfacing.
--
-- Adds the verbal_agreements entity and Pattern A Activity Spine events:
-- VERBAL_AGREEMENT_LOGGED, VERBAL_AGREEMENT_FOLLOWUP_SENT,
-- VERBAL_AGREEMENT_FORMALIZED, VERBAL_AGREEMENT_RESOLVED.

DO $$ BEGIN
  CREATE TYPE public.verbal_agreement_type AS ENUM (
    'SCOPE_CHANGE',
    'SCHEDULE_AGREEMENT',
    'T_M_AUTHORIZATION',
    'DESIGN_CLARIFICATION',
    'PAYMENT_TERM',
    'DELIVERY_COMMITMENT',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.verbal_agreement_status AS ENUM (
    'LOGGED',
    'FOLLOWED_UP',
    'FORMALIZED',
    'DISPUTED',
    'RESOLVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.verbal_agreements (
  verbal_agreement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),

  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by uuid REFERENCES public.users (user_id),
  occurred_at timestamptz NOT NULL DEFAULT now(),

  subject text NOT NULL,
  external_party_org text NOT NULL,
  external_party_contact_name text,
  external_party_contact_role text,
  external_party_contact_email text,
  external_party_contact_phone text,

  agreement_type public.verbal_agreement_type NOT NULL DEFAULT 'OTHER',
  cost_impact_estimate numeric(14,2),
  schedule_impact_days integer,

  agreement_summary text NOT NULL,
  context_or_circumstances text,

  audio_recording_drive_id text,
  photo_documentation_drive_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  written_followup_email_drive_id text,

  followup_email_sent boolean NOT NULL DEFAULT false,
  followup_email_sent_date date,
  formal_documentation_generated boolean NOT NULL DEFAULT false,
  formal_documentation_ref uuid,
  formal_documentation_type text,

  status public.verbal_agreement_status NOT NULL DEFAULT 'LOGGED',
  external_visible boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS verbal_agreements_engagement_idx
  ON public.verbal_agreements (engagement_id);
CREATE INDEX IF NOT EXISTS verbal_agreements_status_idx
  ON public.verbal_agreements (status);
CREATE INDEX IF NOT EXISTS verbal_agreements_type_idx
  ON public.verbal_agreements (agreement_type);
CREATE INDEX IF NOT EXISTS verbal_agreements_occurred_idx
  ON public.verbal_agreements (occurred_at DESC);
--> statement-breakpoint

ALTER TABLE public.verbal_agreements
  DROP CONSTRAINT IF EXISTS verbal_agreements_subject_length;
ALTER TABLE public.verbal_agreements
  ADD CONSTRAINT verbal_agreements_subject_length
  CHECK (char_length(subject) <= 200) NOT VALID;
ALTER TABLE public.verbal_agreements VALIDATE CONSTRAINT verbal_agreements_subject_length;
--> statement-breakpoint

ALTER TABLE public.verbal_agreements
  DROP CONSTRAINT IF EXISTS verbal_agreements_formal_doc_type_check;
ALTER TABLE public.verbal_agreements
  ADD CONSTRAINT verbal_agreements_formal_doc_type_check
  CHECK (
    formal_documentation_type IS NULL
    OR formal_documentation_type IN ('CHANGE_ORDER','TM_TICKET','RFI')
  ) NOT VALID;
ALTER TABLE public.verbal_agreements VALIDATE CONSTRAINT verbal_agreements_formal_doc_type_check;
--> statement-breakpoint

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
      'RFI_GENERATED_CO',
      'VERBAL_AGREEMENT_LOGGED','VERBAL_AGREEMENT_FOLLOWUP_SENT',
      'VERBAL_AGREEMENT_FORMALIZED','VERBAL_AGREEMENT_RESOLVED',
      'SOV_STATE_CHANGED','PAY_APP_STATE_CHANGED','LIEN_WAIVER_STATE_CHANGED',
      'PROJECT_STATE_CHANGED','PUNCH_LIST_ITEM_STATE_CHANGED','WARRANTY_STATE_CHANGED',
      'TM_AUTHORIZATION_STATE_CHANGED','TM_TICKET_STATE_CHANGED',
      'TEST_PROJECT_STATE_CHANGED','BACK_CHARGE_STATE_CHANGED',
      'SUBMITTAL_STATE_CHANGED',
      'RFI_STATE_CHANGED'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_events
  VALIDATE CONSTRAINT field_events_event_type_ban293_check;
