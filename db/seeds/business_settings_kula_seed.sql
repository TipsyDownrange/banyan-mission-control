-- Packet 002.5: Business Settings — Kula Glass initial seed
-- Tenant: TEN-001 Kula Glass (00000000-0000-4000-8000-000000000001)
-- Sean-confirmed values 2026-05-11. Source: Dispatch Prompt Drive 1iIU15a8mPC-B3w0LR24IckAf9Q_KBXJ7
-- Idempotent: ON CONFLICT (tenant_id, setting_key) DO NOTHING
--
-- DEFERRED (do NOT add placeholder rows):
--   tenant_qbo_company_id — Sean providing QBO Realm ID 2026-05-12
--
-- Apply via Supabase MCP execute_sql (Kai post-merge per BQS §3.1 + §5)

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-4000-8000-000000000001';
BEGIN

INSERT INTO business_settings
  (setting_id, kid, setting_key, setting_value, value_type, description, status, is_active, tenant_id)
VALUES

(gen_random_uuid(), 'BST-00001', 'tenant_business_legal_name',
 '"Kula Glass Company, Inc."'::jsonb, 'string',
 'Legal entity name for documents, proposals, T&C headers.',
 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BST-00002', 'estimate_version_require_freeze_before_send',
 'true'::jsonb, 'boolean',
 'Force version freeze before proposal generation. Prevents sending unfrozen estimates.',
 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BST-00003', 'engagement_auto_create_drive_folder',
 'true'::jsonb, 'boolean',
 'Auto-create Drive folder on engagement creation.',
 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BST-00004', 'pay_app_approval_workflow',
 '"reviewer_plus_approver"'::jsonb, 'string',
 'Two-role pay app approval workflow. One reviewer + one approver. NOT a dual_approval boolean (Sean correction 2026-05-11). Enum: single_approver | reviewer_plus_approver | multi_step.',
 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BST-00005', 'pay_app_reviewer_role_default',
 '"gm"'::jsonb, 'string',
 'Default reviewer role for pay app approval. Kula: Sean (GM). Must be a valid ROLE_MAP key per ADR-006.',
 'canonical', true, v_tenant_id),

(gen_random_uuid(), 'BST-00006', 'pay_app_approver_role_default',
 '"owner"'::jsonb, 'string',
 'Default approver role for pay app approval. Kula: Jody (Owner). Must be a valid ROLE_MAP key per ADR-006.',
 'canonical', true, v_tenant_id)

ON CONFLICT (tenant_id, setting_key) DO NOTHING;

END $$;

-- Verification: should return 6 rows
-- SELECT COUNT(*) FROM business_settings WHERE tenant_id = '00000000-0000-4000-8000-000000000001';
--
-- Sanity checks:
-- SELECT setting_key, setting_value, value_type FROM business_settings WHERE tenant_id = '00000000-0000-4000-8000-000000000001' ORDER BY kid;
-- Confirm no QBO placeholder row present.
-- Confirm pay_app_approval_workflow = "reviewer_plus_approver" (not a boolean).
