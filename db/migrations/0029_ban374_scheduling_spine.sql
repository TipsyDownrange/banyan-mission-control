-- BAN-374 Scheduling Spine (P1) — phases, tasks, dependencies, milestones
-- Source: Scheduling Spine Mega Dispatch (P1+P2+P3), 2026-05-19 HST
--
-- Adds four entities required by the Schedule tab in the Project Detail
-- Container:
--   * schedule_phases — top-level phase groupings (Pre-Construction,
--     Mobilization, Construction, Closeout, etc.)
--   * schedule_tasks  — work breakdown rows under a phase, with planned/
--     actual dates and percent-complete tracking
--   * schedule_dependencies — FS/SS/FF/SF DAG edges between tasks (lag
--     supported); cycle detection is enforced at the route layer
--   * schedule_milestones — date-anchored gates (substantial completion,
--     permit, inspection, owner walkthrough, retainage release, custom)
--
-- All entities are tenant-scoped and reference engagements(engagement_id)
-- consistent with the PM Trunk pattern (BAN-340 submittals, BAN-341 rfis,
-- BAN-346 handoff receipts).  Additive per ADR-026; no destructive drops.

CREATE TABLE IF NOT EXISTS public.schedule_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,

  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,

  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,

  status text NOT NULL DEFAULT 'planned',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

ALTER TABLE public.schedule_phases
  DROP CONSTRAINT IF EXISTS schedule_phases_status_check;
ALTER TABLE public.schedule_phases
  ADD CONSTRAINT schedule_phases_status_check
  CHECK (status IN ('planned','in_progress','complete','on_hold'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_phases_tenant_engagement_idx
  ON public.schedule_phases (tenant_id, engagement_id, sort_order);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.schedule_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  phase_id uuid NOT NULL REFERENCES public.schedule_phases (id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,

  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,

  planned_start date,
  planned_end date,
  planned_duration_days integer,
  actual_start date,
  actual_end date,

  percent_complete integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',

  assigned_to_user_id uuid REFERENCES public.users (user_id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

ALTER TABLE public.schedule_tasks
  DROP CONSTRAINT IF EXISTS schedule_tasks_percent_complete_check;
ALTER TABLE public.schedule_tasks
  ADD CONSTRAINT schedule_tasks_percent_complete_check
  CHECK (percent_complete BETWEEN 0 AND 100);
--> statement-breakpoint

ALTER TABLE public.schedule_tasks
  DROP CONSTRAINT IF EXISTS schedule_tasks_status_check;
ALTER TABLE public.schedule_tasks
  ADD CONSTRAINT schedule_tasks_status_check
  CHECK (status IN ('planned','in_progress','complete','blocked','on_hold'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_tasks_tenant_phase_idx
  ON public.schedule_tasks (tenant_id, phase_id, sort_order);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_tasks_tenant_engagement_idx
  ON public.schedule_tasks (tenant_id, engagement_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.schedule_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  predecessor_task_id uuid NOT NULL REFERENCES public.schedule_tasks (id) ON DELETE CASCADE,
  successor_task_id uuid NOT NULL REFERENCES public.schedule_tasks (id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'finish_to_start',
  lag_days integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.schedule_dependencies
  DROP CONSTRAINT IF EXISTS schedule_dependencies_type_check;
ALTER TABLE public.schedule_dependencies
  ADD CONSTRAINT schedule_dependencies_type_check
  CHECK (type IN ('finish_to_start','start_to_start','finish_to_finish','start_to_finish'));
--> statement-breakpoint

ALTER TABLE public.schedule_dependencies
  DROP CONSTRAINT IF EXISTS schedule_dependencies_not_self_loop;
ALTER TABLE public.schedule_dependencies
  ADD CONSTRAINT schedule_dependencies_not_self_loop
  CHECK (predecessor_task_id <> successor_task_id);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS schedule_dependencies_edge_uidx
  ON public.schedule_dependencies (predecessor_task_id, successor_task_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_dependencies_tenant_idx
  ON public.schedule_dependencies (tenant_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public.schedule_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  engagement_id uuid NOT NULL REFERENCES public.engagements (engagement_id) ON DELETE CASCADE,

  name text NOT NULL,
  type text NOT NULL,
  planned_date date,
  actual_date date,
  status text NOT NULL DEFAULT 'pending',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  DROP CONSTRAINT IF EXISTS schedule_milestones_type_check;
ALTER TABLE public.schedule_milestones
  ADD CONSTRAINT schedule_milestones_type_check
  CHECK (type IN ('substantial_completion','permit','inspection','owner_walkthrough','retainage_release','custom'));
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  DROP CONSTRAINT IF EXISTS schedule_milestones_status_check;
ALTER TABLE public.schedule_milestones
  ADD CONSTRAINT schedule_milestones_status_check
  CHECK (status IN ('pending','met','missed','waived'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_milestones_tenant_engagement_idx
  ON public.schedule_milestones (tenant_id, engagement_id, planned_date);
