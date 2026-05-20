-- BAN-375 Closeout v1.1.1 Phase 1 — additive subs / walks / item-history tables
-- Source: Closeout v1.1.1 Phase 1 dispatch (Sean deltas 1-3 + walks aggregator gap)
-- Builds on BAN-304 Pass 3b (migrations 0015 + 0016). All three tables FK
-- against existing tenants / engagements / users / punch_list_items.
--
-- TPA test-vs-production inheritance per Closeout v1.1 §3:
--   - subcontractors is a tenant-scoped catalog; it does NOT carry an
--     engagement reference, so it has no inherited is_test_project flag.
--   - punch_walks + punch_list_item_history inherit through their engagement /
--     punch_list_items parent. No per-row test_data column (mirrors BAN-304 D2
--     for project_lifecycle_states + punch_list_items + warranties pattern).
--
-- Activity Spine: no new event_type values are introduced here. Status
-- transitions on punch_list_items keep emitting PUNCH_LIST_ITEM_STATE_CHANGED
-- via the BAN-311 executor; punch_list_item_history is an in-row audit
-- companion (not an event-sourced log). Hard delete writes a 'hard_deleted'
-- history row before the SQL DELETE; no Activity Spine emission per the
-- BAN-293 isolation rule (event_type CHECK frozen at 34 values).
--
-- DOWN SQL (manual): DROP TABLE IF EXISTS public.punch_list_item_history;
--                    DROP TABLE IF EXISTS public.punch_walks;
--                    DROP TABLE IF EXISTS public.subcontractors;

-- 1. subcontractors — tenant-scoped subs catalog (Sean delta 2)
CREATE TABLE IF NOT EXISTS public.subcontractors (
  subcontractor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  company_name text NOT NULL,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  trade text NOT NULL,
  island text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.subcontractors
  DROP CONSTRAINT IF EXISTS subcontractors_trade_check;
ALTER TABLE public.subcontractors
  ADD CONSTRAINT subcontractors_trade_check
  CHECK (trade IN ('framer','waterproofer')) NOT VALID;
ALTER TABLE public.subcontractors VALIDATE CONSTRAINT subcontractors_trade_check;
--> statement-breakpoint
ALTER TABLE public.subcontractors
  DROP CONSTRAINT IF EXISTS subcontractors_island_check;
ALTER TABLE public.subcontractors
  ADD CONSTRAINT subcontractors_island_check
  CHECK (island IS NULL OR island IN ('maui','oahu','big_island','kauai','lanai','molokai')) NOT VALID;
ALTER TABLE public.subcontractors VALIDATE CONSTRAINT subcontractors_island_check;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS subcontractors_trade_active_idx
  ON public.subcontractors (tenant_id, trade, active);
CREATE INDEX IF NOT EXISTS subcontractors_company_idx
  ON public.subcontractors (tenant_id, company_name);
--> statement-breakpoint

-- 2. punch_walks — multi-source walkthrough aggregator (Closeout v1.1 §6.1)
CREATE TABLE IF NOT EXISTS public.punch_walks (
  walk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id),
  type text NOT NULL,
  walk_date date NOT NULL,
  walked_by uuid REFERENCES public.users (user_id),
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'in_progress',
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.punch_walks
  DROP CONSTRAINT IF EXISTS punch_walks_type_check;
ALTER TABLE public.punch_walks
  ADD CONSTRAINT punch_walks_type_check
  CHECK (type IN ('initial','reinspection','substantial_completion','owner_walkthrough','architect','final','internal_qa')) NOT VALID;
ALTER TABLE public.punch_walks VALIDATE CONSTRAINT punch_walks_type_check;
--> statement-breakpoint
ALTER TABLE public.punch_walks
  DROP CONSTRAINT IF EXISTS punch_walks_status_check;
ALTER TABLE public.punch_walks
  ADD CONSTRAINT punch_walks_status_check
  CHECK (status IN ('in_progress','complete')) NOT VALID;
ALTER TABLE public.punch_walks VALIDATE CONSTRAINT punch_walks_status_check;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS punch_walks_engagement_date_idx
  ON public.punch_walks (tenant_id, engagement_id, walk_date);
CREATE INDEX IF NOT EXISTS punch_walks_engagement_status_idx
  ON public.punch_walks (tenant_id, engagement_id, status);
--> statement-breakpoint

-- 3. punch_list_item_history — per-item audit trail (parallels
--    project_lifecycle_states pattern at item granularity)
CREATE TABLE IF NOT EXISTS public.punch_list_item_history (
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  punch_item_id uuid NOT NULL REFERENCES public.punch_list_items (punch_item_id) ON DELETE CASCADE,
  action text NOT NULL,
  actor uuid REFERENCES public.users (user_id),
  previous_status public.punch_list_item_status,
  new_status public.punch_list_item_status,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE public.punch_list_item_history
  DROP CONSTRAINT IF EXISTS punch_list_item_history_action_check;
ALTER TABLE public.punch_list_item_history
  ADD CONSTRAINT punch_list_item_history_action_check
  CHECK (action IN (
    'created','status_changed','assigned','completed','signed_off',
    'disputed','waived','hard_deleted','reopened','photo_added'
  )) NOT VALID;
ALTER TABLE public.punch_list_item_history VALIDATE CONSTRAINT punch_list_item_history_action_check;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS punch_list_item_history_item_idx
  ON public.punch_list_item_history (tenant_id, punch_item_id, created_at);
CREATE INDEX IF NOT EXISTS punch_list_item_history_action_idx
  ON public.punch_list_item_history (tenant_id, action, created_at);
--> statement-breakpoint
