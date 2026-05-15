CREATE TYPE "public"."core_entity_type" AS ENUM('project', 'service_work_order', 'service_request', 'estimate', 'internal');--> statement-breakpoint
CREATE TYPE "public"."crosswalk_type" AS ENUM('legacy_customer_to_org', 'wo_to_org', 'org_merge', 'site_to_org', 'external_system', 'folder_repair', 'other');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('draft', 'scheduled', 'confirmed', 'in_progress', 'complete', 'cancelled', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."field_issue_status" AS ENUM('OPEN', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."island_code" AS ENUM('maui', 'kauai', 'oahu', 'big_island', 'lanai', 'molokai', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."migration_action" AS ENUM('create', 'update', 'merge', 'repoint', 'migrate_files', 'repair', 'archive', 'rollback', 'other');--> statement-breakpoint
CREATE TYPE "public"."org_entity_type" AS ENUM('customer', 'general_contractor', 'owner', 'architect', 'vendor', 'internal', 'other');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('customer_of', 'owner_of', 'gc_for', 'architect_for', 'vendor_for', 'related_to', 'merged_into');--> statement-breakpoint
CREATE TYPE "public"."site_type" AS ENUM('OFFICE', 'RESIDENTIAL', 'COMMERCIAL', 'JOB_SITE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('gm', 'owner', 'service_pm', 'super', 'pm', 'estimator', 'admin_mgr', 'admin', 'field', 'pm_track', 'sales', 'none');--> statement-breakpoint
CREATE TYPE "public"."wo_status" AS ENUM('lead', 'quoted', 'accepted', 'deposit_received', 'materials_ordered', 'materials_received', 'ready_to_schedule', 'scheduled', 'in_progress', 'work_complete', 'completed', 'invoiced', 'paid', 'closed', 'declined', 'cancelled', 'on_hold');--> statement-breakpoint
CREATE TABLE "contacts" (
	"contact_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text,
	"is_primary" boolean DEFAULT false,
	"island" "island_code",
	"notes" text,
	"legacy_source" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "core_entities" (
	"entity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text,
	"entity_type" "core_entity_type",
	"name" text,
	"org_id" uuid,
	"island" "island_code",
	"status" text,
	"folder_id" text,
	"folder_drive_id" text,
	"folder_url" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "core_entities_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE TABLE "dispatch_schedule" (
	"slot_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_id" uuid,
	"assigned_to" uuid,
	"island" "island_code",
	"scheduled_date" date,
	"start_time" time,
	"end_time" time,
	"status" "dispatch_status",
	"notes" text,
	"drive_time_hours" numeric,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entity_crosswalk" (
	"crosswalk_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crosswalk_type" "crosswalk_type" NOT NULL,
	"source_system" text,
	"source_id" text,
	"target_table" text,
	"target_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entity_migration_audit_log" (
	"log_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_table" text,
	"entity_id" uuid,
	"action" "migration_action",
	"performed_by" text,
	"notes" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "field_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kid" text,
	"entity_type" "core_entity_type",
	"entity_id" uuid,
	"event_type" text,
	"issue_status" "field_issue_status",
	"description" text,
	"notes" text,
	"location" text,
	"island" "island_code",
	"reported_by" uuid,
	"assigned_to" uuid,
	"affected_count" integer,
	"hours_lost" numeric,
	"evidence_photo" text,
	"evidence_timestamp" timestamp with time zone,
	"activity_type" text,
	"field_issue_pdf_ref" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "field_events_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE TABLE "install_plans" (
	"plan_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_id" uuid,
	"name" text,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "install_plans_wo_id_unique" UNIQUE("wo_id")
);
--> statement-breakpoint
CREATE TABLE "install_steps" (
	"step_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"template_id" uuid,
	"step_number" integer,
	"name" text,
	"description" text,
	"bid_hours" numeric,
	"planned_hours" numeric,
	"actual_hours" numeric,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organization_relationships" (
	"rel_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_org_id" uuid,
	"to_org_id" uuid,
	"relationship_type" "relationship_type",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"org_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text GENERATED ALWAYS AS (lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))) STORED,
	"types" text[],
	"entity_type" "org_entity_type",
	"default_island" "island_code",
	"address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"phone" text,
	"email" text,
	"website" text,
	"source" text,
	"notes" text,
	"legacy_customer_id" text,
	"legacy_source" jsonb,
	"status" text,
	"merged_into_org_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_work_orders" (
	"wo_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wo_number" text,
	"kid" text,
	"name" text,
	"description" text,
	"status" "wo_status",
	"island" "island_code",
	"org_id" uuid,
	"contact_id" uuid,
	"site_id" uuid,
	"assigned_to" uuid,
	"assigned_crew" uuid[],
	"system_type" text,
	"scope" text,
	"location_notes" text,
	"hours_estimated" numeric,
	"hours_actual" numeric,
	"scheduled_date" date,
	"completed_date" date,
	"invoiced_date" date,
	"paid_date" date,
	"quote_total" numeric,
	"invoice_total" numeric,
	"folder_id" text,
	"folder_drive_id" text,
	"folder_url" text,
	"legacy_wo_ids" text,
	"legacy_customer_id" text,
	"legacy_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "service_work_orders_wo_number_unique" UNIQUE("wo_number"),
	CONSTRAINT "service_work_orders_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"site_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"island" "island_code",
	"site_type" "site_type",
	"notes" text,
	"legacy_source" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "step_completions" (
	"completion_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"step_id" uuid,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"notes" text,
	"photo_url" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role",
	"island" "island_code",
	"active" boolean DEFAULT true,
	"phone" text,
	"google_user_id" text,
	"avatar_url" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_organizations_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_entities" ADD CONSTRAINT "core_entities_org_id_organizations_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedule" ADD CONSTRAINT "dispatch_schedule_wo_id_service_work_orders_wo_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."service_work_orders"("wo_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_schedule" ADD CONSTRAINT "dispatch_schedule_assigned_to_users_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_events" ADD CONSTRAINT "field_events_reported_by_users_user_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_events" ADD CONSTRAINT "field_events_assigned_to_users_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_plans" ADD CONSTRAINT "install_plans_wo_id_service_work_orders_wo_id_fk" FOREIGN KEY ("wo_id") REFERENCES "public"."service_work_orders"("wo_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_steps" ADD CONSTRAINT "install_steps_plan_id_install_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."install_plans"("plan_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_relationships" ADD CONSTRAINT "organization_relationships_from_org_id_organizations_org_id_fk" FOREIGN KEY ("from_org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_relationships" ADD CONSTRAINT "organization_relationships_to_org_id_organizations_org_id_fk" FOREIGN KEY ("to_org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_work_orders" ADD CONSTRAINT "service_work_orders_org_id_organizations_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_work_orders" ADD CONSTRAINT "service_work_orders_contact_id_contacts_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("contact_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_work_orders" ADD CONSTRAINT "service_work_orders_site_id_sites_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("site_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_work_orders" ADD CONSTRAINT "service_work_orders_assigned_to_users_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_organizations_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_completions" ADD CONSTRAINT "step_completions_step_id_install_steps_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."install_steps"("step_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_completions" ADD CONSTRAINT "step_completions_completed_by_users_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;