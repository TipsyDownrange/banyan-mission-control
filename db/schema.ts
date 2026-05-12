import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  numeric,
  date,
  time,
  integer,
  index,
  check,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const islandCodeEnum = pgEnum('island_code', [
  'maui',
  'kauai',
  'oahu',
  'big_island',
  'lanai',
  'molokai',
  'unknown',
]);

export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'gm',
  'owner',
  'service_pm',
  'super',
  'pm',
  'estimator',
  'admin_mgr',
  'admin',
  'field',
  'pm_track',
  'sales',
  'none',
]);

export const orgEntityTypeEnum = pgEnum('org_entity_type', [
  'customer',
  'general_contractor',
  'owner',
  'architect',
  'vendor',
  'internal',
  'other',
]);

export const siteTypeEnum = pgEnum('site_type', [
  'OFFICE',
  'RESIDENTIAL',
  'COMMERCIAL',
  'JOB_SITE',
  'OTHER',
]);

export const coreEntityTypeEnum = pgEnum('core_entity_type', [
  'project',
  'service_work_order',
  'service_request',
  'estimate',
  'internal',
]);

export const woStatusEnum = pgEnum('wo_status', [
  'lead',
  'quoted',
  'accepted',
  'deposit_received',
  'materials_ordered',
  'materials_received',
  'ready_to_schedule',
  'scheduled',
  'in_progress',
  'work_complete',
  'completed',
  'invoiced',
  'paid',
  'closed',
  'declined',
  'cancelled',
  'on_hold',
]);

export const dispatchStatusEnum = pgEnum('dispatch_status', [
  'draft',
  'scheduled',
  'confirmed',
  'in_progress',
  'complete',
  'cancelled',
  'blocked',
]);

export const fieldIssueStatusEnum = pgEnum('field_issue_status', [
  'OPEN',
  'RESOLVED',
  'CLOSED',
]);

export const relationshipTypeEnum = pgEnum('relationship_type', [
  'customer_of',
  'owner_of',
  'gc_for',
  'architect_for',
  'vendor_for',
  'related_to',
  'merged_into',
]);

export const crosswalkTypeEnum = pgEnum('crosswalk_type', [
  'legacy_customer_to_org',
  'wo_to_org',
  'org_merge',
  'site_to_org',
  'external_system',
  'folder_repair',
  'other',
]);

