-- BAN-304 Pass 3b — Closeout v1.1 entity schema (10 tables)
-- Source: Closeout Trunk Spec v1.1 §5, §6.2, §7, §8.1, §8.6, §9.3, §11.3, §12,
--         §13, §16.2, §19.1
-- Ratification: BAN-304 D1-D6 — Sean 2026-05-17 HST
--
-- Per D1: fully additive. NO modifications to existing tables (engagements,
-- field_events, AIA tables, etc.). All 10 Closeout entities inherit test status
-- from engagements.is_test_project via FK (TPA §10.2 + D2 — no per-row
-- test_data column on parent entities).
--
-- Per D3 + D2: production filtering is expressed at the engagements join
-- level — same as Pass 3a AIA precedent (ADR-012). No denormalized
-- is_test_project column added to Closeout child tables (D2 forbids per-row
-- test_data on parent entities). Partial indexes with subquery predicates
-- against engagements are NOT POSSIBLE in Postgres (CREATE INDEX WHERE
-- accepts only immutable expressions over the table's own columns); D3's
-- literal WHERE-clause pattern is therefore inapplicable to FK-inherited
-- test status. Read paths use plain composite indexes leading with
-- (tenant_id, engagement_id, ...) so production-default queries
-- (JOIN engagements ON ... WHERE engagements.is_test_project = false)
-- benefit from index seek + nested-loop join with the engagements
-- production_default partial index from BAN-302 (migration 0013).
--
-- gold_dataset_entries carries an explicit test_project boolean column with a
-- partial production-default index AND a CHECK enforcing test_project = false
-- per TPA §10.3 ("Gold Dataset entries from test projects MUST NOT be written
-- to production Gold Dataset"). Future Test Bid Sandbox (Closeout §16.5) will
-- land as a separate table, not by relaxing this constraint.
--
-- Per D4: no Activity Spine event emission code in this pass. Schema only.
-- Per D5/D6: event-contract.ts NOT modified; no migration 0017 needed for
-- event_type CHECK. PROJECT_LIFECYCLE_STATE_CHANGED in Closeout spec text →
-- canonical PROJECT_STATE_CHANGED (drift filed as BAN-305).
--
-- FK-dependency order:
--   1. project_lifecycle_states         (FK engagements)
--   2. punch_list_items                 (FK engagements, users)
--   3. substantial_completion_certs     (FK engagements)
--   4. warranties                       (FK engagements)
--   5. warranty_claims                  (FK warranties, engagements)
--   6. notices_of_completion            (FK engagements)
--   7. deliverable_documents            (FK engagements; uses project_lifecycle_state type)
--   8. unified_job_packets              (FK engagements)
--   9. gold_dataset_entries             (FK engagements; carries test_project column)
--  10. project_search_indexes           (FK engagements)
--
-- DOWN SQL (manual, if Sean directs): DROP TABLE IF EXISTS each, reverse order.

CREATE TABLE IF NOT EXISTS public.project_lifecycle_states (
  lifecycle_state_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  state public.project_lifecycle_state NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  reopen_reason text,
  reopen_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_lifecycle_states_engagement_state_idx
  ON public.project_lifecycle_states (tenant_id, engagement_id, state);
CREATE INDEX IF NOT EXISTS project_lifecycle_states_engagement_entered_idx
  ON public.project_lifecycle_states (tenant_id, engagement_id, entered_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.punch_list_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  item_number text NOT NULL,
  source public.punch_list_item_source NOT NULL,
  source_ref text,
  description text NOT NULL,
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  category public.punch_list_item_category NOT NULL DEFAULT 'OTHER',
  responsible_party public.punch_list_item_responsible_party NOT NULL DEFAULT 'KULA',
  photos_required boolean NOT NULL DEFAULT true,
  photo_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_to uuid REFERENCES public.users (user_id),
  due_date date,
  status public.punch_list_item_status NOT NULL DEFAULT 'NEW',
  completion_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  signoff_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispute_reason text,
  dispute_resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
ALTER TABLE public.punch_list_items
  DROP CONSTRAINT IF EXISTS punch_list_items_engagement_number_uidx;
ALTER TABLE public.punch_list_items
  ADD CONSTRAINT punch_list_items_engagement_number_uidx UNIQUE (tenant_id, engagement_id, item_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS punch_list_items_engagement_status_idx
  ON public.punch_list_items (tenant_id, engagement_id, status);
CREATE INDEX IF NOT EXISTS punch_list_items_assigned_idx
  ON public.punch_list_items (tenant_id, assigned_to, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.substantial_completion_certs (
  cert_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  walkthrough_date date NOT NULL,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  per_system_completion jsonb NOT NULL DEFAULT '{}'::jsonb,
  cert_evidence_drive_id text,
  gc_signoff_evidence_drive_id text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS substantial_completion_certs_engagement_idx
  ON public.substantial_completion_certs (tenant_id, engagement_id, walkthrough_date);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.warranties (
  warranty_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  start_date date NOT NULL,
  scope_warranties jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.warranty_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
ALTER TABLE public.warranties
  DROP CONSTRAINT IF EXISTS warranties_engagement_uidx;
ALTER TABLE public.warranties
  ADD CONSTRAINT warranties_engagement_uidx UNIQUE (tenant_id, engagement_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS warranties_status_idx
  ON public.warranties (tenant_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.warranty_claims (
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  warranty_id uuid NOT NULL REFERENCES public.warranties (warranty_id) ON DELETE CASCADE,
  inbound_source public.warranty_claim_inbound_source NOT NULL,
  inbound_evidence text,
  inbound_date timestamptz NOT NULL DEFAULT now(),
  reported_by jsonb NOT NULL DEFAULT '{}'::jsonb,
  issue_description text NOT NULL,
  affected_scope text,
  triage_result public.warranty_claim_triage_result,
  triage_by uuid REFERENCES public.users (user_id),
  triage_at timestamptz,
  triage_reasoning text,
  service_wo_id text,
  back_charge_id uuid,
  resolution public.warranty_claim_resolution,
  resolution_evidence_drive_id text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS warranty_claims_warranty_idx
  ON public.warranty_claims (tenant_id, warranty_id, inbound_date);
CREATE INDEX IF NOT EXISTS warranty_claims_engagement_triage_idx
  ON public.warranty_claims (tenant_id, engagement_id, triage_result);
CREATE INDEX IF NOT EXISTS warranty_claims_service_wo_idx
  ON public.warranty_claims (tenant_id, service_wo_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.notices_of_completion (
  noc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  filed_date date NOT NULL,
  recording_number text,
  recording_evidence_drive_id text,
  hrs_basis text,
  lien_deadline_days integer NOT NULL DEFAULT 45,
  lien_deadline_date date,
  filed_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notices_of_completion_engagement_idx
  ON public.notices_of_completion (tenant_id, engagement_id, filed_date);
CREATE INDEX IF NOT EXISTS notices_of_completion_lien_deadline_idx
  ON public.notices_of_completion (tenant_id, lien_deadline_date);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.deliverable_documents (
  doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  deliverable_type public.deliverable_type NOT NULL,
  category text,
  drive_file_id text NOT NULL,
  version text,
  uploaded_by uuid REFERENCES public.users (user_id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  required_for_state public.project_lifecycle_state,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS deliverable_documents_engagement_type_idx
  ON public.deliverable_documents (tenant_id, engagement_id, deliverable_type);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.unified_job_packets (
  packet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  template_version text NOT NULL,
  drive_file_id text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES public.users (user_id),
  sections_included jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS unified_job_packets_engagement_generated_idx
  ON public.unified_job_packets (tenant_id, engagement_id, generated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.gold_dataset_entries (
  entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  project_classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  bid_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  punch_list_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  warranty_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  inter_island_logistics_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_project boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gold_dataset_entries_engagement_idx
  ON public.gold_dataset_entries (tenant_id, engagement_id);
CREATE INDEX IF NOT EXISTS gold_dataset_entries_production_default_idx
  ON public.gold_dataset_entries (tenant_id, created_at)
  WHERE test_project = false;
--> statement-breakpoint
ALTER TABLE public.gold_dataset_entries
  DROP CONSTRAINT IF EXISTS gold_dataset_entries_test_project_false_check;
ALTER TABLE public.gold_dataset_entries
  ADD CONSTRAINT gold_dataset_entries_test_project_false_check
  CHECK (test_project = false) NOT VALID;
ALTER TABLE public.gold_dataset_entries
  VALIDATE CONSTRAINT gold_dataset_entries_test_project_false_check;
--> statement-breakpoint
COMMENT ON COLUMN public.gold_dataset_entries.test_project IS
  'BAN-304 / Closeout v1.1 §16.2 + TPA §10.3: must be false for all production rows. Future Test Bid Sandbox (§16.5) lands as a separate table, not by relaxing this constraint.';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.project_search_indexes (
  search_index_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  index_payload text NOT NULL,
  last_indexed_at timestamptz NOT NULL DEFAULT now(),
  index_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint
ALTER TABLE public.project_search_indexes
  DROP CONSTRAINT IF EXISTS project_search_indexes_engagement_uidx;
ALTER TABLE public.project_search_indexes
  ADD CONSTRAINT project_search_indexes_engagement_uidx UNIQUE (tenant_id, engagement_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_search_indexes_last_indexed_idx
  ON public.project_search_indexes (tenant_id, last_indexed_at);
