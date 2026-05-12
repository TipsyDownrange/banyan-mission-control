-- Packet 002 / BAN-206: Canonical Organizations schema-only alignment
-- Authoring lane: Claude Code requested; Kai executed patch after Claude Code CLI hung before edits.
-- DB execution lane: Kai only.
-- Scope: four verified-empty staging tables only. service_work_orders is untouched.
--
-- Entity-prefixed PKs are preserved:
--   organizations.org_id
--   entity_crosswalk.crosswalk_id
--   entity_migration_audit_log.log_id
--   organization_relationships.rel_id
--
-- DOWN SQL guidance (manual rollback, if Sean directs): drop Packet 002 constraints/indexes,
-- drop added columns, and restore prior enum-backed columns from migration 0000 snapshot.

-- ─── organizations ──────────────────────────────────────────────────────────
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "kid" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "org_type" text DEFAULT 'customer' NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "org_role" text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "primary_contact_id" uuid;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "qbo_ref_id" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "updated_by" uuid;

ALTER TABLE "organizations" ALTER COLUMN "kid" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "normalized_name" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "address" TYPE jsonb USING COALESCE(to_jsonb("address"), '{}'::jsonb);
ALTER TABLE "organizations" ALTER COLUMN "address" SET DEFAULT '{}'::jsonb;
ALTER TABLE "organizations" ALTER COLUMN "address" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "status" SET DEFAULT 'active';
ALTER TABLE "organizations" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "updated_at" SET DEFAULT now();
ALTER TABLE "organizations" ALTER COLUMN "updated_at" SET NOT NULL;
ALTER TABLE "organizations" ALTER COLUMN "tenant_id" SET NOT NULL;

-- Empty-table cleanup of stale pre-Packet-002 shape.
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "types";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "entity_type";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "default_island";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "city";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "state";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "postal_code";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "website";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "source";

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_users_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_merged_into_org_id_fk" FOREIGN KEY ("merged_into_org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_kid_unique" UNIQUE ("tenant_id", "kid");
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_org_type_check" CHECK ("org_type" IN ('customer','gc','vendor','supplier','fabricator','owner','architect','consultant','internal','customer_commercial_builder','other'));
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_check" CHECK ("status" IN ('active','archived','merged'));
CREATE INDEX "organizations_tenant_normalized_name_idx" ON "organizations" USING btree ("tenant_id", "normalized_name");
CREATE INDEX "organizations_tenant_qbo_ref_id_idx" ON "organizations" USING btree ("tenant_id", "qbo_ref_id");
CREATE INDEX "organizations_tenant_org_type_is_active_idx" ON "organizations" USING btree ("tenant_id", "org_type", "is_active");
CREATE INDEX "organizations_aliases_gin_idx" ON "organizations" USING gin ("aliases");
COMMENT ON COLUMN "organizations"."org_id" IS 'Canonical organization primary key. Entity-prefixed PK retained by Packet 002.';
COMMENT ON COLUMN "organizations"."kid" IS 'Human-readable organization identifier scoped to tenant.';
COMMENT ON COLUMN "organizations"."org_type" IS 'Primary organization type; includes customer_commercial_builder per Bundle H v1.1.';
COMMENT ON COLUMN "organizations"."address" IS 'Office/mailing address JSON; not jobsite address.';
COMMENT ON COLUMN "organizations"."qbo_ref_id" IS 'Read-only QBO reference continuity identifier.';

