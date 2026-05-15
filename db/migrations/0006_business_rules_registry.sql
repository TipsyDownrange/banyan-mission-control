-- Packet 002.5: Business Rules Registry Foundation
-- Entity-prefixed PKs: rule_id (business_rules), setting_id (business_settings)
-- FK targets: tenants(tenant_id), users(user_id)
-- COMMENT ON COLUMN for every new column per Packet 001 pattern.
-- BAN-210 / feat/packet-002-5-business-rules-registry
--
-- DOWN SQL (run in reverse order):
-- DROP TABLE IF EXISTS "business_settings";
-- DROP TABLE IF EXISTS "business_rules";

CREATE TABLE "business_rules" (
	"rule_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"rule_key" text NOT NULL,
	"rule_value" jsonb NOT NULL,
	"value_type" text NOT NULL,
	"description" text,
	"effective_start" date NOT NULL,
	"effective_end" date,
	"supersedes_rule_id" uuid,
	"change_rationale" text,
	"status" text DEFAULT 'canonical' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "business_rules_tenant_kid_unique" UNIQUE("tenant_id","kid"),
	CONSTRAINT "business_rules_value_type_check" CHECK ("business_rules"."value_type" IN ('numeric','percentage','currency','string','object')),
	CONSTRAINT "business_rules_status_check" CHECK ("business_rules"."status" IN ('canonical','active','retired','legacy'))
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"setting_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"setting_key" text NOT NULL,
	"setting_value" jsonb NOT NULL,
	"value_type" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'canonical' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "business_settings_tenant_kid_unique" UNIQUE("tenant_id","kid"),
	CONSTRAINT "business_settings_tenant_key_unique" UNIQUE("tenant_id","setting_key"),
	CONSTRAINT "business_settings_value_type_check" CHECK ("business_settings"."value_type" IN ('boolean','integer','string','object')),
	CONSTRAINT "business_settings_status_check" CHECK ("business_settings"."status" IN ('canonical','active','retired','legacy')),
	CONSTRAINT "business_settings_pay_app_workflow_check" CHECK (
		"business_settings"."setting_key" <> 'pay_app_approval_workflow' OR
		"business_settings"."setting_value"::text = ANY(ARRAY['"single_approver"', '"reviewer_plus_approver"', '"multi_step"'])
	)
);
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_supersedes_rule_id_fk"
	FOREIGN KEY ("supersedes_rule_id") REFERENCES "public"."business_rules"("rule_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_tenant_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_created_by_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_updated_by_fk"
	FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_tenant_id_fk"
	FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_created_by_fk"
	FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_updated_by_fk"
	FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "business_rules_lookup_idx" ON "business_rules" ("tenant_id","rule_key","effective_start" DESC);
--> statement-breakpoint
CREATE INDEX "business_rules_active_status_idx" ON "business_rules" ("tenant_id","is_active","status");
--> statement-breakpoint
CREATE INDEX "business_rules_read_idx" ON "business_rules" ("tenant_id","rule_key","is_active");
--> statement-breakpoint
CREATE INDEX "business_settings_active_idx" ON "business_settings" ("tenant_id","is_active");
--> statement-breakpoint

-- COMMENT ON COLUMN — business_rules (every column)
COMMENT ON COLUMN "business_rules"."rule_id" IS 'Entity-prefixed PK. Stable reference for snapshot linking (Packet 005 estimate_versions stores rule_id at version freeze).';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."kid" IS 'Human-readable sequential ID. Format: BRL-XXXXX. Scoped to tenant via business_rules_tenant_kid_unique.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."rule_key" IS 'Canonical rule identifier, e.g. default_get_rate_pct. Lookup key for getBusinessRule(). Not unique per tenant — multiple effective-dated rows may share a key.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."rule_value" IS 'JSONB-encoded rule value. May be a number, string, or structured object. Use value_type column to interpret.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."value_type" IS 'Type hint for consumers: numeric, percentage, currency, string, or object. Validated by CHECK constraint.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."description" IS 'Human-readable explanation of this rule and its canonical source (e.g. Union MLA, 2025 T&C, Island Insurance).';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."effective_start" IS 'Inclusive start date this rule value is active. Snapshot lookups use WHERE effective_start <= query_date.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."effective_end" IS 'Exclusive end date this rule is superseded. NULL = currently active. WHERE effective_end IS NULL OR effective_end > query_date.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."supersedes_rule_id" IS 'Self-referential FK to the prior rule this value replaces. Enables audit chain per ADR-038 Universal Modifiability.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."change_rationale" IS 'Required when supersedes_rule_id is set per ADR-038. Explains why the rule changed (e.g. union renegotiation, insurance renewal).';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."status" IS 'Lifecycle status: canonical (current production default), active, retired, legacy.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."is_active" IS 'Per-tenant soft-delete toggle. Inactive rules are excluded from getBusinessRule() lookups.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."tenant_id" IS 'Tenant scope per ADR-002 and ADR-003. All rule reads are tenant-scoped. FK to tenants.tenant_id.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."created_at" IS 'Row creation timestamp. Timezone-aware.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."updated_at" IS 'Last modification timestamp. Timezone-aware. Application must update on every write.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."created_by" IS 'User who created this rule. Nullable FK to users.user_id. business_admin role required for writes per ADR-006 Amendment 1.';
--> statement-breakpoint
COMMENT ON COLUMN "business_rules"."updated_by" IS 'User who last modified this rule. Nullable FK to users.user_id.';
--> statement-breakpoint

-- COMMENT ON COLUMN — business_settings (every column)
COMMENT ON COLUMN "business_settings"."setting_id" IS 'Entity-prefixed PK. One canonical setting row per (tenant_id, setting_key).';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."kid" IS 'Human-readable sequential ID. Format: BST-XXXXX. Scoped to tenant via business_settings_tenant_kid_unique.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."setting_key" IS 'Canonical setting identifier, e.g. pay_app_approval_workflow. Unique per tenant via business_settings_tenant_key_unique.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."setting_value" IS 'JSONB-encoded setting value. Use value_type to interpret (boolean, integer, string, object).';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."value_type" IS 'Type hint for consumers: boolean, integer, string, or object. Validated by CHECK constraint.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."description" IS 'Human-readable explanation of this setting and its downstream effect on operator workflows.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."status" IS 'Lifecycle status: canonical, active, retired, legacy.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."is_active" IS 'Per-tenant soft-delete toggle. Inactive settings excluded from getBusinessSetting() lookups.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."tenant_id" IS 'Tenant scope per ADR-002 and ADR-003. FK to tenants.tenant_id.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."created_at" IS 'Row creation timestamp. Timezone-aware.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."updated_at" IS 'Last modification timestamp. Timezone-aware.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."created_by" IS 'User who created this setting. Nullable FK to users.user_id. business_admin role required for writes per ADR-006 Amendment 1.';
--> statement-breakpoint
COMMENT ON COLUMN "business_settings"."updated_by" IS 'User who last modified this setting. Nullable FK to users.user_id.';
