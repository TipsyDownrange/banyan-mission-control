-- BAN-376 Customer Pipeline (P0) — Inquiry entity + state-transition audit log
-- Spec: Drive 1Jsio4r6XUSUMULaUdeFN27XE8ioXanQB §5 (Inquiry Entity) + §9
-- (Lifecycle States) + §15 (Data Model Summary).
--
-- Phase 0 trunk:
--   public.inquiries                  — Universal record for any incoming
--                                       customer/GC contact, regardless of
--                                       intake channel.  Per spec §5.
--   public.inquiry_state_transitions  — Audit log of every state change.
--                                       Stands in for Activity Spine emission
--                                       until the §19 enum extension is
--                                       ratified by ADR (Charter Rule 2).
--
-- ADR-026 compliance: tenant_id required on every row; engagement-tenant
-- isolation preserved.  Drive remains canon for the inquiry source artifact
-- (source_evidence stores the Drive file ID or text reference, not the
-- payload itself).
--
-- TPA compliance per spec §17 + TPA §10.2:
--   inquiries.is_test_project BOOLEAN DEFAULT FALSE.  Default queries exclude
--   is_test_project=true unless the caller opts in.  On conversion the parent
--   engagement / WO inherits the value (handled in /api/inquiries/[id]/
--   convert-to-project + convert-to-work-order, not at the schema layer).
--
-- Activity Spine deferral: dispatch explicitly OUT-OF-SCOPE for P0+1.  No
-- field_events row is emitted and the BAN-293 event_type CHECK is NOT
-- modified.  The five new event types (INQUIRY_LOGGED, INQUIRY_STATE_CHANGED,
-- INQUIRY_ASSIGNED, INQUIRY_CONVERTED_TO_PROJECT, INQUIRY_CONVERTED_TO_
-- WORK_ORDER) ship in P0+1.5 behind G2 (Activity Spine ADR amendment).
--
-- DOWN SQL (manual rollback if Sean directs):
--   DROP TABLE IF EXISTS public.inquiry_state_transitions;
--   DROP TABLE IF EXISTS public.inquiries;

-- ─── Step 1: inquiries table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inquiries (
  inquiry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_number text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),

  -- Source attribution (spec §5 + §6)
  source text NOT NULL,
  source_detail text,
  source_evidence text,

  -- First contact (spec §5 — Anchor 1 "universal entry")
  first_contact_user_id uuid REFERENCES public.users (user_id),
  first_contact_at timestamptz,
  first_contact_method text,

  -- Customer / contact (spec §5)
  customer_name text NOT NULL,
  customer_org_id uuid REFERENCES public.organizations (org_id),
  contact_name text,
  contact_email text,
  contact_phone text,

  -- Initial classification (spec §5 + §8 routing)
  inquiry_type_initial text NOT NULL DEFAULT 'UNCLEAR',
  inquiry_description text,
  inquiry_location text,
  inquiry_scope_initial text,
  estimated_value_band text NOT NULL DEFAULT 'UNKNOWN',

  -- Assignment (spec §5)
  assigned_to_user_id uuid REFERENCES public.users (user_id),
  assigned_at timestamptz,
  assigned_role text,

  -- Lifecycle (spec §9)
  state text NOT NULL DEFAULT 'NEW',
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  state_changed_by uuid REFERENCES public.users (user_id),
  state_reason text,

  -- Conversion event (spec §10)
  conversion_event text,
  conversion_at timestamptz,
  conversion_evidence text,

  -- Conversion targets (spec §15 + dispatch override)
  --   converted_to_project_id    → engagements.engagement_id (engagement IS
  --     the project; BG1 Packet 003 W2 reconciliation, migration 0008).
  --   converted_to_work_order_id → SRV-prefixed text id of the sheets-backed
  --     Service WO per ADR-026.  No reverse FK because service_work_orders
  --     live in Google Sheets, not Postgres.
  converted_to_project_id uuid REFERENCES public.engagements (engagement_id),
  converted_to_work_order_id text,

  notes text,

  -- TPA §10.2 — test-project flag.  Default queries exclude true rows.
  is_test_project boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- ─── Step 2: CHECK constraints — enum enforcement per spec §5 ──────────────
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_source_check
  CHECK (source IN (
    'PHONE', 'EMAIL', 'WALK_IN', 'RFP',
    'WEBSITE_FORM', 'GBA_REVIEW', 'REFERRAL', 'OTHER'
  ));
--> statement-breakpoint

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_first_contact_method_check
  CHECK (first_contact_method IS NULL OR first_contact_method IN (
    'PHONE', 'EMAIL', 'WALK_IN', 'OFFICE_FORWARD'
  ));