export const migrationActionEnum = pgEnum('migration_action', [
  'create',
  'update',
  'merge',
  'repoint',
  'migrate_files',
  'repair',
  'archive',
  'rollback',
  'other',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  tenant_id: uuid('tenant_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  legal_entity_name: text('legal_entity_name'),
  status: text('status').notNull().default('active'),
  subscription_tier: text('subscription_tier').notNull().default('internal'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tenants_status_idx').on(table.status),
  check('tenants_status_check', sql`${table.status} in ('active', 'suspended', 'archived')`),
  check('tenants_subscription_tier_check', sql`${table.subscription_tier} in ('internal', 'standard', 'enterprise')`),
]);

export const users = pgTable('users', {
  user_id: uuid('user_id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name'),
  role: userRoleEnum('role'),
  island: islandCodeEnum('island'),
  active: boolean('active').default(true),
  phone: text('phone'),
  google_user_id: text('google_user_id'),
  avatar_url: text('avatar_url'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const organizations = pgTable('organizations', {
  org_id: uuid('org_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  name: text('name').notNull(),
  normalized_name: text('normalized_name').generatedAlwaysAs(
    sql`lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))`
  ),
  aliases: jsonb('aliases').notNull().default(sql`'[]'::jsonb`),
  org_type: text('org_type').notNull().default('customer'),
  org_role: text('org_role').array().notNull().default(sql`'{}'::text[]`),
  primary_contact_id: uuid('primary_contact_id'),
  address: jsonb('address').notNull().default(sql`'{}'::jsonb`),
  phone: text('phone'),
  email: text('email'),
  qbo_ref_id: text('qbo_ref_id'),
  status: text('status').notNull().default('active'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  source: text('source'),
  notes: text('notes'),
  legacy_customer_id: text('legacy_customer_id'),
  legacy_source: jsonb('legacy_source'),
  merged_into_org_id: uuid('merged_into_org_id').references((): AnyPgColumn => organizations.org_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('organizations_tenant_kid_unique').on(table.tenant_id, table.kid),
  index('organizations_tenant_normalized_name_idx').on(table.tenant_id, table.normalized_name),
  index('organizations_tenant_qbo_ref_idx').on(table.tenant_id, table.qbo_ref_id),
  index('organizations_tenant_type_active_idx').on(table.tenant_id, table.org_type, table.is_active),
  index('organizations_aliases_gin_idx').using('gin', table.aliases),
  check('organizations_org_type_check', sql`${table.org_type} IN ('customer','gc','vendor','supplier','fabricator','owner','architect','consultant','internal','customer_commercial_builder','other')`),
  check('organizations_status_check', sql`${table.status} IN ('active','archived','merged')`),
]);

export const contacts = pgTable('contacts', {
  contact_id: uuid('contact_id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').references(() => organizations.org_id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  role: text('role'),
  is_primary: boolean('is_primary').default(false),
  island: islandCodeEnum('island'),
  notes: text('notes'),
  legacy_source: jsonb('legacy_source'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const sites = pgTable('sites', {
  site_id: uuid('site_id').defaultRandom().primaryKey(),
  org_id: uuid('org_id').references(() => organizations.org_id),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postal_code: text('postal_code'),
  island: islandCodeEnum('island'),
  site_type: siteTypeEnum('site_type'),
  notes: text('notes'),
  legacy_source: jsonb('legacy_source'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const entity_crosswalk = pgTable('entity_crosswalk', {
  crosswalk_id: uuid('crosswalk_id').defaultRandom().primaryKey(),
  legacy_source: text('legacy_source').notNull(),
  legacy_id: text('legacy_id').notNull(),
  canonical_org_id: uuid('canonical_org_id').notNull().references(() => organizations.org_id),
  migration_status: text('migration_status').notNull().default('pending_verify'),
  audit_ts: timestamp('audit_ts', { withTimezone: true }).notNull().defaultNow(),
  actor: uuid('actor').references(() => users.user_id),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('entity_crosswalk_tenant_legacy_unique').on(table.tenant_id, table.legacy_source, table.legacy_id),
  index('entity_crosswalk_canonical_org_idx').on(table.tenant_id, table.canonical_org_id),
  check('entity_crosswalk_legacy_source_check', sql`${table.legacy_source} IN ('sheets_customers','qbo','smartsheet_legacy','manual_import')`),
  check('entity_crosswalk_migration_status_check', sql`${table.migration_status} IN ('migrated','pending_verify','conflict','manual_review')`),
]);

export const core_entities = pgTable('core_entities', {
  entity_id: uuid('entity_id').defaultRandom().primaryKey(),
  kid: text('kid').unique(),
  entity_type: coreEntityTypeEnum('entity_type'),
  name: text('name'),
  org_id: uuid('org_id').references(() => organizations.org_id),
  island: islandCodeEnum('island'),
  status: text('status'),
  folder_id: text('folder_id'),
  folder_drive_id: text('folder_drive_id'),
  folder_url: text('folder_url'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const service_work_orders = pgTable('service_work_orders', {
  wo_id: uuid('wo_id').defaultRandom().primaryKey(),
  wo_number: text('wo_number').unique(),
  kid: text('kid').unique(),
  name: text('name'),
  description: text('description'),
  status: woStatusEnum('status'),
  island: islandCodeEnum('island'),
  org_id: uuid('org_id').references(() => organizations.org_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  site_id: uuid('site_id').references(() => sites.site_id),
  assigned_to: uuid('assigned_to').references(() => users.user_id),
  assigned_crew: uuid('assigned_crew').array(),
  system_type: text('system_type'),
  scope: text('scope'),
  location_notes: text('location_notes'),
  hours_estimated: numeric('hours_estimated'),
  hours_actual: numeric('hours_actual'),
  scheduled_date: date('scheduled_date'),
  completed_date: date('completed_date'),
  invoiced_date: date('invoiced_date'),
  paid_date: date('paid_date'),
  quote_total: numeric('quote_total'),
  invoice_total: numeric('invoice_total'),
  folder_id: text('folder_id'),
  folder_drive_id: text('folder_drive_id'),
  folder_url: text('folder_url'),
  legacy_wo_ids: text('legacy_wo_ids'),
  legacy_customer_id: text('legacy_customer_id'),
  legacy_payload: jsonb('legacy_payload'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const organization_relationships = pgTable('organization_relationships', {
  rel_id: uuid('rel_id').defaultRandom().primaryKey(),
  from_org_id: uuid('from_org_id').notNull().references(() => organizations.org_id),
  to_org_id: uuid('to_org_id').notNull().references(() => organizations.org_id),
  relationship_type: text('relationship_type').notNull(),
  notes: text('notes'),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('organization_relationships_tenant_rel_unique').on(table.tenant_id, table.from_org_id, table.to_org_id, table.relationship_type),
  index('organization_relationships_from_idx').on(table.tenant_id, table.from_org_id),
  index('organization_relationships_to_idx').on(table.tenant_id, table.to_org_id),
  check('organization_relationships_type_check', sql`${table.relationship_type} IN ('customer_of','owner_of','gc_for','architect_for','vendor_for','related_to','merged_into')`),
]);

export const entity_migration_audit_log = pgTable('entity_migration_audit_log', {
  log_id: uuid('log_id').defaultRandom().primaryKey(),
  entity_table: text('entity_table').notNull(),
  entity_id: uuid('entity_id'),
  action: text('action').notNull(),
  performed_by: text('performed_by'),
  notes: text('notes'),
  before_state: jsonb('before_state').notNull().default(sql`'{}'::jsonb`),
  after_state: jsonb('after_state').notNull().default(sql`'{}'::jsonb`),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('entity_migration_audit_log_tenant_entity_idx').on(table.tenant_id, table.entity_table, table.created_at),
  check('entity_migration_audit_log_action_check', sql`${table.action} IN ('create','update','merge','repoint','migrate_files','repair','archive','rollback','other')`),
]);

export const dispatch_schedule = pgTable('dispatch_schedule', {
  slot_id: uuid('slot_id').defaultRandom().primaryKey(),
  wo_id: uuid('wo_id').references(() => service_work_orders.wo_id),
  assigned_to: uuid('assigned_to').references(() => users.user_id),
  island: islandCodeEnum('island'),
  scheduled_date: date('scheduled_date'),
  start_time: time('start_time'),
  end_time: time('end_time'),
  status: dispatchStatusEnum('status'),
  notes: text('notes'),
  drive_time_hours: numeric('drive_time_hours'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const install_plans = pgTable('install_plans', {
  plan_id: uuid('plan_id').defaultRandom().primaryKey(),
  wo_id: uuid('wo_id').references(() => service_work_orders.wo_id).unique(),
  name: text('name'),
  description: text('description'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const install_steps = pgTable('install_steps', {
  step_id: uuid('step_id').defaultRandom().primaryKey(),
  plan_id: uuid('plan_id').references(() => install_plans.plan_id),
  template_id: uuid('template_id'),
  step_number: integer('step_number'),
  name: text('name'),
  description: text('description'),
  bid_hours: numeric('bid_hours'),
  planned_hours: numeric('planned_hours'),
  actual_hours: numeric('actual_hours'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const step_completions = pgTable('step_completions', {
  completion_id: uuid('completion_id').defaultRandom().primaryKey(),
  step_id: uuid('step_id').references(() => install_steps.step_id),
  completed_by: uuid('completed_by').references(() => users.user_id),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  notes: text('notes'),
  photo_url: text('photo_url'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── Packet 001: Master Library Tables ───────────────────────────────────────

export const families = pgTable('families', {
  family_id: uuid('family_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  gold_data_rollup: boolean('gold_data_rollup').notNull().default(false),
  display_order: integer('display_order').notNull().default(0),
  status: text('status').notNull().default('canonical'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('families_tenant_kid_unique').on(table.tenant_id, table.kid),
  index('families_tenant_active_order_idx').on(table.tenant_id, table.is_active, table.display_order),
  check('families_status_check', sql`${table.status} IN ('canonical','active','retired','legacy')`),
]);

export const system_types = pgTable('system_types', {
  system_type_id: uuid('system_type_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  family_id: uuid('family_id').notNull().references(() => families.family_id),
  name: text('name').notNull(),
  description: text('description'),
  common_aliases: text('common_aliases').array().notNull().default(sql`'{}'`),
  notes: text('notes'),
  status: text('status').notNull().default('canonical'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('system_types_tenant_kid_unique').on(table.tenant_id, table.kid),
  index('system_types_tenant_family_active_idx').on(table.tenant_id, table.family_id, table.is_active),
  check('system_types_status_check', sql`${table.status} IN ('canonical','active','retired','legacy')`),
]);

export const manufacturers = pgTable('manufacturers', {
  manufacturer_id: uuid('manufacturer_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  name: text('name').notNull(),
  primary_trade_role: text('primary_trade_role'),
  notes: text('notes'),
  contact_info: jsonb('contact_info').notNull().default(sql`'{}'`),
  status: text('status').notNull().default('canonical'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('manufacturers_tenant_kid_unique').on(table.tenant_id, table.kid),
  index('manufacturers_tenant_active_idx').on(table.tenant_id, table.is_active),
  check('manufacturers_status_check', sql`${table.status} IN ('canonical','active','retired','legacy')`),
]);

export const work_types = pgTable('work_types', {
  work_type_id: uuid('work_type_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('locked'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('work_types_tenant_kid_unique').on(table.tenant_id, table.kid),
  check('work_types_status_check', sql`${table.status} IN ('canonical','active','retired','legacy','locked')`),
]);

export const schema_metadata = pgTable('schema_metadata', {
  meta_id: uuid('meta_id').defaultRandom().primaryKey(),
  table_name: text('table_name').notNull(),
  column_name: text('column_name').notNull(),
  plain_english_meaning: text('plain_english_meaning').notNull(),
  domain_owner: text('domain_owner').notNull(),
  write_owner: text('write_owner').notNull(),
  allowed_writers: text('allowed_writers').array().notNull().default(sql`'{}'`),
  consumers: text('consumers').array().notNull().default(sql`'{}'`),
  tenant_scoped: boolean('tenant_scoped').notNull(),
  source_system: text('source_system').notNull().default('internal'),
  migration_status: text('migration_status').notNull().default('current'),
  legacy_alias: text('legacy_alias'),
  validation_rules: text('validation_rules'),
  audit_requirement: text('audit_requirement').notNull().default('changes_only'),
  pii: boolean('pii').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('schema_metadata_table_column_unique').on(table.table_name, table.column_name),
  check('schema_metadata_domain_owner_check', sql`${table.domain_owner} IN ('Identity','Work','Documents','Finance','Platform Governance')`),
  check('schema_metadata_migration_status_check', sql`${table.migration_status} IN ('current','target','transitional')`),
  check('schema_metadata_audit_requirement_check', sql`${table.audit_requirement} IN ('full','changes_only','none')`),
]);

export const field_events = pgTable('field_events', {
  event_id: uuid('event_id').defaultRandom().primaryKey(),
  kid: text('kid').unique(),
  entity_type: coreEntityTypeEnum('entity_type'),
  entity_id: uuid('entity_id'),
  event_type: text('event_type'),
  issue_status: fieldIssueStatusEnum('issue_status'),
  description: text('description'),
  notes: text('notes'),
  location: text('location'),
  island: islandCodeEnum('island'),
  reported_by: uuid('reported_by').references(() => users.user_id),
  assigned_to: uuid('assigned_to').references(() => users.user_id),
  affected_count: integer('affected_count'),
  hours_lost: numeric('hours_lost'),
  evidence_photo: text('evidence_photo'),
  evidence_timestamp: timestamp('evidence_timestamp', { withTimezone: true }),
  activity_type: text('activity_type'),
  field_issue_pdf_ref: text('field_issue_pdf_ref'),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
