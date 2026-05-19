-- BAN-344 PM-V1.0-E — Action Item Tracker (Cross-Source Aggregator)
-- Source: PM Trunk v1.0 §9 (Action Item Tracker).
--
-- Adds the action_items entity plus three Pattern A Activity Spine events
-- (ACTION_ITEM_CREATED, ACTION_ITEM_STATE_CHANGED, ACTION_ITEM_CLOSED_AUTO).
-- The Kula PM aggregator subscribes to source-trunk Pattern B / Pattern A
-- emits and folds them into action_items rows; the source event remains the
-- canon. Kai integration is OPTIONAL (Charter Amendment 2) — manual creation
-- and the source-event subscriber both work without Kai.
--
-- Additive per ADR-026; no destructive drops.

DO $$ BEGIN
  CREATE TYPE public.action_item_source_entity_type AS ENUM (
    'SUBMITTAL',
    'RFI',
    'VERBAL_AGREEMENT',
    'MEETING',
    'PAY_APP',
    'TM_TICKET',
    'CHANGE_ORDER',
    'PUNCH_LIST_ITEM',
    'EXTERNAL_WAIVER',
    'GC_REQUIRED_DOC',
    'WARRANTY_CLAIM',
    'MANUAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.action_item_priority AS ENUM (
    'URGENT',
    'HIGH',
    'MEDIUM',
    'LOW'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE public.action_item_status AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'COMPLETED',
    'DEFERRED',
    'CANCELLED',
    'AUTO_CLOSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.action_items (
  action_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid REFERENCES public.engagements (engagement_id),

  source_event_type text NOT NULL,
  source_entity_type public.action_item_source_entity_type NOT NULL,
  source_entity_id uuid NOT NULL,

  title text NOT NULL,
  description text,
  action_required text,

  assigned_to uuid REFERENCES public.users (user_id),
  due_date date,

  priority public.action_item_priority NOT NULL DEFAULT 'MEDIUM',
  status public.action_item_status NOT NULL DEFAULT 'OPEN',
  auto_closed_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users (user_id),

  notes text
);
--> statement-breakpoint

ALTER TABLE public.action_items
  DROP CONSTRAINT IF EXISTS action_items_title_length;
ALTER TABLE public.action_items
  ADD CONSTRAINT action_items_title_length
  CHECK (char_length(title) <= 300) NOT VALID;
ALTER TABLE public.action_items VALIDATE CONSTRAINT action_items_title_length;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_action_items_tenant_engagement_status
  ON public.action_items (tenant_id, engagement_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_tenant_assignee_open
  ON public.action_items (tenant_id, assigned_to, status)
  WHERE status IN ('OPEN','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_action_items_tenant_due_open
  ON public.action_items (tenant_id, due_date)
  WHERE status IN ('OPEN','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_action_items_source_entity
  ON public.action_items (source_entity_type, source_entity_id);
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with the three Pattern A
--    ACTION_ITEM_* events.  Rewrite preserves all prior canonical values.
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
