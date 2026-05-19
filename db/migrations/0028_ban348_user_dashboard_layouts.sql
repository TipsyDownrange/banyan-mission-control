-- BAN-348 PM-V1.0-I — User dashboard layouts (PM Overview Dashboard).
-- Source: PM Trunk v1.0 §13 (PM Overview Dashboard).
--
-- Backs the drag-rearrange persistence layer for the PM Overview Dashboard
-- and its variants (Service PM, GM).  One row per (user_id, dashboard_kind);
-- absent row → API serves the seeded default layout for the user's role.
--
-- Without-Kai behavior: layout persistence is pure UI state in Postgres,
-- never touched by an LLM.  Widget data queries are deterministic SQL +
-- count rollups.  Kai may LATER layer summaries on top, but BanyanOS
-- default operation renders the full dashboard without Kai.
--
-- Additive per ADR-026; no destructive drops.

CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  layout_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (tenant_id),
  user_id uuid NOT NULL REFERENCES public.users (user_id),
  dashboard_kind text NOT NULL,
  layout_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_widgets text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_modified timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE public.user_dashboard_layouts
  DROP CONSTRAINT IF EXISTS user_dashboard_layouts_kind_check;
ALTER TABLE public.user_dashboard_layouts
  ADD CONSTRAINT user_dashboard_layouts_kind_check
  CHECK (dashboard_kind IN ('PM_OVERVIEW','SERVICE_PM_OVERVIEW','GM_OVERVIEW')) NOT VALID;
ALTER TABLE public.user_dashboard_layouts
  VALIDATE CONSTRAINT user_dashboard_layouts_kind_check;
--> statement-breakpoint

ALTER TABLE public.user_dashboard_layouts
  DROP CONSTRAINT IF EXISTS user_dashboard_layouts_layout_is_object;
ALTER TABLE public.user_dashboard_layouts
  ADD CONSTRAINT user_dashboard_layouts_layout_is_object
  CHECK (jsonb_typeof(layout_data) = 'object') NOT VALID;
ALTER TABLE public.user_dashboard_layouts
  VALIDATE CONSTRAINT user_dashboard_layouts_layout_is_object;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS user_dashboard_layouts_user_kind_uidx
  ON public.user_dashboard_layouts (user_id, dashboard_kind);
CREATE INDEX IF NOT EXISTS user_dashboard_layouts_tenant_kind_idx
  ON public.user_dashboard_layouts (tenant_id, dashboard_kind);
--> statement-breakpoint

-- ── Done. All additive — no rollback artefact required. ─────────────────────
