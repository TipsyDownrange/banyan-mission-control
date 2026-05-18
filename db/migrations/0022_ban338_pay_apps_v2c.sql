-- BAN-338 Pay Apps v2c — Lien Waivers, Joint Check, External Waivers, GC-Required Docs
-- Source: Master packet Drive 1Q6UAkiyaHB7-kFHyDaHQ5M6waqKwGTLC §6
--         AIA Billing Trunk v1.1 Drive 1gnXlGY5Hgb-psJHIj4pX5Karhetkh9ya §10
--
-- Additive only per ADR-026; no destructive table drops or column drops.
-- Extends existing pay_applications + lien_waivers with v2c columns, adds
-- joint_check_agreements + external_lien_waiver_requests +
-- gc_required_docs_checklist tables, and extends the BAN-293 field_events
-- CHECK with the v2c Pattern A event types.

-- ── pay_applications: add is_final_pay_app + current_payment_due (alias of
--    current_amount_due used by the exposure calc) ────────────────────────────
ALTER TABLE public.pay_applications
  ADD COLUMN IF NOT EXISTS is_final_pay_app boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- ── lien_waivers: extend with v2c columns. The existing state CHECK uses
--    PENDING/NOTARIZED/FILED/DELIVERED/RELEASED/VOIDED; we extend it with
--    GENERATED (the auto-gen default) and SUPERSEDED (a void-equivalent for
--    waivers replaced by a re-run). PENDING stays for back-compat with rows
--    seeded before BAN-338. ────────────────────────────────────────────────
ALTER TABLE public.lien_waivers
  ADD COLUMN IF NOT EXISTS pdf_drive_id text;
ALTER TABLE public.lien_waivers
  ADD COLUMN IF NOT EXISTS notarized_pdf_drive_id text;
ALTER TABLE public.lien_waivers
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;
ALTER TABLE public.lien_waivers
  ADD COLUMN IF NOT EXISTS notarized_at timestamptz;
ALTER TABLE public.lien_waivers
  ADD COLUMN IF NOT EXISTS filed_at timestamptz;
ALTER TABLE public.lien_waivers
  ADD COLUMN IF NOT EXISTS trigger_source text;
--> statement-breakpoint

ALTER TABLE public.lien_waivers
  DROP CONSTRAINT IF EXISTS lien_waivers_state_check;
ALTER TABLE public.lien_waivers
  ADD CONSTRAINT lien_waivers_state_check
    CHECK (state IN ('GENERATED','PENDING','NOTARIZED','FILED','DELIVERED','RELEASED','VOIDED','SUPERSEDED'));
--> statement-breakpoint

ALTER TABLE public.lien_waivers
  DROP CONSTRAINT IF EXISTS lien_waivers_trigger_source_check;
ALTER TABLE public.lien_waivers
  ADD CONSTRAINT lien_waivers_trigger_source_check
    CHECK (trigger_source IS NULL OR trigger_source IN ('AUTO_PAY_APP_SUBMITTED','AUTO_PAY_APP_PAID','MANUAL'));
--> statement-breakpoint

