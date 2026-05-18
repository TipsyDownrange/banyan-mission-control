-- BAN-336 follow-up — persist generated Pay App PDF Drive file id.
-- Additive only; safe to rerun after environments that already received the
-- column from a parallel/manual migration.

ALTER TABLE public.pay_applications
  ADD COLUMN IF NOT EXISTS pdf_drive_id text;
