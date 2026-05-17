-- BAN-293 / ADR-011 Amendment: Activity Spine test data flag
-- Adds test_data to public.field_events for Test Project Architecture §9.1.
-- Existing rows are production by definition and are backfilled false.
--
-- DOWN SQL:
-- DROP INDEX IF EXISTS public.field_events_production_default_idx;
-- ALTER TABLE public.field_events DROP COLUMN IF EXISTS test_data;

ALTER TABLE public.field_events
  ADD COLUMN IF NOT EXISTS test_data boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE public.field_events
SET test_data = false
WHERE test_data IS DISTINCT FROM false;
--> statement-breakpoint
COMMENT ON COLUMN public.field_events.test_data IS
  'BAN-293 / TPA §9.1: true when Activity Spine event was emitted from test-project context; production/default queries exclude true rows.';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS field_events_production_default_idx
  ON public.field_events (event_type, created_at)
  WHERE test_data = false;
