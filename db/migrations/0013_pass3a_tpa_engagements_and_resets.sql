-- BAN-302 Pass 3a — TPA engagements column additions + test_project_resets audit table
-- Source: TPA v1.0 §11.1 (engagements column additions), §6.5 + §11.2 (resets audit log)
-- Ratification: BAN-302 D1 (flag-on-existing-engagements) + D2 (column additions authorized) — Sean 2026-05-17 HST
--
-- All operations are additive and idempotent. engagements table modified ONLY by the
-- three D2-authorized columns + one CHECK + one partial index. All other engagements
-- columns, constraints, and indexes preserved verbatim.
--
-- DOWN SQL (manual, if Sean directs):
--   DROP INDEX IF EXISTS public.engagements_production_default_idx;
--   ALTER TABLE public.engagements DROP CONSTRAINT IF EXISTS engagements_test_project_created_by_required_check;
--   ALTER TABLE public.engagements DROP COLUMN IF EXISTS test_project_purpose;
--   ALTER TABLE public.engagements DROP COLUMN IF EXISTS test_project_created_by;
--   ALTER TABLE public.engagements DROP COLUMN IF EXISTS is_test_project;
--   DROP TABLE IF EXISTS public.test_project_resets;

ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS is_test_project boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS test_project_created_by uuid REFERENCES public.users (user_id);
--> statement-breakpoint
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS test_project_purpose text;
--> statement-breakpoint
COMMENT ON COLUMN public.engagements.is_test_project IS
  'BAN-302 / TPA §11.1: true marks engagement as a test project — child entities inherit test status; production aggregates default-exclude.';
--> statement-breakpoint
COMMENT ON COLUMN public.engagements.test_project_created_by IS
  'BAN-302 / TPA §11.1: required when is_test_project = true (audit ownership of test-project creation).';
--> statement-breakpoint
COMMENT ON COLUMN public.engagements.test_project_purpose IS
  'BAN-302 / TPA §11.1: optional free-text description of what the test project is for.';
--> statement-breakpoint
ALTER TABLE public.engagements
  DROP CONSTRAINT IF EXISTS engagements_test_project_created_by_required_check;
--> statement-breakpoint
ALTER TABLE public.engagements
  ADD CONSTRAINT engagements_test_project_created_by_required_check
  CHECK (is_test_project = false OR test_project_created_by IS NOT NULL) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.engagements
  VALIDATE CONSTRAINT engagements_test_project_created_by_required_check;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS engagements_production_default_idx
  ON public.engagements (tenant_id, status)
  WHERE is_test_project = false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.test_project_resets (
  reset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,
  reset_by uuid NOT NULL REFERENCES public.users (user_id),
  reset_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  child_records_deleted jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS test_project_resets_engagement_idx
  ON public.test_project_resets (tenant_id, engagement_id, reset_at);
--> statement-breakpoint
COMMENT ON TABLE public.test_project_resets IS
  'BAN-302 / TPA §6.5 + §11.2: audit log of test-project reset operations. One row per reset; child_records_deleted captures per-entity delete counts.';
