-- BAN-293 / ADR-011 Amendment: Activity Spine canonical event type check
-- Repo-real choice: field_events.event_type is text in Drizzle, so enforce the
-- ratified 33-value contract with an isolated CHECK constraint instead of ALTER TYPE.
--
-- DOWN SQL:
-- ALTER TABLE public.field_events DROP CONSTRAINT IF EXISTS field_events_event_type_ban293_check;

ALTER TABLE public.field_events
  DROP CONSTRAINT IF EXISTS field_events_event_type_ban293_check;
--> statement-breakpoint
ALTER TABLE public.field_events
  ADD CONSTRAINT field_events_event_type_ban293_check
  CHECK (
    event_type IS NULL OR event_type IN (
      -- Existing live event types retained from WO-001-FA/MC 2026-04-19
      'INSTALL_STEP',
      'FIELD_ISSUE',
      'DAILY_LOG',
      'FIELD_MEASUREMENT',
      'NOTE',
      'TM_CAPTURE',
      'PHOTO_ONLY',
      'PUNCH_LIST',
      'SITE_VISIT',
      'TESTING',
      'WARRANTY_CALLBACK',

      -- Legacy transitional values retained per BAN-293 Pass 2.5 STOP discovery 2026-05-17
      'wo_completion',

      -- BAN-293 Pattern A — discrete action events
      'PAY_APP_NOTARIZED',
      'RETAINAGE_RELEASED',
      'PUNCH_LIST_CLEARED',
      'NOTICE_OF_COMPLETION_FILED',
      'JOB_COST_RECONCILED',
      'GOLD_DATASET_ENTRY_WRITTEN',
      'DELIVERABLE_PRODUCED',
      'TM_AUTHORIZATION_CONVERTED_TO_CO',
      'TEST_PROJECT_RESET',
      'BACK_CHARGE_APPLIED_CROSS_PROJECT',
      'SOV_MODIFIED',
      'HANDOFF_PROCESSED',

      -- BAN-293 Pattern B — state-machine events
      'SOV_STATE_CHANGED',
      'PAY_APP_STATE_CHANGED',
      'LIEN_WAIVER_STATE_CHANGED',
      'PROJECT_STATE_CHANGED',
      'PUNCH_LIST_ITEM_STATE_CHANGED',
      'WARRANTY_STATE_CHANGED',
      'TM_AUTHORIZATION_STATE_CHANGED',
      'TM_TICKET_STATE_CHANGED',
      'TEST_PROJECT_STATE_CHANGED',
      'BACK_CHARGE_STATE_CHANGED'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_events
  VALIDATE CONSTRAINT field_events_event_type_ban293_check;
