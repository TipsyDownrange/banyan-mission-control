-- Packet 002.5: Business Rules — Kula Glass initial seed
-- Tenant: TEN-001 Kula Glass (00000000-0000-4000-8000-000000000001)
-- Sean-confirmed values 2026-05-11. Source: Dispatch Prompt Drive 1iIU15a8mPC-B3w0LR24IckAf9Q_KBXJ7
-- Idempotent: ON CONFLICT (tenant_id, kid) DO NOTHING
--
-- DEFERRED (do NOT add placeholder rows):
--   glazier_leadman_base_rate_hourly — LEADMAN 2025 rate pending Sean confirmation
--
-- Apply via Supabase MCP execute_sql (Kai post-merge per BQS §3.1 + §5)

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-4000-8000-000000000001';
BEGIN

INSERT INTO business_rules
  (rule_id, kid, rule_key, rule_value, value_type, description, effective_start, status, is_active, tenant_id)
VALUES

-- ── Tax & GET ────────────────────────────────────────────────────────────────
(gen_random_uuid(), 'BRL-00001', 'default_get_rate_pct',
 '4.712'::jsonb, 'percentage',
 'Hawaii GET rate, Maui-specific. NOTE: GET varies by county; multi-county lookup is a future BG2+ feature.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00002', 'default_sales_tax_pct',
 '0.0'::jsonb, 'percentage',
 'Hawaii uses GET not sales tax. Sales tax rate is 0.',
 '2026-01-01', 'canonical', true, v_tenant_id),

-- ── Overhead & Markup ────────────────────────────────────────────────────────
(gen_random_uuid(), 'BRL-00003', 'default_overhead_calculation',
 '{"type":"formula","expression":"total_labor_cost","description":"Overhead amount = 100% of total labor cost","tenant_customizable":true,"alternative_types":["flat_pct","pct_of_total_direct_cost","flat_amount"]}'::jsonb,
 'object',
 'Overhead = total_labor_cost for Kula. Stored as formula object. SaaS-tenant-configurable. NOT a flat percentage.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00004', 'default_profit_pct',
 '10.0'::jsonb, 'percentage',
 'Standard profit markup.',
 '2026-01-01', 'canonical', true, v_tenant_id),

-- ── Commercial Terms (per 2025 T&C) ─────────────────────────────────────────
(gen_random_uuid(), 'BRL-00005', 'default_retention_pct',
 '10.0'::jsonb, 'percentage',
 'Standard commercial Hawaii retention. Per 2025 T&C, reduces to 5% at 50% complete, 0% at 100%.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00006', 'default_payment_terms_days',
 '30'::jsonb, 'numeric',
 'Net 30 final payment per 2025 T&C §3.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00007', 'default_warranty_period_months',
 '12'::jsonb, 'numeric',
 'Standard 1-year workmanship warranty.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00008', 'proposal_validity_days',
 '30'::jsonb, 'numeric',
 'Per 2025 T&C §17.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00009', 'notice_of_claims_days',
 '7'::jsonb, 'numeric',
 'Per 2025 T&C §12.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00010', 'backcharge_notice_days',
 '7'::jsonb, 'numeric',
 'Per 2025 T&C §10.',
 '2026-01-01', 'canonical', true, v_tenant_id),

-- ── Glazier Journeyman Wages (Union MLA, effective 2025-07-01) ───────────────
(gen_random_uuid(), 'BRL-00011', 'glazier_journeyman_base_rate_hourly',
 '48.50'::jsonb, 'currency',
 '100% Journeyman straight-time base. Effective 2025-07-01 per Union MLA.',
 '2025-07-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00012', 'glazier_journeyman_vacation_holiday_hourly',
 '5.00'::jsonb, 'currency',
 'Per Wage Rate Breakdown 08/14/2025.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00013', 'glazier_journeyman_burdened_rate_hourly',
 '106.88'::jsonb, 'currency',
 'Fully burdened straight-time (base + vac + fringes + insurance/taxes + GET).',
 '2026-01-01', 'canonical', true, v_tenant_id),

