-- BAN-376 Customer Pipeline (P2) — inquiry_attachments table
-- Spec: Drive 1Jsio4r6XUSUMULaUdeFN27XE8ioXanQB §6 (Email path),
-- §12 (Email Connector Hook), §16 (intake-email route).
--
-- Phase 2 adds the per-inquiry attachment registry so the Outlook email
-- connector can persist:
--   • the original email body, rendered to PDF and uploaded to Drive
--     (attachment_kind = 'EMAIL_BODY')
--   • every original Outlook attachment uploaded to the same per-inquiry
--     Drive folder (attachment_kind = 'EMAIL_ATTACHMENT')
--
-- Drive remains canon for the bytes: this table stores Drive file ids and
-- metadata only. ADR-026 tenant isolation: tenant_id is required on every
-- row and forms a composite index with inquiry_id for tenant-scoped reads.
-- ON DELETE CASCADE off inquiries(inquiry_id) so retraction of an inquiry
-- collapses its attachment registry without orphan rows.
--
-- Activity Spine: NO field_events emission. The five §19 INQUIRY_* event
-- types stay ADR-gated per Charter Rule 2 — the email connector logs only
-- through inquiry_state_transitions, same pattern as the P0+1 POST route.
--
-- DOWN SQL (manual rollback if Sean directs):
--   DROP TABLE IF EXISTS public.inquiry_attachments;

CREATE TABLE IF NOT EXISTS public.inquiry_attachments (
  attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries (inquiry_id) ON DELETE CASCADE,
  attachment_kind text NOT NULL,
  drive_file_id text NOT NULL,
  original_filename text NOT NULL,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.inquiry_attachments
  ADD CONSTRAINT inquiry_attachments_kind_check
  CHECK (attachment_kind IN ('EMAIL_BODY', 'EMAIL_ATTACHMENT'));
--> statement-breakpoint

ALTER TABLE public.inquiry_attachments
  ADD CONSTRAINT inquiry_attachments_size_bytes_nonneg_check
  CHECK (size_bytes IS NULL OR size_bytes >= 0);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiry_attachments_tenant_inquiry_idx
  ON public.inquiry_attachments (tenant_id, inquiry_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiry_attachments_tenant_kind_idx
  ON public.inquiry_attachments (tenant_id, attachment_kind);
--> statement-breakpoint

COMMENT ON TABLE public.inquiry_attachments IS
  'BAN-376 Customer Pipeline P2: per-inquiry attachment registry. One row per Drive file (email-body PDF or original email attachment). Drive remains canon for the bytes; this table stores ids/metadata only.';
--> statement-breakpoint
COMMENT ON COLUMN public.inquiry_attachments.attachment_kind IS
  'EMAIL_BODY = generated PDF of the email body; EMAIL_ATTACHMENT = original Outlook attachment forwarded by the GC.';
--> statement-breakpoint
COMMENT ON COLUMN public.inquiry_attachments.drive_file_id IS
  'Google Drive file id under the per-inquiry folder BanyanOS/Inquiries/{tenant_kid}/INQ-YY-NNNN/ (or under STAGING_DRIVE_FOLDER_ID on staging).';
