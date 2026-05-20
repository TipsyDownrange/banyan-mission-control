-- BAN-376 Customer Pipeline (P1) — engagements.source_inquiry_id back-link
-- Spec: Drive 1Jsio4r6XUSUMULaUdeFN27XE8ioXanQB §11 (Source Attribution
-- Preservation) + §15 (Data Model Summary) + §8.3 (Promote to Project).
--
-- Dispatch override: spec §15 wording says "projects.source_inquiry_id".  In
-- this repo "projects" is engagements with engagement_type='project' per BG1
-- Packet 003 W2 reconciliation (migration 0008).  Therefore the back-link
-- column lives on public.engagements, not on a separate projects table.
--
-- ISOLATED migration per BAN-293 rule: this file ONLY adds the new column +
-- its FK + a supporting index.  No engagement_type CHECK touch.  No
-- field_events touch.  No Activity Spine event_type CHECK touch.
--
-- DOWN SQL (manual rollback):
--   DROP INDEX IF EXISTS public.engagements_tenant_source_inquiry_idx;
--   ALTER TABLE public.engagements
--     DROP CONSTRAINT IF EXISTS engagements_source_inquiry_id_fk;
--   ALTER TABLE public.engagements DROP COLUMN IF EXISTS source_inquiry_id;

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS source_inquiry_id uuid;
--> statement-breakpoint

ALTER TABLE public.engagements
  ADD CONSTRAINT engagements_source_inquiry_id_fk
  FOREIGN KEY (source_inquiry_id)
  REFERENCES public.inquiries (inquiry_id)
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS engagements_tenant_source_inquiry_idx
  ON public.engagements (tenant_id, source_inquiry_id);
--> statement-breakpoint

COMMENT ON COLUMN public.engagements.source_inquiry_id IS
  'BAN-376 Customer Pipeline P1: FK to inquiries.inquiry_id when this engagement was promoted from an inquiry per spec §8.3. Preserves source attribution through to Gold Dataset at closeout per spec §11.';