--> statement-breakpoint

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_inquiry_type_initial_check
  CHECK (inquiry_type_initial IN ('WORK_ORDER', 'PROJECT', 'UNCLEAR'));
--> statement-breakpoint

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_estimated_value_band_check
  CHECK (estimated_value_band IN (
    'UNDER_5K', '5K_25K', '25K_100K', '100K_500K', '500K_PLUS', 'UNKNOWN'
  ));
--> statement-breakpoint

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_assigned_role_check
  CHECK (assigned_role IS NULL OR assigned_role IN (
    'PM', 'SERVICE_PM', 'ESTIMATOR', 'GM', 'ADMIN'
  ));
--> statement-breakpoint

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_state_check
  CHECK (state IN (
    'NEW', 'IN_DISCUSSION', 'QUOTED', 'AWARDED',
    'LOST', 'DEFERRED', 'CONVERTED'
  ));
--> statement-breakpoint

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_conversion_event_check
  CHECK (conversion_event IS NULL OR conversion_event IN (
    'SIGNED_PROPOSAL', 'VERBAL_GO_AHEAD', 'DOWN_PAYMENT', 'PURCHASE_ORDER',
    'CONTRACT', 'NOTICE_TO_PROCEED', 'EMAIL_AWARD', 'OTHER'
  ));
--> statement-breakpoint

-- Tenant + number uniqueness for INQ-YY-NNNN human-friendly references.
ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_tenant_number_uidx UNIQUE (tenant_id, inquiry_number);
--> statement-breakpoint

-- ─── Step 3: indexes per spec §5 ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS inquiries_tenant_state_idx
  ON public.inquiries (tenant_id, state);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiries_tenant_assigned_state_idx
  ON public.inquiries (tenant_id, assigned_to_user_id, state);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiries_tenant_first_contact_idx
  ON public.inquiries (tenant_id, first_contact_user_id, created_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiries_tenant_source_idx
  ON public.inquiries (tenant_id, source);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiries_conversion_targets_idx
  ON public.inquiries (converted_to_project_id, converted_to_work_order_id);
--> statement-breakpoint

-- TPA §10.2 — partial index for the default production view.
CREATE INDEX IF NOT EXISTS inquiries_production_default_idx
  ON public.inquiries (tenant_id, state)
  WHERE is_test_project = false;
--> statement-breakpoint

-- ─── Step 4: inquiry_state_transitions audit table ──────────────────────────
CREATE TABLE IF NOT EXISTS public.inquiry_state_transitions (
  transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries (inquiry_id) ON DELETE CASCADE,
  from_state text,
  to_state text NOT NULL,
  changed_by uuid REFERENCES public.users (user_id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
--> statement-breakpoint

ALTER TABLE public.inquiry_state_transitions
  ADD CONSTRAINT inquiry_state_transitions_from_state_check
  CHECK (from_state IS NULL OR from_state IN (
    'NEW', 'IN_DISCUSSION', 'QUOTED', 'AWARDED',
    'LOST', 'DEFERRED', 'CONVERTED'
  ));
--> statement-breakpoint

ALTER TABLE public.inquiry_state_transitions
  ADD CONSTRAINT inquiry_state_transitions_to_state_check
  CHECK (to_state IN (
    'NEW', 'IN_DISCUSSION', 'QUOTED', 'AWARDED',
    'LOST', 'DEFERRED', 'CONVERTED'
  ));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS inquiry_state_transitions_inquiry_idx
  ON public.inquiry_state_transitions (tenant_id, inquiry_id, changed_at);
--> statement-breakpoint

-- ─── Step 5: comments per ADR-027 ───────────────────────────────────────────
COMMENT ON TABLE public.inquiries IS
  'BAN-376 Customer Pipeline P0: universal inquiry record per spec §5. One row per incoming customer/GC contact regardless of intake channel.';
--> statement-breakpoint
COMMENT ON COLUMN public.inquiries.converted_to_project_id IS
  'FK engagements.engagement_id when the inquiry is promoted to a project (engagement_type=project). Set by /api/inquiries/[id]/convert-to-project.';
--> statement-breakpoint
COMMENT ON COLUMN public.inquiries.converted_to_work_order_id IS
  'SRV-prefixed text id of the sheets-backed Service WO per ADR-026. No reverse FK because service_work_orders live in Google Sheets. Set by /api/inquiries/[id]/convert-to-work-order.';
--> statement-breakpoint
COMMENT ON TABLE public.inquiry_state_transitions IS
  'BAN-376 Customer Pipeline P0: audit log of inquiry.state changes. Stands in for Activity Spine emission until G2 ADR amendment ratifies the five INQUIRY_* event types in §19.';