-- ── Union Fringes ────────────────────────────────────────────────────────────
(gen_random_uuid(), 'BRL-00014', 'glazier_fringes_total_hourly',
 '35.60'::jsonb, 'currency',
 'All union fringes summed: H&W $10.53 + Pension $9.47 + Annuity $10.22 + JATF $3.00 + Admin $0.10 + Stabilization $0.15 + RHR $1.88 + HGA $0.10 + FILMP $0.10 + PAC $0.05.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00015', 'glazier_health_welfare_hourly',
 '10.53'::jsonb, 'currency',
 'Health & Welfare fringe per Union MLA.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00016', 'glazier_pension_hourly',
 '9.47'::jsonb, 'currency',
 'Pension fringe per Union MLA. Straight time; $9.27 night shift.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00017', 'glazier_annuity_hourly',
 '10.22'::jsonb, 'currency',
 'Annuity fringe per Union MLA. Straight time; $10.07 night shift.',
 '2026-01-01', 'canonical', true, v_tenant_id),

-- ── Insurance & Payroll Taxes ─────────────────────────────────────────────────
(gen_random_uuid(), 'BRL-00018', 'payroll_tax_pct',
 '14.05'::jsonb, 'percentage',
 'SS 6.2 + Medicare 1.45 + FUTA 0.6 + SUTA 5.6 (Hawaii).',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00019', 'workers_comp_pct',
 '8.08'::jsonb, 'percentage',
 'From Island Insurance Declaration sheet.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00020', 'general_liability_pct',
 '2.3148'::jsonb, 'percentage',
 'From Island Insurance Declaration sheet.',
 '2026-01-01', 'canonical', true, v_tenant_id),

-- ── Apprentice Tier Base Rates (% of $48.50 Journeyman, 2022 baseline pattern) ──
(gen_random_uuid(), 'BRL-00021', 'glazier_apprentice_rate_95pct_hourly',
 '46.08'::jsonb, 'currency',
 '95% of Journeyman base ($48.50). Per 2022 baseline apprentice scale, Sean-confirmed.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00022', 'glazier_apprentice_rate_90pct_hourly',
 '43.65'::jsonb, 'currency',
 '90% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00023', 'glazier_apprentice_rate_85pct_hourly',
 '41.23'::jsonb, 'currency',
 '85% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00024', 'glazier_apprentice_rate_80pct_hourly',
 '38.80'::jsonb, 'currency',
 '80% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00025', 'glazier_apprentice_rate_75pct_hourly',
 '36.38'::jsonb, 'currency',
 '75% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00026', 'glazier_apprentice_rate_70pct_hourly',
 '33.95'::jsonb, 'currency',
 '70% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00027', 'glazier_apprentice_rate_60pct_hourly',
 '29.10'::jsonb, 'currency',
 '60% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00028', 'glazier_apprentice_rate_55pct_hourly',
 '26.68'::jsonb, 'currency',
 '55% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00029', 'glazier_apprentice_rate_50pct_hourly',
 '24.25'::jsonb, 'currency',
 '50% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BRL-00030', 'glazier_apprentice_rate_45pct_hourly',
 '21.83'::jsonb, 'currency',
 '45% of Journeyman base ($48.50). Per 2022 baseline apprentice scale.',
 '2026-01-01', 'canonical', true, v_tenant_id)

ON CONFLICT (tenant_id, kid) DO NOTHING;

END $$;

-- Verification: should return 30 rows
-- SELECT COUNT(*) FROM business_rules WHERE tenant_id = '00000000-0000-4000-8000-000000000001';
--
-- Sanity checks:
-- SELECT rule_key, rule_value, value_type FROM business_rules WHERE tenant_id = '00000000-0000-4000-8000-000000000001' ORDER BY kid;
-- Confirm no LEADMAN or QBO placeholder rows present.