-- ─── entity_crosswalk ───────────────────────────────────────────────────────
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "legacy_source" text;
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "legacy_id" text;
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "canonical_org_id" uuid;
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "migration_status" text DEFAULT 'pending_verify' NOT NULL;
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "audit_ts" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "actor" uuid;
ALTER TABLE "entity_crosswalk" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "entity_crosswalk" ALTER COLUMN "legacy_source" SET NOT NULL;
ALTER TABLE "entity_crosswalk" ALTER COLUMN "legacy_id" SET NOT NULL;
ALTER TABLE "entity_crosswalk" ALTER COLUMN "canonical_org_id" SET NOT NULL;
ALTER TABLE "entity_crosswalk" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "entity_crosswalk" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "entity_crosswalk" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "entity_crosswalk" DROP COLUMN IF EXISTS "crosswalk_type";
ALTER TABLE "entity_crosswalk" DROP COLUMN IF EXISTS "source_system";
ALTER TABLE "entity_crosswalk" DROP COLUMN IF EXISTS "source_id";
ALTER TABLE "entity_crosswalk" DROP COLUMN IF EXISTS "target_table";
ALTER TABLE "entity_crosswalk" DROP COLUMN IF EXISTS "target_id";
ALTER TABLE "entity_crosswalk" ADD CONSTRAINT "entity_crosswalk_canonical_org_id_organizations_org_id_fk" FOREIGN KEY ("canonical_org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "entity_crosswalk" ADD CONSTRAINT "entity_crosswalk_actor_users_user_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "entity_crosswalk" ADD CONSTRAINT "entity_crosswalk_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "entity_crosswalk" ADD CONSTRAINT "entity_crosswalk_tenant_legacy_source_id_unique" UNIQUE ("tenant_id", "legacy_source", "legacy_id");
ALTER TABLE "entity_crosswalk" ADD CONSTRAINT "entity_crosswalk_legacy_source_check" CHECK ("legacy_source" IN ('sheets_customers','qbo','smartsheet_legacy','manual_import'));
ALTER TABLE "entity_crosswalk" ADD CONSTRAINT "entity_crosswalk_migration_status_check" CHECK ("migration_status" IN ('migrated','pending_verify','conflict','manual_review'));
CREATE INDEX "entity_crosswalk_canonical_org_idx" ON "entity_crosswalk" USING btree ("tenant_id", "canonical_org_id");

-- ─── entity_migration_audit_log ─────────────────────────────────────────────
ALTER TABLE "entity_migration_audit_log" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "entity_table" SET NOT NULL;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "action" TYPE text USING "action"::text;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "action" SET NOT NULL;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "before_state" SET DEFAULT '{}'::jsonb;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "before_state" SET NOT NULL;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "after_state" SET DEFAULT '{}'::jsonb;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "after_state" SET NOT NULL;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "entity_migration_audit_log" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "entity_migration_audit_log" ADD CONSTRAINT "entity_migration_audit_log_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "entity_migration_audit_log" ADD CONSTRAINT "entity_migration_audit_log_action_check" CHECK ("action" IN ('create','update','merge','repoint','migrate_files','repair','archive','rollback','other'));
CREATE INDEX "entity_migration_audit_log_tenant_entity_table_created_idx" ON "entity_migration_audit_log" USING btree ("tenant_id", "entity_table", "created_at");

-- ─── organization_relationships ─────────────────────────────────────────────
ALTER TABLE "organization_relationships" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "organization_relationships" ALTER COLUMN "from_org_id" SET NOT NULL;
ALTER TABLE "organization_relationships" ALTER COLUMN "to_org_id" SET NOT NULL;
ALTER TABLE "organization_relationships" ALTER COLUMN "relationship_type" TYPE text USING "relationship_type"::text;
ALTER TABLE "organization_relationships" ALTER COLUMN "relationship_type" SET NOT NULL;
ALTER TABLE "organization_relationships" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "organization_relationships" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "organization_relationships" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "organization_relationships" ADD CONSTRAINT "organization_relationships_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "organization_relationships" ADD CONSTRAINT "organization_relationships_tenant_from_to_type_unique" UNIQUE ("tenant_id", "from_org_id", "to_org_id", "relationship_type");
ALTER TABLE "organization_relationships" ADD CONSTRAINT "organization_relationships_relationship_type_check" CHECK ("relationship_type" IN ('customer_of','owner_of','gc_for','architect_for','vendor_for','related_to','merged_into'));
CREATE INDEX "organization_relationships_tenant_from_org_idx" ON "organization_relationships" USING btree ("tenant_id", "from_org_id");
CREATE INDEX "organization_relationships_tenant_to_org_idx" ON "organization_relationships" USING btree ("tenant_id", "to_org_id");

-- ─── schema metadata ────────────────────────────────────────────────────────
INSERT INTO "schema_metadata" (
  "table_name", "column_name", "plain_english_meaning", "domain_owner",
  "write_owner", "allowed_writers", "consumers", "tenant_scoped",
  "source_system", "migration_status", "legacy_alias", "validation_rules",
  "audit_requirement", "pii"
) VALUES
  ('organizations', 'org_id', 'Canonical organization primary key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'kid', 'Human-readable organization identifier scoped to tenant.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'name', 'Organization display name.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'normalized_name', 'Generated normalized name for duplicate detection and search.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'aliases', 'Alternate organization names as JSON array.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'org_type', 'Primary organization type.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'org_role', 'Per-engagement role qualifiers.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'primary_contact_id', 'Future primary contact pointer; FK deferred to contacts packet.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'address', 'Office/mailing address JSON; not a jobsite.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', true),
  ('organizations', 'phone', 'Main organization phone.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', true),
  ('organizations', 'email', 'Main organization email.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', true),
  ('organizations', 'qbo_ref_id', 'Read-only QBO reference continuity identifier.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', 'Legacy Customers Absorption Plan / Packet 002', NULL, 'changes_only', false),
  ('organizations', 'status', 'Organization lifecycle state.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'is_active', 'Fast active-list flag.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'tenant_id', 'Tenant boundary foreign key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'notes', 'Internal notes.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'legacy_customer_id', 'Legacy Sheets customer identifier retained during transition.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', 'Legacy Customers Absorption Plan / Packet 002', NULL, 'changes_only', false),
  ('organizations', 'legacy_source', 'Legacy system/source name.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', 'Legacy Customers Absorption Plan / Packet 002', NULL, 'changes_only', true),
  ('organizations', 'merged_into_org_id', 'Surviving organization pointer for merged records.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'created_at', 'Creation timestamp.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'updated_at', 'Last update timestamp.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'created_by', 'User who created the row.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organizations', 'updated_by', 'User who last updated the row.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'crosswalk_id', 'Entity crosswalk primary key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'legacy_source', 'Legacy system/source name.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', 'Legacy Customers Absorption Plan / Packet 002', NULL, 'changes_only', true),
  ('entity_crosswalk', 'legacy_id', 'Identifier in the legacy system.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', 'Legacy Customers Absorption Plan / Packet 002', NULL, 'changes_only', false),
  ('entity_crosswalk', 'canonical_org_id', 'Canonical organization linked to the legacy identifier.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'migration_status', 'Migration verification status.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'audit_ts', 'Migration audit timestamp.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'actor', 'User responsible for migration action.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'tenant_id', 'Tenant boundary foreign key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'notes', 'Internal notes.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_crosswalk', 'created_at', 'Creation timestamp.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'log_id', 'Migration audit log primary key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'entity_table', 'Entity table affected by migration action.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'entity_id', 'Entity primary key affected by migration action.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'action', 'Migration action type.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'performed_by', 'Actor label or user identifier.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'notes', 'Internal notes.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'before_state', 'JSON state before action.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', true),
  ('entity_migration_audit_log', 'after_state', 'JSON state after action.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', true),
  ('entity_migration_audit_log', 'tenant_id', 'Tenant boundary foreign key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('entity_migration_audit_log', 'created_at', 'Creation timestamp.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'rel_id', 'Organization relationship primary key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'from_org_id', 'Source organization in the relationship.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'to_org_id', 'Target organization in the relationship.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'relationship_type', 'Relationship type between organizations.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'notes', 'Internal notes.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'tenant_id', 'Tenant boundary foreign key.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false),
  ('organization_relationships', 'created_at', 'Creation timestamp.', 'Identity', 'Admin Manager', ARRAY['identity_flow_user','admin_manager','system_admin']::text[], ARRAY['MC Organizations Panel','MC Service Intake','MC Bid Queue','QBO sync ACL','Drive folder routing']::text[], true, 'internal', 'current', NULL, NULL, 'changes_only', false)
ON CONFLICT ("table_name", "column_name") DO UPDATE SET
  "plain_english_meaning" = EXCLUDED."plain_english_meaning",
  "domain_owner" = EXCLUDED."domain_owner",
  "write_owner" = EXCLUDED."write_owner",
  "allowed_writers" = EXCLUDED."allowed_writers",
  "consumers" = EXCLUDED."consumers",
  "tenant_scoped" = EXCLUDED."tenant_scoped",
  "source_system" = EXCLUDED."source_system",
  "migration_status" = EXCLUDED."migration_status",
  "legacy_alias" = EXCLUDED."legacy_alias",
  "validation_rules" = EXCLUDED."validation_rules",
  "audit_requirement" = EXCLUDED."audit_requirement",
  "pii" = EXCLUDED."pii",
  "updated_at" = now();
