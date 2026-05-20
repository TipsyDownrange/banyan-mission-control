-- BAN-375 Closeout v1.1.1 Phase 1 — additive ALTERs on punch_list_items
-- Source: Closeout v1.1.1 Phase 1 dispatch
-- Adds (Sean deltas 1-3 + walks linkage):
--   trade             public.punch_trade NOT NULL DEFAULT 'other'   -- delta 1
--   assigned_to_sub_id uuid REFERENCES subcontractors                -- delta 2
--   walk_id           uuid REFERENCES punch_walks                    -- §6.1 link
--   waived_reason     text                                           -- delta 3 (soft)
--
-- All columns are nullable or default-bearing so existing rows continue to
-- satisfy the table contract without backfill. Indexes are partial where the
-- column is nullable (cardinality optimisation).

ALTER TABLE public.punch_list_items
  ADD COLUMN IF NOT EXISTS trade public.punch_trade NOT NULL DEFAULT 'other';
--> statement-breakpoint
ALTER TABLE public.punch_list_items
  ADD COLUMN IF NOT EXISTS assigned_to_sub_id uuid REFERENCES public.subcontractors (subcontractor_id);
--> statement-breakpoint
ALTER TABLE public.punch_list_items
  ADD COLUMN IF NOT EXISTS walk_id uuid REFERENCES public.punch_walks (walk_id);
--> statement-breakpoint
ALTER TABLE public.punch_list_items
  ADD COLUMN IF NOT EXISTS waived_reason text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS punch_list_items_trade_idx
  ON public.punch_list_items (tenant_id, trade);
CREATE INDEX IF NOT EXISTS punch_list_items_sub_idx
  ON public.punch_list_items (tenant_id, assigned_to_sub_id)
  WHERE assigned_to_sub_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS punch_list_items_walk_idx
  ON public.punch_list_items (tenant_id, walk_id)
  WHERE walk_id IS NOT NULL;
--> statement-breakpoint
