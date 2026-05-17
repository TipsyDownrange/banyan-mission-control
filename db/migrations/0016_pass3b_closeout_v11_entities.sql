-- BAN-304 Pass 3b — Closeout v1.1 entity schema (10 tables)
-- Source: Closeout Trunk v1.1 §19.1 (with §5, §6.2, §7, §8.1, §8.6, §9.3, §11.3, §12, §13, §16.2)
-- Ratification: BAN-304 D1-D6 — Sean 2026-05-17 HST. ADR-013 documents D1-D6.
--
-- Tables created in FK-dependency order (parents before children):
--   1. project_lifecycle_states        (FK engagements, users)              audit log
--   2. punch_list_items                (FK engagements, users)
--   3. substantial_completion_certs    (FK engagements)
--   4. warranties                      (FK engagements)
--   5. warranty_claims                 (FK engagements, warranties)
--   6. notices_of_completion           (FK engagements, users)
--   7. deliverable_documents           (FK engagements, users)
--   8. unified_job_packets             (FK engagements, users)
--   9. gold_dataset_entries            (FK engagements)                     denormalised test flag
--  10. project_search_indexes          (FK engagements)
--
-- All ten tables inherit test-vs-production status from engagements.is_test_project
-- per TPA v1.0 §10.2 + Closeout v1.1 §3 inheritance model (BAN-304 D2). No per-row
-- test_data column on the parent entities. gold_dataset_entries is the documented
-- exception (BAN-304 D2) because gold-dataset rows must denormalise the parent flag
-- for downstream ML / benchmark consumers; a partial production-default index
-- excludes test rows by default per D3.
--
-- Activity Spine field_events.event_type CHECK NOT MODIFIED. Closeout events map to
-- the BAN-293 canonical 34 per D5 (PROJECT_LIFECYCLE_STATE_CHANGED in the spec is
-- canonised as PROJECT_STATE_CHANGED — Pattern B). No event emission code is added
-- this pass (D4 — deferred to Pass 3b.2 combined cutover wave). See ADR-013.
--
-- Enum types referenced below are created in 0015. Idempotency: CREATE TABLE IF
-- NOT EXISTS handles tables; ALTER TABLE ... DROP CONSTRAINT IF EXISTS + ADD
-- CONSTRAINT pattern handles CHECKs; CREATE INDEX IF NOT EXISTS handles indexes.
--
-- DOWN SQL (manual, if Sean directs): DROP TABLE IF EXISTS each, in reverse order.

