-- AIA Submission Packet Export — adds per-GC cover letter template override.
-- Source: AIA Billing + SOV Trunk v1.1 §17 Six-Stage Loop Coverage Matrix
-- "Submission (Direct) → Email to GC + PDF" row.
--
-- This column carries an optional per-GC override for the cover letter that
-- prefixes the submission packet PDF/ZIP bundle. When NULL, the
-- submission-bundle route falls back to the canonical Kula template baked
-- into lib/aia/submission-bundle.ts.
--
-- Additive per ADR-026; nullable; no destructive drops.

ALTER TABLE public.billing_format_config
  ADD COLUMN IF NOT EXISTS submission_cover_letter_template text;

COMMENT ON COLUMN public.billing_format_config.submission_cover_letter_template
  IS 'Optional per-GC cover letter template body. NULL → canonical Kula template.';
