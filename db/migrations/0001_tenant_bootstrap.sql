ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'gm';--> statement-breakpoint
CREATE TABLE "tenants" (
	"tenant_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"legal_entity_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"subscription_tier" text DEFAULT 'internal' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_kid_unique" UNIQUE("kid"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_status_check" CHECK ("tenants"."status" in ('active', 'suspended', 'archived')),
	CONSTRAINT "tenants_subscription_tier_check" CHECK ("tenants"."subscription_tier" in ('internal', 'standard', 'enterprise'))
);
--> statement-breakpoint
COMMENT ON COLUMN "tenants"."tenant_id" IS 'Entity-prefixed primary key for the tenant root record.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."kid" IS 'Human-readable tenant identifier. Kula Glass tenant 1 is TEN-001.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."name" IS 'Tenant display name.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."slug" IS 'URL-safe tenant slug for future routing or display.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."legal_entity_name" IS 'Full legal entity name for documents.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."status" IS 'Tenant lifecycle state: active, suspended, or archived.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."subscription_tier" IS 'Tenant subscription tier: internal, standard, or enterprise.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."created_at" IS 'Timestamp when the tenant row was created.';--> statement-breakpoint
COMMENT ON COLUMN "tenants"."updated_at" IS 'Timestamp when the tenant row was last updated.';--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
INSERT INTO "tenants" ("tenant_id", "kid", "name", "slug", "legal_entity_name", "status", "subscription_tier")
VALUES (
	'00000000-0000-4000-8000-000000000001',
	'TEN-001',
	'Kula Glass Company',
	'kula-glass',
	'Kula Glass Company, Inc.',
	'active',
	'internal'
)
ON CONFLICT ("tenant_id") DO UPDATE SET
	"kid" = EXCLUDED."kid",
	"name" = EXCLUDED."name",
	"slug" = EXCLUDED."slug",
	"legal_entity_name" = EXCLUDED."legal_entity_name",
	"status" = EXCLUDED."status",
	"subscription_tier" = EXCLUDED."subscription_tier",
	"updated_at" = now();