-- 1. project_lifecycle_states — engagement state transition audit log
CREATE TABLE IF NOT EXISTS public.project_lifecycle_states (
  lifecycle_state_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,
  state public.project_lifecycle_state NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  exited_at timestamptz,
  reopen_reason text,
  reopen_by uuid REFERENCES public.users (user_id),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_lifecycle_states_engagement_idx
  ON public.project_lifecycle_states (tenant_id, engagement_id, entered_at);
CREATE INDEX IF NOT EXISTS project_lifecycle_states_state_idx
  ON public.project_lifecycle_states (tenant_id, state, entered_at);
--> statement-breakpoint
ALTER TABLE public.project_lifecycle_states
  DROP CONSTRAINT IF EXISTS project_lifecycle_states_reopen_pair_check;
ALTER TABLE public.project_lifecycle_states
  ADD CONSTRAINT project_lifecycle_states_reopen_pair_check
  CHECK (
    (reopen_reason IS NULL AND reopen_by IS NULL)
    OR (reopen_reason IS NOT NULL AND reopen_by IS NOT NULL)
  ) NOT VALID;
ALTER TABLE public.project_lifecycle_states VALIDATE CONSTRAINT project_lifecycle_states_reopen_pair_check;
--> statement-breakpoint

-- 2. punch_list_items — closeout punch list
CREATE TABLE IF NOT EXISTS public.punch_list_items (
  punch_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  item_number integer NOT NULL,
  source public.punch_list_item_source NOT NULL,
  source_ref text,
  description text NOT NULL,
  location jsonb NOT NULL DEFAULT '{}'::jsonb,
  category public.punch_list_item_category NOT NULL DEFAULT 'OTHER',
  responsible_party public.punch_list_responsible_party NOT NULL DEFAULT 'KULA',
  photos_required boolean NOT NULL DEFAULT false,
  photo_evidence text[] NOT NULL DEFAULT ARRAY[]::text[],
  assigned_to uuid REFERENCES public.users (user_id),
  due_date date,
  status public.punch_list_item_status NOT NULL DEFAULT 'NEW',
  completion_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  signoff_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispute_reason text,
  dispute_resolution jsonb,
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.punch_list_items
  DROP CONSTRAINT IF EXISTS punch_list_items_engagement_number_uidx;
ALTER TABLE public.punch_list_items
  ADD CONSTRAINT punch_list_items_engagement_number_uidx UNIQUE (tenant_id, engagement_id, item_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS punch_list_items_engagement_status_idx
  ON public.punch_list_items (tenant_id, engagement_id, status);
CREATE INDEX IF NOT EXISTS punch_list_items_assigned_status_idx
  ON public.punch_list_items (tenant_id, assigned_to, status);
--> statement-breakpoint

-- 3. substantial_completion_certs — substantial completion attestation
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
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.substantial_completion_certs
  DROP CONSTRAINT IF EXISTS substantial_completion_certs_engagement_uidx;
ALTER TABLE public.substantial_completion_certs
  ADD CONSTRAINT substantial_completion_certs_engagement_uidx UNIQUE (tenant_id, engagement_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS substantial_completion_certs_walkthrough_idx
  ON public.substantial_completion_certs (tenant_id, walkthrough_date);
--> statement-breakpoint

-- 4. warranties — active warranty registry
CREATE TABLE IF NOT EXISTS public.warranties (
  warranty_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  start_date date NOT NULL,
  scope_warranties jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.warranty_status NOT NULL DEFAULT 'ACTIVE',
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
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

-- 5. warranty_claims — claims against an active warranty
CREATE TABLE IF NOT EXISTS public.warranty_claims (
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  warranty_id uuid NOT NULL REFERENCES public.warranties (warranty_id) ON DELETE CASCADE,
  inbound_source public.warranty_claim_inbound_source NOT NULL,
  inbound_evidence text,
  inbound_date date NOT NULL,
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
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS warranty_claims_warranty_idx
  ON public.warranty_claims (tenant_id, warranty_id, inbound_date);
CREATE INDEX IF NOT EXISTS warranty_claims_engagement_idx
  ON public.warranty_claims (tenant_id, engagement_id, inbound_date);
CREATE INDEX IF NOT EXISTS warranty_claims_service_wo_idx
  ON public.warranty_claims (tenant_id, service_wo_id);
--> statement-breakpoint
COMMENT ON COLUMN public.warranty_claims.service_wo_id IS
  'Closeout v1.1 §8.6 + ADR-026: text reference to a service WO kID (SRV-...). Service WOs live in Sheets per ADR-026, so no Postgres FK target exists. App layer validates the SRV- prefix on write.';
--> statement-breakpoint
COMMENT ON COLUMN public.warranty_claims.back_charge_id IS
  'Closeout v1.1 §8.6: nullable uuid placeholder for the future Budget module back-charge entity. No REFERENCES clause yet because the parent table will be authored in a later Trunk.';
--> statement-breakpoint

-- 6. notices_of_completion — HRS filing record
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
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.notices_of_completion
  DROP CONSTRAINT IF EXISTS notices_of_completion_engagement_uidx;
ALTER TABLE public.notices_of_completion
  ADD CONSTRAINT notices_of_completion_engagement_uidx UNIQUE (tenant_id, engagement_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notices_of_completion_lien_deadline_idx
  ON public.notices_of_completion (tenant_id, lien_deadline_date);
--> statement-breakpoint

-- 7. deliverable_documents — closeout deliverables (as-builts, O&M manuals, etc.)
CREATE TABLE IF NOT EXISTS public.deliverable_documents (
  deliverable_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  deliverable_type public.deliverable_type NOT NULL,
  category text,
  drive_file_id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES public.users (user_id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  required_for_state public.project_lifecycle_state,
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS deliverable_documents_engagement_idx
  ON public.deliverable_documents (tenant_id, engagement_id, deliverable_type);
CREATE INDEX IF NOT EXISTS deliverable_documents_required_state_idx
  ON public.deliverable_documents (tenant_id, required_for_state)
  WHERE required_for_state IS NOT NULL;
--> statement-breakpoint

-- 8. unified_job_packets — generated unified packet snapshots
CREATE TABLE IF NOT EXISTS public.unified_job_packets (
  packet_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  template_version text NOT NULL,
  drive_file_id text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES public.users (user_id),
  sections_included jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS unified_job_packets_engagement_idx
  ON public.unified_job_packets (tenant_id, engagement_id, generated_at);
--> statement-breakpoint

-- 9. gold_dataset_entries — denormalised gold dataset (carries test_project flag)
CREATE TABLE IF NOT EXISTS public.gold_dataset_entries (
  gold_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.gold_dataset_entries
  DROP CONSTRAINT IF EXISTS gold_dataset_entries_engagement_uidx;
ALTER TABLE public.gold_dataset_entries
  ADD CONSTRAINT gold_dataset_entries_engagement_uidx UNIQUE (tenant_id, engagement_id);
--> statement-breakpoint
-- Partial production-default index per BAN-304 D3 (BAN-293 / BAN-302 pattern).
-- gold_dataset_entries is the documented exception (D2) that denormalises the
-- parent engagement.is_test_project flag because gold-dataset consumers (ML,
-- benchmarks) need it without a JOIN.
CREATE INDEX IF NOT EXISTS gold_dataset_entries_production_default_idx
  ON public.gold_dataset_entries (tenant_id, engagement_id)
  WHERE test_project = false;
--> statement-breakpoint
COMMENT ON COLUMN public.gold_dataset_entries.test_project IS
  'Closeout v1.1 §12 + BAN-304 D2: denormalised mirror of engagements.is_test_project. App layer must block insert/update with test_project=true when parent engagement.is_test_project=true is unintended; primary path keeps the two flags consistent.';
--> statement-breakpoint

-- 10. project_search_indexes — denormalised search payload for closeout search UI
CREATE TABLE IF NOT EXISTS public.project_search_indexes (
  search_index_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,
  index_payload text NOT NULL,
  last_indexed_at timestamptz NOT NULL DEFAULT now(),
  index_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.project_search_indexes
  DROP CONSTRAINT IF EXISTS project_search_indexes_engagement_uidx;
ALTER TABLE public.project_search_indexes
  ADD CONSTRAINT project_search_indexes_engagement_uidx UNIQUE (tenant_id, engagement_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_search_indexes_last_indexed_idx
  ON public.project_search_indexes (tenant_id, last_indexed_at);
--> statement-breakpoint