-- ── joint_check_agreements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.joint_check_agreements (
  joint_check_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements(engagement_id),
  manufacturer_org_id uuid NOT NULL REFERENCES public.organizations(org_id),
  manufacturer_contact_name text,
  manufacturer_contact_email text,
  manufacturer_contact_phone text,
  scope text,
  status text NOT NULL DEFAULT 'PROPOSED',
  trigger_source text NOT NULL DEFAULT 'KULA_PROPOSED',
  execution_date date,
  execution_evidence_drive_id text,
  start_date date,
  end_date date,
  notes text,
  created_by uuid REFERENCES public.users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.joint_check_agreements
  DROP CONSTRAINT IF EXISTS joint_check_agreements_status_check;
ALTER TABLE public.joint_check_agreements
  ADD CONSTRAINT joint_check_agreements_status_check
    CHECK (status IN ('PROPOSED','EXECUTED','ACTIVE','CLOSED','DISPUTED'));
--> statement-breakpoint

ALTER TABLE public.joint_check_agreements
  DROP CONSTRAINT IF EXISTS joint_check_agreements_trigger_source_check;
ALTER TABLE public.joint_check_agreements
  ADD CONSTRAINT joint_check_agreements_trigger_source_check
    CHECK (trigger_source IN ('GC_REQUIRED','MANUFACTURER_REQUESTED','KULA_PROPOSED'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS joint_check_agreements_engagement_idx
  ON public.joint_check_agreements (tenant_id, engagement_id, status);
CREATE INDEX IF NOT EXISTS joint_check_agreements_manufacturer_idx
  ON public.joint_check_agreements (tenant_id, manufacturer_org_id);
--> statement-breakpoint

-- ── external_lien_waiver_requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_lien_waiver_requests (
  external_waiver_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements(engagement_id),
  manufacturer_org_id uuid NOT NULL REFERENCES public.organizations(org_id),
  manufacturer_contact_name text,
  manufacturer_contact_email text,
  waiver_type text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED',
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid REFERENCES public.users(user_id),
  request_method text,
  request_evidence_drive_id text,
  received_at timestamptz,
  received_evidence_drive_id text,
  uploaded_at timestamptz,
  uploaded_by uuid REFERENCES public.users(user_id),
  delivered_to_gc_at timestamptz,
  delivered_to_gc_evidence_drive_id text,
  pay_app_id uuid REFERENCES public.pay_applications(pay_app_id),
  joint_check_agreement_id uuid REFERENCES public.joint_check_agreements(joint_check_id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.external_lien_waiver_requests
  DROP CONSTRAINT IF EXISTS external_lien_waiver_requests_status_check;
ALTER TABLE public.external_lien_waiver_requests
  ADD CONSTRAINT external_lien_waiver_requests_status_check
    CHECK (status IN ('REQUESTED','RECEIVED','UPLOADED','DELIVERED_TO_GC','VOIDED'));
--> statement-breakpoint

ALTER TABLE public.external_lien_waiver_requests
  DROP CONSTRAINT IF EXISTS external_lien_waiver_requests_type_check;
ALTER TABLE public.external_lien_waiver_requests
  ADD CONSTRAINT external_lien_waiver_requests_type_check
    CHECK (waiver_type IN ('CONDITIONAL_PROGRESS','UNCONDITIONAL_PROGRESS','CONDITIONAL_FINAL','UNCONDITIONAL_FINAL'));
--> statement-breakpoint

ALTER TABLE public.external_lien_waiver_requests
  DROP CONSTRAINT IF EXISTS external_lien_waiver_requests_method_check;
ALTER TABLE public.external_lien_waiver_requests
  ADD CONSTRAINT external_lien_waiver_requests_method_check
    CHECK (request_method IS NULL OR request_method IN ('EMAIL','PORTAL','MAIL','PHONE'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS external_lien_waiver_requests_engagement_idx
  ON public.external_lien_waiver_requests (tenant_id, engagement_id, status);
CREATE INDEX IF NOT EXISTS external_lien_waiver_requests_status_idx
  ON public.external_lien_waiver_requests (tenant_id, status, requested_at);
--> statement-breakpoint

-- ── gc_required_docs_checklist ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gc_required_docs_checklist (
  checklist_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements(engagement_id),
  identified_phase text,
  identified_at timestamptz,
  identified_by uuid REFERENCES public.users(user_id),
  requires_conditional_progress_waiver_from_kula boolean NOT NULL DEFAULT true,
  requires_unconditional_progress_waiver_from_kula boolean NOT NULL DEFAULT true,
  requires_conditional_final_waiver_from_kula boolean NOT NULL DEFAULT true,
  requires_unconditional_final_waiver_from_kula boolean NOT NULL DEFAULT true,
  requires_external_waivers_from_manufacturers boolean NOT NULL DEFAULT false,
  external_waiver_required_manufacturers jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_joint_check_agreement boolean NOT NULL DEFAULT false,
  joint_check_required_manufacturers jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_certificate_of_vendor_compliance boolean NOT NULL DEFAULT false,
  requires_glaziers_union_lien_clearance boolean NOT NULL DEFAULT false,
  requires_certified_payroll boolean NOT NULL DEFAULT false,
  requires_safety_documentation boolean NOT NULL DEFAULT false,
  custom_required_docs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS gc_required_docs_checklist_engagement_uidx
  ON public.gc_required_docs_checklist (tenant_id, engagement_id);
--> statement-breakpoint

ALTER TABLE public.gc_required_docs_checklist
  DROP CONSTRAINT IF EXISTS gc_required_docs_checklist_phase_check;
ALTER TABLE public.gc_required_docs_checklist
  ADD CONSTRAINT gc_required_docs_checklist_phase_check
    CHECK (identified_phase IS NULL OR identified_phase IN (
      'ESTIMATING_SCOPE_REVIEW','POST_HANDOFF_REVIEW','MID_PROJECT_AMENDMENT'
    ));
--> statement-breakpoint

-- ── Extend BAN-293 Activity Spine event_type CHECK with v2c Pattern A
--    additions: LIEN_WAIVER_GENERATED, JOINT_CHECK_AGREEMENT_STATE_CHANGED,
--    EXTERNAL_LIEN_WAIVER_STATE_CHANGED, GC_REQUIRED_DOCS_CHECKLIST_UPDATED.
--    LIEN_WAIVER_STATE_CHANGED stays in Pattern B (already present from
--    BAN-293; the existing transition route emits it with from_state/to_state).
ALTER TABLE public.field_events
  DROP CONSTRAINT IF EXISTS field_events_event_type_ban293_check;
--> statement-breakpoint
ALTER TABLE public.field_events
  ADD CONSTRAINT field_events_event_type_ban293_check
  CHECK (
    event_type IS NULL OR event_type IN (
      'INSTALL_STEP','FIELD_ISSUE','DAILY_LOG','FIELD_MEASUREMENT','NOTE',
      'TM_CAPTURE','PHOTO_ONLY','PUNCH_LIST','SITE_VISIT','TESTING',
      'WARRANTY_CALLBACK','wo_completion',
      'PAY_APP_NOTARIZED','PAY_APP_NOTARIZATION_SKIPPED','PAY_APP_SUBMITTED',
      'RETAINAGE_RELEASED','PUNCH_LIST_CLEARED',
      'NOTICE_OF_COMPLETION_FILED','JOB_COST_RECONCILED','GOLD_DATASET_ENTRY_WRITTEN',
      'DELIVERABLE_PRODUCED','TM_AUTHORIZATION_CONVERTED_TO_CO','TEST_PROJECT_RESET',
      'BACK_CHARGE_APPLIED_CROSS_PROJECT','SOV_MODIFIED','HANDOFF_PROCESSED',
      'CASH_RECEIPT_RECORDED',
      'LIEN_WAIVER_GENERATED',
      'JOINT_CHECK_AGREEMENT_STATE_CHANGED',
      'EXTERNAL_LIEN_WAIVER_STATE_CHANGED',
      'GC_REQUIRED_DOCS_CHECKLIST_UPDATED',
      'SOV_STATE_CHANGED','PAY_APP_STATE_CHANGED','LIEN_WAIVER_STATE_CHANGED',
      'PROJECT_STATE_CHANGED','PUNCH_LIST_ITEM_STATE_CHANGED','WARRANTY_STATE_CHANGED',
      'TM_AUTHORIZATION_STATE_CHANGED','TM_TICKET_STATE_CHANGED',
      'TEST_PROJECT_STATE_CHANGED','BACK_CHARGE_STATE_CHANGED',
      'SUBMITTAL_STATE_CHANGED'
    )
  ) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.field_events
  VALIDATE CONSTRAINT field_events_event_type_ban293_check;
--> statement-breakpoint

-- ── Done. All additive — no rollback artefact required. ─────────────────────
