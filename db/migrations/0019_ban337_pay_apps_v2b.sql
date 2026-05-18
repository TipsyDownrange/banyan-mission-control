-- BAN-337 Pay Apps v2b — Notarization (manual upload primary) + Submission + Textura
-- Source: Master packet Drive 1Q6UAkiyaHB7-kFHyDaHQ5M6waqKwGTLC §5;
--         AMENDMENT 1 Drive 1soUsNfPyjjIsWWhpgphg1_FX5yCBOB8k (supersedes §5.1, §5.2, §5.4)
--
-- Additive only per ADR-026; no destructive table drops or column drops.
-- Extends existing tables (notarization_sessions, billing_format_config, textura_submissions)
-- with the v2b columns + CHECK constraint enum expansions.
--
-- Architecture (Amendment 1): manual notarization upload is the PRIMARY path.
-- Proof RON automated integration is deferred to v2.b1; the schema stays
-- forward-compatible via notarization_sessions.notarization_source.

-- ── billing_format_config: add notarization_provider ────────────────────────
ALTER TABLE public.billing_format_config
  ADD COLUMN IF NOT EXISTS notarization_provider text NOT NULL DEFAULT 'MANUAL';
--> statement-breakpoint
ALTER TABLE public.billing_format_config
  DROP CONSTRAINT IF EXISTS billing_format_config_notarization_provider_check;
ALTER TABLE public.billing_format_config
  ADD CONSTRAINT billing_format_config_notarization_provider_check
    CHECK (notarization_provider IN ('MANUAL','PROOF_RON_API','OTHER_INTEGRATION'));
--> statement-breakpoint

-- ── notarization_sessions: extend with v2b columns ──────────────────────────
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS notarization_source text NOT NULL DEFAULT 'MANUAL_UPLOAD';
--> statement-breakpoint
ALTER TABLE public.notarization_sessions
  DROP CONSTRAINT IF EXISTS notarization_sessions_source_check;
ALTER TABLE public.notarization_sessions
  ADD CONSTRAINT notarization_sessions_source_check
    CHECK (notarization_source IN ('MANUAL_UPLOAD','PROOF_RON_API','OTHER_INTEGRATION'));
--> statement-breakpoint

ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS notary_state text;
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS notary_commission_expires date;
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS notarization_date date;
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS notarization_method text;
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS signed_pdf_drive_id text;
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES public.users (user_id);
ALTER TABLE public.notarization_sessions
  ADD COLUMN IF NOT EXISTS initiated_at timestamptz;
--> statement-breakpoint

ALTER TABLE public.notarization_sessions
  DROP CONSTRAINT IF EXISTS notarization_sessions_method_check;
ALTER TABLE public.notarization_sessions
  ADD CONSTRAINT notarization_sessions_method_check
    CHECK (notarization_method IS NULL OR notarization_method IN (
      'IN_PERSON','REMOTE_ONLINE_PROOF','REMOTE_ONLINE_OTHER','MOBILE_NOTARY','OTHER'
    ));
--> statement-breakpoint

-- Expand state enum additively: keep CREATED/CANCELLED for back-compat, add INITIATED/EXPIRED
ALTER TABLE public.notarization_sessions
  DROP CONSTRAINT IF EXISTS notarization_sessions_state_check;
ALTER TABLE public.notarization_sessions
  ADD CONSTRAINT notarization_sessions_state_check
    CHECK (state IN ('CREATED','INITIATED','IN_PROGRESS','COMPLETED','FAILED','CANCELLED','EXPIRED'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS notarization_sessions_source_idx
  ON public.notarization_sessions (tenant_id, notarization_source);
--> statement-breakpoint

-- ── textura_submissions: extend with bundle + external id + status enum ─────
ALTER TABLE public.textura_submissions
  ADD COLUMN IF NOT EXISTS bundle_drive_id text;
ALTER TABLE public.textura_submissions
  ADD COLUMN IF NOT EXISTS csv_drive_id text;
ALTER TABLE public.textura_submissions
  ADD COLUMN IF NOT EXISTS notarized_pdf_drive_id text;
ALTER TABLE public.textura_submissions
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.users (user_id);
ALTER TABLE public.textura_submissions
  ADD COLUMN IF NOT EXISTS textura_submission_id_external text;
--> statement-breakpoint

-- Allow GENERATED (created prior to manual upload) + the BAN-337 status lexicon
ALTER TABLE public.textura_submissions
  DROP CONSTRAINT IF EXISTS textura_submissions_status_check;
ALTER TABLE public.textura_submissions
  ADD CONSTRAINT textura_submissions_status_check
    CHECK (submission_status IN (
      'GENERATED','UPLOADED','UPLOADED_TO_TEXTURA',
      'CONFIRMED_BY_TEXTURA','FAILED','REJECTED','REJECTED_BY_TEXTURA',
      'ACCEPTED','RESUBMITTED'
    ));
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with the v2b Pattern A
-- additions: PAY_APP_NOTARIZATION_SKIPPED, PAY_APP_SUBMITTED,
-- CASH_RECEIPT_RECORDED. Mirrors the 0018 extension pattern.
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
--> statement-breakpoint

-- ── Done. All additive — no rollback artefact required. ─────────────────────
