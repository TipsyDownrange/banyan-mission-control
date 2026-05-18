-- BAN-336 Pay Apps v2a — Pay App Core schema deltas
-- Source: PAY_APPS_v2_MASTER_DISPATCH_2026-05-18.md §4.3
-- Additive only per ADR-026; no DROP, no destructive ALTER.
--
-- Deltas:
--  1. schedule_of_values (= "sov_line_items" in spec): parent_line_id FK self,
--     display_item_number text, textura_phase_code integer.
--  2. pay_applications: billing_format enum, rejection_actor_id, rejection_at.
--     (rejection_reason already present.)
--  3. pay_app_line_items: add additive unique (pay_app_id, sov_line_id) so that
--     the BAN-336 create wizard can pre-fill one row per SOV line. The existing
--     (pay_app_id, line_number) unique stays. Partial index — sov_line_id may be
--     NULL on TM-driven lines.

ALTER TABLE public.schedule_of_values
  ADD COLUMN IF NOT EXISTS parent_line_id uuid;
--> statement-breakpoint
ALTER TABLE public.schedule_of_values
  DROP CONSTRAINT IF EXISTS schedule_of_values_parent_line_fk;
ALTER TABLE public.schedule_of_values
  ADD CONSTRAINT schedule_of_values_parent_line_fk
    FOREIGN KEY (parent_line_id)
    REFERENCES public.schedule_of_values (sov_line_id)
    ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE public.schedule_of_values
  ADD COLUMN IF NOT EXISTS display_item_number text;
--> statement-breakpoint
ALTER TABLE public.schedule_of_values
  ADD COLUMN IF NOT EXISTS textura_phase_code integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedule_of_values_parent_line_idx
  ON public.schedule_of_values (tenant_id, parent_line_id);
--> statement-breakpoint

ALTER TABLE public.pay_applications
  ADD COLUMN IF NOT EXISTS billing_format text NOT NULL DEFAULT 'AIA_G702_G703';
--> statement-breakpoint
ALTER TABLE public.pay_applications
  DROP CONSTRAINT IF EXISTS pay_applications_billing_format_check;
ALTER TABLE public.pay_applications
  ADD CONSTRAINT pay_applications_billing_format_check
    CHECK (billing_format IN (
      'AIA_G702_G703',
      'CUSTOM_TEMPLATE_AIA_STYLE',
      'CUSTOM_TEMPLATE_SCHEDULE_ABC',
      'TEXTURA_CSV_EXPORT'
    ));
--> statement-breakpoint
ALTER TABLE public.pay_applications
  ADD COLUMN IF NOT EXISTS rejection_actor_id uuid;
--> statement-breakpoint
ALTER TABLE public.pay_applications
  ADD COLUMN IF NOT EXISTS rejection_at timestamptz;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS pay_app_line_items_pay_app_sov_uidx
  ON public.pay_app_line_items (pay_app_id, sov_line_id)
  WHERE sov_line_id IS NOT NULL;
--> statement-breakpoint
