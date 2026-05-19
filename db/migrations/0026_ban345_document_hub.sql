-- BAN-345 PM-V1.0-F — Document Hub (central document repository + kind tagging)
-- Source: PM Trunk v1.0 §10 (Document Hub).
--
-- Adds the document_hub_entries entity plus three Pattern A Activity Spine
-- events (DOCUMENT_UPLOADED, DOCUMENT_LINKED, DOCUMENT_SUPERSEDED).  Kai
-- integration is OPTIONAL (Charter Amendment 2): manual upload + manual
-- kind tagging is the default mode; Kai may auto-classify in Enhanced mode
-- but graceful degradation to manual always works.
--
-- Additive per ADR-026; no destructive drops.

DO $$ BEGIN
  CREATE TYPE public.document_kind AS ENUM (
    'CONTRACT',
    'SHOP_DRAWING',
    'SUBMITTAL_PACKAGE',
    'RFI_TRANSMITTAL',
    'CO_DOCUMENT',
    'PAY_APP_PDF',
    'NOC',
    'LIEN_WAIVER',
    'PUNCH_LIST',
    'WARRANTY_LETTER',
    'AS_BUILT',
    'OM_MANUAL',
    'SPEC_BOOK',
    'PHOTO_PACKAGE',
    'EMAIL_THREAD',
    'SCHEDULE_VERSION',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.document_linked_entity_type AS ENUM (
    'SUBMITTAL',
    'RFI',
    'CO',
    'PAY_APP',
    'PUNCH_LIST_ITEM',
    'VERBAL_AGREEMENT',
    'MEETING',
    'WARRANTY_CLAIM',
    'SCHEDULE_VERSION',
    'SCHEDULE_ACTIVITY',
    'TM_TICKET',
    'EXTERNAL_WAIVER',
    'FIELD_EVENT',
    'ACTION_ITEM',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.document_hub_entries (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid REFERENCES public.engagements (engagement_id),
  kid text,

  drive_file_id text NOT NULL,
  filename text NOT NULL,

  kind public.document_kind NOT NULL,
  subkind text,

  linked_entity_type public.document_linked_entity_type,
  linked_entity_id uuid,

  external_visible boolean NOT NULL DEFAULT false,

  version integer NOT NULL DEFAULT 1,
  superseded_by_document_id uuid REFERENCES public.document_hub_entries (document_id),
  is_current boolean GENERATED ALWAYS AS (superseded_by_document_id IS NULL) STORED,

  uploaded_by uuid REFERENCES public.users (user_id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  notes text,
  is_test_project boolean NOT NULL DEFAULT false
);
--> statement-breakpoint

ALTER TABLE public.document_hub_entries
  DROP CONSTRAINT IF EXISTS document_hub_entries_filename_length;
ALTER TABLE public.document_hub_entries
  ADD CONSTRAINT document_hub_entries_filename_length
  CHECK (char_length(filename) <= 500) NOT VALID;
ALTER TABLE public.document_hub_entries VALIDATE CONSTRAINT document_hub_entries_filename_length;
--> statement-breakpoint

ALTER TABLE public.document_hub_entries
  DROP CONSTRAINT IF EXISTS document_hub_entries_linked_entity_consistency;
ALTER TABLE public.document_hub_entries
  ADD CONSTRAINT document_hub_entries_linked_entity_consistency
  CHECK (
    (linked_entity_type IS NULL AND linked_entity_id IS NULL)
    OR (linked_entity_type IS NOT NULL AND linked_entity_id IS NOT NULL)
  ) NOT VALID;
ALTER TABLE public.document_hub_entries VALIDATE CONSTRAINT document_hub_entries_linked_entity_consistency;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_document_hub_tenant_kid
  ON public.document_hub_entries (tenant_id, kid);
CREATE INDEX IF NOT EXISTS idx_document_hub_tenant_engagement_kind
  ON public.document_hub_entries (tenant_id, engagement_id, kind);
CREATE INDEX IF NOT EXISTS idx_document_hub_linked_entity
  ON public.document_hub_entries (linked_entity_type, linked_entity_id)
  WHERE linked_entity_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_hub_tenant_current
  ON public.document_hub_entries (tenant_id, kind)
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_document_hub_drive_file
  ON public.document_hub_entries (drive_file_id);
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with the three Pattern A
--    DOCUMENT_* events.  Rewrite preserves all prior canonical values.
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
