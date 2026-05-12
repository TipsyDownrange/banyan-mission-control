-- Packet 004: Activity Spine MC Completion
-- Adds origin to public.field_events for Mission Control / Field / System provenance.
-- BAN-214 / feat/packet-004-activity-spine-mc-completion
--
-- Phase B authoring only. Apply to Supabase staging in Phase C via Supabase MCP.
--
-- Smoke queries after apply:
-- SELECT column_name, udt_name, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'field_events' AND column_name = 'origin';
--
-- SELECT count(*)::int AS invalid_origin_count
-- FROM public.field_events
-- WHERE origin IS NOT NULL AND origin NOT IN ('field','office','system');
--
-- DOWN SQL:
-- ALTER TABLE public.field_events DROP COLUMN IF EXISTS origin;
-- DROP TYPE IF EXISTS public.field_event_origin;

DO $$ BEGIN
  CREATE TYPE public.field_event_origin AS ENUM ('field', 'office', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE public.field_events
  ADD COLUMN IF NOT EXISTS origin public.field_event_origin;
--> statement-breakpoint
COMMENT ON COLUMN public.field_events.origin IS
  'Packet 004 Activity Spine event origin: field, office, or system. Nullable for legacy rows.';
