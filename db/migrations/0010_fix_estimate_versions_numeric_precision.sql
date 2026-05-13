-- BAN-236: estimate_versions percentage snapshots must hold whole-percent
-- business-rule values such as 4.712 and 10.0. numeric(5,4) only allows one
-- digit before the decimal, so 10.0 overflows.

-- ─── UP ─────────────────────────────────────────────────────────────────────
ALTER TABLE "estimate_versions"
  ALTER COLUMN "snapshot_get_rate" TYPE numeric(7,4),
  ALTER COLUMN "snapshot_overhead_markup_pct" TYPE numeric(7,4),
  ALTER COLUMN "snapshot_profit_markup_pct" TYPE numeric(7,4);

COMMENT ON COLUMN public.estimate_versions.snapshot_get_rate IS
  'Business Rules registry G&T rate snapshotted at version creation per ADR-038. Stored as whole percent, e.g. 4.712 for 4.712%. Future rule changes do not retroactively alter existing versions.';
COMMENT ON COLUMN public.estimate_versions.snapshot_overhead_markup_pct IS
  'Business Rules overhead markup snapshotted at version creation. Stored as whole percent when percentage-based, e.g. 100.0000 for 100%.';
COMMENT ON COLUMN public.estimate_versions.snapshot_profit_markup_pct IS
  'Business Rules profit markup snapshotted at version creation. Stored as whole percent, e.g. 10.0000 for 10%.';

-- ─── DOWN ───────────────────────────────────────────────────────────────────
-- ALTER TABLE "estimate_versions"
--   ALTER COLUMN "snapshot_get_rate" TYPE numeric(5,4),
--   ALTER COLUMN "snapshot_overhead_markup_pct" TYPE numeric(5,4),
--   ALTER COLUMN "snapshot_profit_markup_pct" TYPE numeric(5,4);
--
-- COMMENT ON COLUMN public.estimate_versions.snapshot_get_rate IS
--   'Business Rules registry G&T rate snapshotted at version creation per ADR-038. Future rule changes do not retroactively alter existing versions.';
-- COMMENT ON COLUMN public.estimate_versions.snapshot_overhead_markup_pct IS
--   'Business Rules overhead markup snapshotted at version creation.';
-- COMMENT ON COLUMN public.estimate_versions.snapshot_profit_markup_pct IS
--   'Business Rules profit markup snapshotted at version creation.';
