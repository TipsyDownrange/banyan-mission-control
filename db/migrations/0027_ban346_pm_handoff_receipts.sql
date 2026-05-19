-- BAN-346 PM-V1.0-G — PM Handoff Receipt (Estimating → PM handoff acceptance)
-- Source: PM Trunk v1.0 §11 (PM Handoff Receipt).
--
-- Adds the pm_handoff_receipts entity plus two Pattern A Activity Spine
-- events (HANDOFF_RECEIPT_CREATED, HANDOFF_RECEIPT_STATE_CHANGED).  Kai
-- integration is OPTIONAL (Charter Amendment 2): PMs manually review the
-- handoff packet, type gap notes, and click accept/reject.  Kai may layer
-- gap detection on top in Enhanced mode without changing the canon.
--
-- Decision lock Q6=A — Critical-Gap Policy: PMs may always accept, even
-- with unresolved gaps.  Gaps are flagged via state distinction
-- (accepted vs accepted_with_gaps) but never block acceptance.
--
-- Additive per ADR-026; no destructive drops.

DO $$ BEGIN
  CREATE TYPE public.pm_handoff_state AS ENUM (
    'pending_review',
    'reviewed_complete',
    'accepted',
    'rejected_with_gaps',
    'accepted_with_gaps'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.pm_handoff_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  kid text,
  engagement_id uuid REFERENCES public.engagements (engagement_id),
  estimate_version_id text,

  state public.pm_handoff_state NOT NULL DEFAULT 'pending_review',

  submitted_by_user_id uuid REFERENCES public.users (user_id),
  submitted_at timestamptz NOT NULL DEFAULT now(),

  reviewed_by_user_id uuid REFERENCES public.users (user_id),
  reviewed_at timestamptz,

  accepted_at timestamptz,
  rejected_at timestamptz,

  critical_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewer_notes text,

  packet_drive_file_id text,

  is_test_project boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.pm_handoff_receipts
  DROP CONSTRAINT IF EXISTS pm_handoff_receipts_critical_gaps_is_array;
ALTER TABLE public.pm_handoff_receipts
  ADD CONSTRAINT pm_handoff_receipts_critical_gaps_is_array
  CHECK (jsonb_typeof(critical_gaps) = 'array') NOT VALID;
ALTER TABLE public.pm_handoff_receipts VALIDATE CONSTRAINT pm_handoff_receipts_critical_gaps_is_array;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_pm_handoff_receipts_tenant_kid
  ON public.pm_handoff_receipts (tenant_id, kid);
CREATE INDEX IF NOT EXISTS idx_pm_handoff_receipts_tenant_state_pending
  ON public.pm_handoff_receipts (tenant_id, state)
  WHERE state IN ('pending_review','reviewed_complete');
CREATE INDEX IF NOT EXISTS idx_pm_handoff_receipts_tenant_engagement
  ON public.pm_handoff_receipts (tenant_id, engagement_id);
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with the two Pattern A
--    HANDOFF_RECEIPT_* events.  Rewrite preserves all prior canonical values.
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
      'ACTION_ITEM_CREATED','ACTION_ITEM_STATE_CHANGED','ACTION_ITEM_CLOSED_AUTO',
      'DOCUMENT_UPLOADED','DOCUMENT_LINKED','DOCUMENT_SUPERSEDED',
      'HANDOFF_RECEIPT_CREATED','HANDOFF_RECEIPT_STATE_CHANGED',
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
