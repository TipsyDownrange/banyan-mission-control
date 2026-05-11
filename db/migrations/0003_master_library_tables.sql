-- Packet 001: Master Library API — 5 new tables
-- Entity-prefixed PKs per Dispatch Amendment 1.
-- FK targets: tenants(tenant_id), users(user_id), families(family_id).
-- schema_metadata has NO tenant_id (platform-level).
--
-- DOWN SQL (run in reverse order to roll back)
-- DROP TABLE IF EXISTS "schema_metadata";
-- DROP TABLE IF EXISTS "work_types";
-- DROP TABLE IF EXISTS "manufacturers";
-- DROP TABLE IF EXISTS "system_types";
-- DROP TABLE IF EXISTS "families";

CREATE TABLE "families" (
	"family_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"gold_data_rollup" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'canonical' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "families_tenant_kid_unique" UNIQUE("tenant_id","kid"),
	CONSTRAINT "families_status_check" CHECK ("families"."status" IN ('canonical','active','retired','legacy'))
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"manufacturer_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"name" text NOT NULL,
	"primary_trade_role" text,
	"notes" text,
	"contact_info" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'canonical' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "manufacturers_tenant_kid_unique" UNIQUE("tenant_id","kid"),
	CONSTRAINT "manufacturers_status_check" CHECK ("manufacturers"."status" IN ('canonical','active','retired','legacy'))
);
--> statement-breakpoint
CREATE TABLE "schema_metadata" (
	"meta_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_name" text NOT NULL,
	"column_name" text NOT NULL,
	"plain_english_meaning" text NOT NULL,
	"domain_owner" text NOT NULL,
	"write_owner" text NOT NULL,
	"allowed_writers" text[] DEFAULT '{}' NOT NULL,
	"consumers" text[] DEFAULT '{}' NOT NULL,
	"tenant_scoped" boolean NOT NULL,
	"source_system" text DEFAULT 'internal' NOT NULL,
	"migration_status" text DEFAULT 'current' NOT NULL,
	"legacy_alias" text,
	"validation_rules" text,
	"audit_requirement" text DEFAULT 'changes_only' NOT NULL,
	"pii" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_metadata_table_column_unique" UNIQUE("table_name","column_name"),
	CONSTRAINT "schema_metadata_domain_owner_check" CHECK ("schema_metadata"."domain_owner" IN ('Identity','Work','Documents','Finance','Platform Governance')),
	CONSTRAINT "schema_metadata_migration_status_check" CHECK ("schema_metadata"."migration_status" IN ('current','target','transitional')),
	CONSTRAINT "schema_metadata_audit_requirement_check" CHECK ("schema_metadata"."audit_requirement" IN ('full','changes_only','none'))
);
--> statement-breakpoint
CREATE TABLE "system_types" (
	"system_type_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"common_aliases" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'canonical' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "system_types_tenant_kid_unique" UNIQUE("tenant_id","kid"),
	CONSTRAINT "system_types_status_check" CHECK ("system_types"."status" IN ('canonical','active','retired','legacy'))
);
--> statement-breakpoint
CREATE TABLE "work_types" (
	"work_type_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'locked' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "work_types_tenant_kid_unique" UNIQUE("tenant_id","kid"),
	CONSTRAINT "work_types_status_check" CHECK ("work_types"."status" IN ('canonical','active','retired','legacy','locked'))
);
--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_updated_by_users_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_updated_by_users_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_types" ADD CONSTRAINT "system_types_family_id_families_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("family_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_types" ADD CONSTRAINT "system_types_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_types" ADD CONSTRAINT "system_types_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_types" ADD CONSTRAINT "system_types_updated_by_users_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_tenant_id_tenants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_updated_by_users_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "families_tenant_active_order_idx" ON "families" USING btree ("tenant_id","is_active","display_order");--> statement-breakpoint
CREATE INDEX "manufacturers_tenant_active_idx" ON "manufacturers" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "system_types_tenant_family_active_idx" ON "system_types" USING btree ("tenant_id","family_id","is_active");