-- BAN-374 Scheduling Spine P4 — Hawaii overlays
-- Source: April 4 Schedule + Procurement + T&M spec, Drive 1vWA6zwxI2tQ9us8OrtuHuUohe0ZeyASt
--   §A2 "The 3-Week Lookahead — The Dispatch Trigger"
--   §B5 "Construction Schedule Module — GC predecessor logic"
--   §C   "3-Week Lookahead Generation — outer island protocol"
--   §D2  "Procurement as a Schedule Predecessor — Matson freight"
--
-- Hooks defined as deferred in BAN-374 PR #208 (ScheduleGanttView.tsx:28-31)
-- are wired here:
--   - interIslandTravelFactor  → schedule_tasks.task_island + duration_with_travel_factor
--   - permitTimelineOverlay    → schedule_milestones.milestone_kind + permit_* dates
--   - matsonFreightOverlay     → new tenant_freight_calendar table
--
-- Tenant scoping preserved; engagements.island enum (island_code) is reused
-- via text mirror (schedule_tasks.task_island) to keep schedule_tasks
-- additive and avoid coupling to an ALTER TYPE migration.  Additive per
-- ADR-026; no destructive drops.

-- ─── A. Inter-island travel factor on schedule_tasks ────────────────────────

ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS task_island text;
--> statement-breakpoint

ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS duration_with_travel_factor numeric(6,2);
--> statement-breakpoint

ALTER TABLE public.schedule_tasks
  DROP CONSTRAINT IF EXISTS schedule_tasks_task_island_check;
ALTER TABLE public.schedule_tasks
  ADD CONSTRAINT schedule_tasks_task_island_check
  CHECK (
    task_island IS NULL
    OR task_island IN ('maui','kauai','oahu','big_island','lanai','molokai','unknown')
  );
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_tasks_tenant_task_island_idx
  ON public.schedule_tasks (tenant_id, task_island);
--> statement-breakpoint

-- ─── B. Permit milestone kind + dates on schedule_milestones ────────────────

ALTER TABLE public.schedule_milestones
  ADD COLUMN IF NOT EXISTS milestone_kind text NOT NULL DEFAULT 'standard';
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  ADD COLUMN IF NOT EXISTS permit_authority text;
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  ADD COLUMN IF NOT EXISTS permit_application_date date;
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  ADD COLUMN IF NOT EXISTS permit_estimated_approval_date date;
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  ADD COLUMN IF NOT EXISTS permit_actual_approval_date date;
--> statement-breakpoint

ALTER TABLE public.schedule_milestones
  DROP CONSTRAINT IF EXISTS schedule_milestones_kind_check;
ALTER TABLE public.schedule_milestones
  ADD CONSTRAINT schedule_milestones_kind_check
  CHECK (milestone_kind IN ('standard','permit','inspection','gc_clearance','matson_freight'));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS schedule_milestones_tenant_kind_idx
  ON public.schedule_milestones (tenant_id, milestone_kind);
--> statement-breakpoint

-- ─── C. Matson freight calendar (tenant-scoped) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.tenant_freight_calendar (
  freight_calendar_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),

  carrier text NOT NULL DEFAULT 'Matson',
  route text NOT NULL,
  sailing_date date NOT NULL,
  arrival_date date NOT NULL,
  cutoff_date date NOT NULL,
  notes text,

  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (user_id),
  updated_by uuid REFERENCES public.users (user_id)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS tenant_freight_calendar_tenant_route_idx
  ON public.tenant_freight_calendar (tenant_id, route, sailing_date);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS tenant_freight_calendar_tenant_sailing_idx
  ON public.tenant_freight_calendar (tenant_id, sailing_date)
  WHERE deleted_at IS NULL;
--> statement-breakpoint
