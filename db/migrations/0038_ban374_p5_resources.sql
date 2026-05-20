-- BAN-374 Scheduling Spine P5 — Crew / resource assignments
-- Source: April 4 Schedule + Procurement + T&M spec, Drive 1vWA6zwxI2tQ9us8OrtuHuUohe0ZeyASt
--   §B5  "Construction Schedule Module — Kula Glass Predecessors"
--        (crew mobilized treated as a predecessor)
--   §C   "The 3-Week Lookahead → Dispatch Integration"
--        (Planning Slot, crew confirmation system foundation)
--
-- BAN-374 P1-P3 (PR #208) shipped schedule_tasks; P4 (PR #212) layered the
-- Hawaii overlays.  This dispatch adds the join table that maps users
-- (crew members) to schedule_tasks with role, allocation %, and soft-remove
-- history so historical assignments are preserved.
--
-- The dispatch specifies a join-column name of schedule_task_id; the
-- target table's PK column is `id` (BAN-374 P1 migration 0029), so the FK
-- references public.schedule_tasks (id) while keeping the join-column name
-- the dispatch asked for.  Same for users(user_id) which is the real PK.
--
-- Additive per ADR-026; no destructive drops.
-- Tenant scoping preserved per the BAN-374 pattern.

CREATE TABLE IF NOT EXISTS public.schedule_task_resources (
  task_resource_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  schedule_task_id uuid NOT NULL REFERENCES public.schedule_tasks (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (user_id),

  role_on_task text,
  allocation_percent integer NOT NULL DEFAULT 100,

  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL REFERENCES public.users (user_id),
  removed_at timestamptz,
  removed_by uuid REFERENCES public.users (user_id),
  notes text
);
--> statement-breakpoint

ALTER TABLE public.schedule_task_resources
  DROP CONSTRAINT IF EXISTS schedule_task_resources_allocation_check;
ALTER TABLE public.schedule_task_resources
  ADD CONSTRAINT schedule_task_resources_allocation_check
  CHECK (allocation_percent BETWEEN 1 AND 100);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_task_resources_tenant_task_idx
  ON public.schedule_task_resources (tenant_id, schedule_task_id, removed_at);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_task_resources_tenant_user_idx
  ON public.schedule_task_resources (tenant_id, user_id, removed_at);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS schedule_task_resources_active_uidx
  ON public.schedule_task_resources (schedule_task_id, user_id)
  WHERE removed_at IS NULL;
--> statement-breakpoint
