-- Packet 006 / BAN-196 Phase 2 audit trail table.
-- New audit surface only; does not alter service_work_orders.

CREATE TABLE IF NOT EXISTS public.wo_drift_cleanup_audit (
  cleanup_audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_run_id uuid NOT NULL,
  tenant_id uuid,
  wo_id uuid,
  wo_number text,
  field_name text NOT NULL,
  before_value text,
  after_value text,
  source_sheets_value text,
  category text NOT NULL,
  action text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wo_drift_cleanup_audit_run_idx
  ON public.wo_drift_cleanup_audit (cleanup_run_id, created_at);

CREATE INDEX IF NOT EXISTS wo_drift_cleanup_audit_wo_idx
  ON public.wo_drift_cleanup_audit (wo_number, field_name);

ALTER TABLE public.wo_drift_cleanup_audit ENABLE ROW LEVEL SECURITY;
