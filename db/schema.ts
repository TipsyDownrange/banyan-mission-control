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
  'business_admin',
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

export const fieldEventOriginEnum = pgEnum('field_event_origin', [
  'field',
  'office',
  'system',
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

// ─── Packet 002.5: Business Rules Registry ───────────────────────────────────

export const business_rules = pgTable('business_rules', {
  rule_id: uuid('rule_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  rule_key: text('rule_key').notNull(),
  rule_value: jsonb('rule_value').notNull(),
  value_type: text('value_type').notNull(),
  description: text('description'),
  effective_start: date('effective_start').notNull(),
  effective_end: date('effective_end'),
  supersedes_rule_id: uuid('supersedes_rule_id').references((): AnyPgColumn => business_rules.rule_id),
  change_rationale: text('change_rationale'),
  status: text('status').notNull().default('canonical'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('business_rules_tenant_kid_unique').on(table.tenant_id, table.kid),
  index('business_rules_lookup_idx').on(table.tenant_id, table.rule_key, sql`${table.effective_start} DESC`),
  index('business_rules_active_status_idx').on(table.tenant_id, table.is_active, table.status),
  index('business_rules_read_idx').on(table.tenant_id, table.rule_key, table.is_active),
  check('business_rules_value_type_check', sql`${table.value_type} IN ('numeric','percentage','currency','string','object')`),
  check('business_rules_status_check', sql`${table.status} IN ('canonical','active','retired','legacy')`),
]);

export const business_settings = pgTable('business_settings', {
  setting_id: uuid('setting_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  setting_key: text('setting_key').notNull(),
  setting_value: jsonb('setting_value').notNull(),
  value_type: text('value_type').notNull(),
  description: text('description'),
  status: text('status').notNull().default('canonical'),
  is_active: boolean('is_active').notNull().default(true),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('business_settings_tenant_kid_unique').on(table.tenant_id, table.kid),
  unique('business_settings_tenant_key_unique').on(table.tenant_id, table.setting_key),
  index('business_settings_active_idx').on(table.tenant_id, table.is_active),
  check('business_settings_value_type_check', sql`${table.value_type} IN ('boolean','integer','string','object')`),
  check('business_settings_status_check', sql`${table.status} IN ('canonical','active','retired','legacy')`),
  check('business_settings_pay_app_workflow_check', sql`
    ${table.setting_key} <> 'pay_app_approval_workflow' OR
    ${table.setting_value}::text = ANY(ARRAY['"single_approver"', '"reviewer_plus_approver"', '"multi_step"'])
  `),
]);

// ─── engagements (BG1 Packet 003 W2) ─────────────────────────────────────────
// Engagement = unit of work scope between an org+site and one or more
// work_records / service_work_orders. BG1 W2 reconciles the table to the
// dispatch contract: routing_decision + pm_handoff_state + completion dates
// + Drive folder template. Canonical engagement_type values per BQS §6.3.
// Drizzle types reflect staging-actual column names (engagement_id PK,
// status column, users.user_id FK), not the canon-doc abstract names.
export const engagements = pgTable('engagements', {
  engagement_id: uuid('engagement_id').defaultRandom().primaryKey(),
  kid: text('kid').notNull(),
  org_id: uuid('org_id').notNull().references(() => organizations.org_id),
  site_id: uuid('site_id').notNull().references(() => sites.site_id),
  engagement_type: text('engagement_type').notNull(),
  status: text('status').notNull().default('active'),
  primary_contact_id: uuid('primary_contact_id').references(() => contacts.contact_id),
  start_date: date('start_date'),
  end_date: date('end_date'),
  target_completion_date: date('target_completion_date'),
  actual_completion_date: date('actual_completion_date'),
  routing_decision: text('routing_decision'),
  routing_assigned_by: uuid('routing_assigned_by').references(() => users.user_id),
  routing_assigned_at: timestamp('routing_assigned_at', { withTimezone: true }),
  routing_rationale: text('routing_rationale'),
  pm_handoff_state: text('pm_handoff_state').notNull().default('estimating'),
  pm_assigned_user_id: uuid('pm_assigned_user_id').references(() => users.user_id),
  warranty_supplement_routing: text('warranty_supplement_routing'),
  drive_folder_id: text('drive_folder_id'),
  drive_folder_template: text('drive_folder_template'),
  is_test_project: boolean('is_test_project').notNull().default(false),
  test_project_created_by: uuid('test_project_created_by').references(() => users.user_id),
  test_project_purpose: text('test_project_purpose'),
  metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('engagements_tenant_kid_uidx').on(table.tenant_id, table.kid),
  index('engagements_org_id_idx').on(table.tenant_id, table.org_id),
  index('engagements_site_id_idx').on(table.tenant_id, table.site_id),
  index('engagements_type_status_idx').on(table.tenant_id, table.engagement_type, table.status),
  index('engagements_tenant_status_pm_handoff_idx').on(table.tenant_id, table.status, table.pm_handoff_state),
  index('engagements_production_default_idx').on(table.tenant_id, table.status).where(sql`${table.is_test_project} = false`),
  check('engagements_engagement_type_check', sql`${table.engagement_type} IN ('project','work_order_small','work_order_large','warranty_small','warranty_large','maintenance','internal')`),
  check('engagements_status_check', sql`${table.status} IN ('active','closed','cancelled','on_hold','archived')`),
  check('engagements_routing_decision_check', sql`${table.routing_decision} IS NULL OR ${table.routing_decision} IN ('service_wo','project')`),
  check('engagements_pm_handoff_state_check', sql`${table.pm_handoff_state} IN ('estimating','awaiting_handoff','pm_assigned','active','handoff_blocked','closed')`),
  check('engagements_warranty_supplement_routing_check', sql`${table.warranty_supplement_routing} IS NULL OR ${table.warranty_supplement_routing} IN ('gc','owner','both','auto')`),
  check('engagements_test_project_created_by_required_check', sql`(${table.is_test_project} = false) OR (${table.test_project_created_by} IS NOT NULL)`),
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
  origin: fieldEventOriginEnum('origin'),
  test_data: boolean('test_data').notNull().default(false),
  metadata: jsonb('metadata'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('field_events_production_default_idx').on(table.event_type, table.created_at).where(sql`${table.test_data} = false`),
  check('field_events_event_type_ban293_check', sql`${table.event_type} IS NULL OR ${table.event_type} IN (
    'INSTALL_STEP', 'FIELD_ISSUE', 'DAILY_LOG', 'FIELD_MEASUREMENT', 'NOTE', 'TM_CAPTURE', 'PHOTO_ONLY', 'PUNCH_LIST', 'SITE_VISIT', 'TESTING', 'WARRANTY_CALLBACK',
    'wo_completion',
    'PAY_APP_NOTARIZED', 'RETAINAGE_RELEASED', 'PUNCH_LIST_CLEARED', 'NOTICE_OF_COMPLETION_FILED', 'JOB_COST_RECONCILED', 'GOLD_DATASET_ENTRY_WRITTEN', 'DELIVERABLE_PRODUCED', 'TM_AUTHORIZATION_CONVERTED_TO_CO', 'TEST_PROJECT_RESET', 'BACK_CHARGE_APPLIED_CROSS_PROJECT', 'SOV_MODIFIED', 'HANDOFF_PROCESSED',
    'PAY_APP_NOTARIZATION_SKIPPED', 'PAY_APP_SUBMITTED', 'CASH_RECEIPT_RECORDED', 'RFI_GENERATED_CO', 'VERBAL_AGREEMENT_LOGGED', 'VERBAL_AGREEMENT_FOLLOWUP_SENT', 'VERBAL_AGREEMENT_FORMALIZED', 'VERBAL_AGREEMENT_RESOLVED',
    'SOV_STATE_CHANGED', 'PAY_APP_STATE_CHANGED', 'LIEN_WAIVER_STATE_CHANGED', 'PROJECT_STATE_CHANGED', 'PUNCH_LIST_ITEM_STATE_CHANGED', 'WARRANTY_STATE_CHANGED', 'TM_AUTHORIZATION_STATE_CHANGED', 'TM_TICKET_STATE_CHANGED', 'TEST_PROJECT_STATE_CHANGED', 'BACK_CHARGE_STATE_CHANGED', 'SUBMITTAL_STATE_CHANGED', 'RFI_STATE_CHANGED'
  )`),
]);

// ─── BAN-302 Pass 3a: TPA + AIA v1.1 entity schema ──────────────────────────
// Per BAN-302 D1-D5 ratification, TPA v1.0 §6.5 + §11, AIA v1.1 §14.1.
// All child entities inherit test-vs-production status from engagements.is_test_project
// (TPA spec §4.2). Activity Spine event_contract.ts NOT modified — AIA events map to
// canonical 34 per D4; TPA CREATED/DELETED collapse to TEST_PROJECT_STATE_CHANGED per D3.

// TPA §6.5 + §11.2 — reset audit log
export const test_project_resets = pgTable('test_project_resets', {
  reset_id: uuid('reset_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id, { onDelete: 'cascade' }),
  reset_by: uuid('reset_by').notNull().references(() => users.user_id),
  reset_at: timestamp('reset_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason'),
  child_records_deleted: jsonb('child_records_deleted').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('test_project_resets_engagement_idx').on(table.tenant_id, table.engagement_id, table.reset_at),
]);

// AIA §14.1 — SOV version history (one row per version of an engagement's SOV).
// Parent of schedule_of_values line items; carries the §4 9-stage state machine.
export const sov_versions = pgTable('sov_versions', {
  sov_version_id: uuid('sov_version_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  version_number: integer('version_number').notNull(),
  state: text('state').notNull().default('NONE'),
  locked_at: timestamp('locked_at', { withTimezone: true }),
  retired_at: timestamp('retired_at', { withTimezone: true }),
  source_kind: text('source_kind').notNull().default('ESTIMATOR_INITIAL'),
  source_ref_id: uuid('source_ref_id'),
  source_ref_type: text('source_ref_type'),
  manager_override_by: uuid('manager_override_by').references(() => users.user_id),
  manager_override_reason: text('manager_override_reason'),
  total_value: numeric('total_value', { precision: 14, scale: 2 }),
  created_by: uuid('created_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('sov_versions_engagement_version_uidx').on(table.tenant_id, table.engagement_id, table.version_number),
  index('sov_versions_engagement_state_idx').on(table.tenant_id, table.engagement_id, table.state),
  check('sov_versions_state_check', sql`${table.state} IN ('NONE','DRAFT_AUTOGENERATED','DRAFT_ESTIMATOR_STRUCTURED','APPROVED_INTERNAL','IN_GC_NEGOTIATION','LOCKED','IN_RECONCILIATION','RETIRED')`),
  check('sov_versions_source_kind_check', sql`${table.source_kind} IN ('ESTIMATOR_INITIAL','CO_DRIVEN','TM_AUTH_DRIVEN','MANAGER_OVERRIDE','RECONCILIATION')`),
]);

// AIA §14.1 — SOV line items (locked + drafts) per sov_versions row
export const schedule_of_values = pgTable('schedule_of_values', {
  sov_line_id: uuid('sov_line_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  sov_version_id: uuid('sov_version_id').notNull().references(() => sov_versions.sov_version_id, { onDelete: 'cascade' }),
  line_number: integer('line_number').notNull(),
  description: text('description').notNull(),
  cost_code: text('cost_code'),
  scheduled_value: numeric('scheduled_value', { precision: 14, scale: 2 }).notNull().default('0'),
  line_type: text('line_type').notNull().default('LUMP_SUM'),
  tm_authorization_id: uuid('tm_authorization_id'),
  retainage_pct: numeric('retainage_pct', { precision: 5, scale: 2 }),
  // BAN-336 — hierarchical SOV (parent rolls up child leafs in the G703 grid)
  parent_line_id: uuid('parent_line_id'),
  display_item_number: text('display_item_number'),
  textura_phase_code: integer('textura_phase_code'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('schedule_of_values_version_line_uidx').on(table.tenant_id, table.sov_version_id, table.line_number),
  index('schedule_of_values_engagement_idx').on(table.tenant_id, table.engagement_id),
  index('schedule_of_values_tm_auth_idx').on(table.tenant_id, table.tm_authorization_id),
  index('schedule_of_values_parent_line_idx').on(table.tenant_id, table.parent_line_id),
  check('schedule_of_values_line_type_check', sql`${table.line_type} IN ('LUMP_SUM','TM_AUTHORIZATION','MOBILIZATION','RETAINAGE_RELEASE','DEPOSIT_DRAW_DOWN','STORED_MATERIALS','OTHER')`),
]);

// AIA §14.1 — per-contract billing format configuration (§5.2)
export const billing_format_config = pgTable('billing_format_config', {
  billing_config_id: uuid('billing_config_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  billing_format: text('billing_format').notNull(),
  gc_billing_intake_platform: text('gc_billing_intake_platform').notNull().default('DIRECT'),
  custom_template_ref: text('custom_template_ref'),
  retainage_pct: numeric('retainage_pct', { precision: 5, scale: 2 }).notNull().default('10'),
  retainage_release_trigger: text('retainage_release_trigger').notNull().default('SUBSTANTIAL_COMPLETION'),
  payment_terms: text('payment_terms').notNull().default('NET_30'),
  notarization_required: boolean('notarization_required').notNull().default(false),
  // BAN-337 — Amendment 1: notarization provider (MANUAL is the v2b default; PROOF_RON_API deferred to v2.b1)
  notarization_provider: text('notarization_provider').notNull().default('MANUAL'),
  architect_cert_required: boolean('architect_cert_required').notNull().default(false),
  lien_waiver_required: boolean('lien_waiver_required').notNull().default(false),
  get_handling: text('get_handling').notNull().default('SUMMARY_LINE_ONLY'),
  stored_materials_policy: text('stored_materials_policy').notNull().default('G703_COLUMN_G'),
  gc_certifier_name: text('gc_certifier_name'),
  gc_certifier_email: text('gc_certifier_email'),
  gc_certifier_title: text('gc_certifier_title'),
  architect_certifier_name: text('architect_certifier_name'),
  architect_certifier_email: text('architect_certifier_email'),
  architect_certifier_title: text('architect_certifier_title'),
  billing_period_definition: text('billing_period_definition').notNull().default('MONTHLY_CALENDAR'),
  tm_authorizations_permitted: boolean('tm_authorizations_permitted').notNull().default(true),
  tm_billing_doc: text('tm_billing_doc').notNull().default('SAME_AS_PAY_APP'),
  pay_app_sequence_numbering: text('pay_app_sequence_numbering').notNull().default('CONTINUOUS'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('billing_format_config_engagement_uidx').on(table.tenant_id, table.engagement_id),
  check('billing_format_config_billing_format_check', sql`${table.billing_format} IN ('AIA_G702_G703','TEXTURA_CSV_EXPORT','CUSTOM_TEMPLATE','TM_INVOICE','LUMP_SUM_PROGRESS','MIXED')`),
  check('billing_format_config_intake_platform_check', sql`${table.gc_billing_intake_platform} IN ('TEXTURA','DIRECT','OTHER')`),
  check('billing_format_config_retainage_trigger_check', sql`${table.retainage_release_trigger} IN ('SUBSTANTIAL_COMPLETION','FINAL_PAYMENT','CONTRACT_DATE','MANUAL')`),
  check('billing_format_config_payment_terms_check', sql`${table.payment_terms} IN ('NET_30','NET_45','NET_60','PAY_WHEN_PAID','CONTRACT_DEFINED')`),
  check('billing_format_config_get_handling_check', sql`${table.get_handling} IN ('SUMMARY_LINE_ONLY','NOT_APPLICABLE')`),
  check('billing_format_config_stored_materials_policy_check', sql`${table.stored_materials_policy} IN ('G703_COLUMN_G','SEPARATE_LINE','NOT_PERMITTED')`),
  check('billing_format_config_billing_period_check', sql`${table.billing_period_definition} IN ('MONTHLY_CALENDAR','MONTHLY_FROM_NTP','BIWEEKLY','CONTRACT_DEFINED')`),
  check('billing_format_config_tm_billing_doc_check', sql`${table.tm_billing_doc} IN ('SAME_AS_PAY_APP','SEPARATE_TM_INVOICE')`),
  check('billing_format_config_pay_app_seq_check', sql`${table.pay_app_sequence_numbering} IN ('CONTINUOUS','RESTART_PER_PHASE')`),
  check('billing_format_config_notarization_provider_check', sql`${table.notarization_provider} IN ('MANUAL','PROOF_RON_API','OTHER_INTEGRATION')`),
]);

// AIA §14.1 — per-contract deposit terms (§6.4)
export const deposit_terms = pgTable('deposit_terms', {
  deposit_terms_id: uuid('deposit_terms_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  deposit_pattern: text('deposit_pattern').notNull().default('NONE'),
  deposit_amount: numeric('deposit_amount', { precision: 14, scale: 2 }),
  deposit_amount_pct: numeric('deposit_amount_pct', { precision: 5, scale: 2 }),
  deposit_due_date: date('deposit_due_date'),
  deposit_received_date: date('deposit_received_date'),
  draw_down_logic: text('draw_down_logic').notNull().default('AUTO'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('deposit_terms_engagement_uidx').on(table.tenant_id, table.engagement_id),
  check('deposit_terms_pattern_check', sql`${table.deposit_pattern} IN ('MOBILIZATION_LINE','SEPARATE_INVOICE','STORED_MATERIALS','NONE')`),
  check('deposit_terms_draw_down_check', sql`${table.draw_down_logic} IN ('AUTO','MANUAL')`),
]);

// AIA §11.2 — T&M Authorizations (parent of tm_tickets; referenced by SOV TM lines)
export const tm_authorizations = pgTable('tm_authorizations', {
  tm_auth_id: uuid('tm_auth_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  authorization_number: text('authorization_number').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  authorized_by_name: text('authorized_by_name'),
  authorized_by_title: text('authorized_by_title'),
  authorized_by_date: date('authorized_by_date'),
  authorization_method: text('authorization_method').notNull().default('OTHER'),
  authorization_evidence_ref: text('authorization_evidence_ref'),
  scope_basis: text('scope_basis').notNull().default('DURING_CONSTRUCTION'),
  rate_structure: text('rate_structure').notNull().default('STANDARD_TM'),
  rate_per_hour_labor: numeric('rate_per_hour_labor', { precision: 10, scale: 2 }),
  rate_per_hour_supervision: numeric('rate_per_hour_supervision', { precision: 10, scale: 2 }),
  materials_markup_pct: numeric('materials_markup_pct', { precision: 5, scale: 2 }),
  not_to_exceed_amount: numeric('not_to_exceed_amount', { precision: 14, scale: 2 }),
  sov_line_id: uuid('sov_line_id').references((): AnyPgColumn => schedule_of_values.sov_line_id),
  status: text('status').notNull().default('ACTIVE'),
  converted_to_co_ref: text('converted_to_co_ref'),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('tm_authorizations_engagement_number_uidx').on(table.tenant_id, table.engagement_id, table.authorization_number),
  index('tm_authorizations_engagement_status_idx').on(table.tenant_id, table.engagement_id, table.status),
  check('tm_authorizations_method_check', sql`${table.authorization_method} IN ('VERBAL','EMAIL','WRITTEN_WORK_ORDER','OTHER')`),
  check('tm_authorizations_scope_basis_check', sql`${table.scope_basis} IN ('PUNCHLIST_PERIOD','DURING_CONSTRUCTION','OTHER')`),
  check('tm_authorizations_rate_structure_check', sql`${table.rate_structure} IN ('STANDARD_TM','NEGOTIATED_RATE','NTE')`),
  check('tm_authorizations_status_check', sql`${table.status} IN ('ACTIVE','CLOSED','DISPUTED','CONVERTED_TO_CO')`),
]);

// AIA §14.1 — pay applications (parent of pay_app_line_items, pay_app_states)
export const pay_applications = pgTable('pay_applications', {
  pay_app_id: uuid('pay_app_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  pay_app_number: integer('pay_app_number').notNull(),
  period_start: date('period_start').notNull(),
  period_end: date('period_end').notNull(),
  state: text('state').notNull().default('PENDING_DRAFT'),
  sov_version_id: uuid('sov_version_id').references(() => sov_versions.sov_version_id),
  contract_sum_original: numeric('contract_sum_original', { precision: 14, scale: 2 }),
  net_change_by_co: numeric('net_change_by_co', { precision: 14, scale: 2 }).notNull().default('0'),
  contract_sum_to_date: numeric('contract_sum_to_date', { precision: 14, scale: 2 }),
  work_completed_to_date: numeric('work_completed_to_date', { precision: 14, scale: 2 }).notNull().default('0'),
  stored_materials_to_date: numeric('stored_materials_to_date', { precision: 14, scale: 2 }).notNull().default('0'),
  retainage_held: numeric('retainage_held', { precision: 14, scale: 2 }).notNull().default('0'),
  total_earned_less_retainage: numeric('total_earned_less_retainage', { precision: 14, scale: 2 }).notNull().default('0'),
  less_previous_certificates: numeric('less_previous_certificates', { precision: 14, scale: 2 }).notNull().default('0'),
  current_amount_due: numeric('current_amount_due', { precision: 14, scale: 2 }).notNull().default('0'),
  notarization_required: boolean('notarization_required').notNull().default(false),
  architect_cert_required: boolean('architect_cert_required').notNull().default(false),
  submitted_at: timestamp('submitted_at', { withTimezone: true }),
  architect_certified_at: timestamp('architect_certified_at', { withTimezone: true }),
  gc_approved_at: timestamp('gc_approved_at', { withTimezone: true }),
  rejected_at: timestamp('rejected_at', { withTimezone: true }),
  rejection_reason: text('rejection_reason'),
  rejection_actor_id: uuid('rejection_actor_id'),
  rejection_at: timestamp('rejection_at', { withTimezone: true }),
  // BAN-336 — drives the 3 PDF renderers in lib/aia/pay-app-pdf.tsx
  billing_format: text('billing_format').notNull().default('AIA_G702_G703'),
  is_retainage_release: boolean('is_retainage_release').notNull().default(false),
  // BAN-338 v2c — PM toggle. When true, submitted/paid lifecycle events
  // auto-generate CONDITIONAL_FINAL / UNCONDITIONAL_FINAL waivers instead of
  // the PROGRESS variants. Default false; flipped from the PM UI when the
  // project closes out.
  is_final_pay_app: boolean('is_final_pay_app').notNull().default(false),
  pdf_drive_id: text('pdf_drive_id'),
  created_by: uuid('created_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('pay_applications_engagement_number_uidx').on(table.tenant_id, table.engagement_id, table.pay_app_number),
  index('pay_applications_engagement_state_idx').on(table.tenant_id, table.engagement_id, table.state),
  index('pay_applications_period_idx').on(table.tenant_id, table.engagement_id, table.period_end),
  check('pay_applications_state_check', sql`${table.state} IN ('PENDING_DRAFT','READY_FOR_NOTARIZATION','READY_FOR_SUBMISSION','SUBMITTED','ARCHITECT_CERTIFIED','GC_APPROVED','PAID_PARTIAL','PAID_FULL','REJECTED')`),
  check('pay_applications_period_order_check', sql`${table.period_end} >= ${table.period_start}`),
  check('pay_applications_billing_format_check', sql`${table.billing_format} IN ('AIA_G702_G703','CUSTOM_TEMPLATE_AIA_STYLE','CUSTOM_TEMPLATE_SCHEDULE_ABC','TEXTURA_CSV_EXPORT')`),
]);

// AIA §14.1 — pay app G703 line items
export const pay_app_line_items = pgTable('pay_app_line_items', {
  pay_app_line_id: uuid('pay_app_line_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  pay_app_id: uuid('pay_app_id').notNull().references(() => pay_applications.pay_app_id, { onDelete: 'cascade' }),
  sov_line_id: uuid('sov_line_id').references(() => schedule_of_values.sov_line_id),
  tm_authorization_id: uuid('tm_authorization_id').references(() => tm_authorizations.tm_auth_id),
  line_number: integer('line_number').notNull(),
  line_type: text('line_type').notNull().default('LUMP_SUM'),
  description: text('description').notNull(),
  scheduled_value: numeric('scheduled_value', { precision: 14, scale: 2 }).notNull().default('0'),
  work_completed_previous: numeric('work_completed_previous', { precision: 14, scale: 2 }).notNull().default('0'),
  work_completed_this_period: numeric('work_completed_this_period', { precision: 14, scale: 2 }).notNull().default('0'),
  stored_materials: numeric('stored_materials', { precision: 14, scale: 2 }).notNull().default('0'),
  total_completed_and_stored: numeric('total_completed_and_stored', { precision: 14, scale: 2 }).notNull().default('0'),
  percent_complete: numeric('percent_complete', { precision: 5, scale: 2 }).notNull().default('0'),
  retainage_held: numeric('retainage_held', { precision: 14, scale: 2 }).notNull().default('0'),
  balance_to_finish: numeric('balance_to_finish', { precision: 14, scale: 2 }).notNull().default('0'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('pay_app_line_items_pay_app_line_uidx').on(table.pay_app_id, table.line_number),
  index('pay_app_line_items_sov_line_idx').on(table.tenant_id, table.sov_line_id),
  check('pay_app_line_items_line_type_check', sql`${table.line_type} IN ('LUMP_SUM','TM_AUTHORIZATION','MOBILIZATION','RETAINAGE_RELEASE','DEPOSIT_DRAW_DOWN','STORED_MATERIALS','OTHER')`),
]);

// AIA §14.1 — pay app state transition history
export const pay_app_states = pgTable('pay_app_states', {
  state_change_id: uuid('state_change_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  pay_app_id: uuid('pay_app_id').notNull().references(() => pay_applications.pay_app_id, { onDelete: 'cascade' }),
  from_state: text('from_state'),
  to_state: text('to_state').notNull(),
  changed_by: uuid('changed_by').references(() => users.user_id),
  changed_at: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('pay_app_states_pay_app_idx').on(table.pay_app_id, table.changed_at),
]);

// AIA §14.1 + §8 — Notarization sessions (BAN-337 v2b: manual-upload primary,
// Proof RON automated integration deferred to v2.b1).
export const notarization_sessions = pgTable('notarization_sessions', {
  session_id: uuid('session_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  target_kind: text('target_kind').notNull(),
  pay_app_id: uuid('pay_app_id').references(() => pay_applications.pay_app_id),
  // BAN-337 — distinguishes manual-upload vs Proof RON automation (forward-compatible)
  notarization_source: text('notarization_source').notNull().default('MANUAL_UPLOAD'),
  provider: text('provider').notNull().default('PROOF'),
  provider_session_id: text('provider_session_id'),
  provider_session_url: text('provider_session_url'),
  signer_user_id: uuid('signer_user_id').references(() => users.user_id),
  notary_name: text('notary_name'),
  notary_state: text('notary_state'),
  notary_commission_expires: date('notary_commission_expires'),
  notary_cert_ref: text('notary_cert_ref'),
  notarization_date: date('notarization_date'),
  notarization_method: text('notarization_method'),
  signed_pdf_drive_id: text('signed_pdf_drive_id'),
  uploaded_by: uuid('uploaded_by').references(() => users.user_id),
  state: text('state').notNull().default('CREATED'),
  cost_amount: numeric('cost_amount', { precision: 10, scale: 2 }),
  initiated_at: timestamp('initiated_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  failure_reason: text('failure_reason'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('notarization_sessions_engagement_idx').on(table.tenant_id, table.engagement_id, table.state),
  index('notarization_sessions_pay_app_idx').on(table.tenant_id, table.pay_app_id),
  index('notarization_sessions_source_idx').on(table.tenant_id, table.notarization_source),
  check('notarization_sessions_target_kind_check', sql`${table.target_kind} IN ('PAY_APP','LIEN_WAIVER')`),
  check('notarization_sessions_state_check', sql`${table.state} IN ('CREATED','INITIATED','IN_PROGRESS','COMPLETED','FAILED','CANCELLED','EXPIRED')`),
  check('notarization_sessions_source_check', sql`${table.notarization_source} IN ('MANUAL_UPLOAD','PROOF_RON_API','OTHER_INTEGRATION')`),
  check('notarization_sessions_method_check', sql`${table.notarization_method} IS NULL OR ${table.notarization_method} IN ('IN_PERSON','REMOTE_ONLINE_PROOF','REMOTE_ONLINE_OTHER','MOBILE_NOTARY','OTHER')`),
]);

// AIA §14.1 + §10 — lien waivers (BAN-338 v2c extends with auto-generation
// metadata: GENERATED/SUPERSEDED states, trigger_source, generated_at/
// notarized_at/filed_at timestamps, and the separated pdf_drive_id +
// notarized_pdf_drive_id refs).
export const lien_waivers = pgTable('lien_waivers', {
  waiver_id: uuid('waiver_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  pay_app_id: uuid('pay_app_id').references(() => pay_applications.pay_app_id),
  waiver_type: text('waiver_type').notNull(),
  waiver_amount: numeric('waiver_amount', { precision: 14, scale: 2 }),
  through_date: date('through_date'),
  state: text('state').notNull().default('PENDING'),
  notarization_session_id: uuid('notarization_session_id').references(() => notarization_sessions.session_id),
  drive_file_ref: text('drive_file_ref'),
  // BAN-338 — explicit pdf refs (pre- and post-notarization)
  pdf_drive_id: text('pdf_drive_id'),
  notarized_pdf_drive_id: text('notarized_pdf_drive_id'),
  // BAN-338 — lifecycle timestamps mirroring the 3-state progression
  generated_at: timestamp('generated_at', { withTimezone: true }),
  notarized_at: timestamp('notarized_at', { withTimezone: true }),
  filed_at: timestamp('filed_at', { withTimezone: true }),
  trigger_source: text('trigger_source'),
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  delivered_method: text('delivered_method'),
  released_at: timestamp('released_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('lien_waivers_engagement_state_idx').on(table.tenant_id, table.engagement_id, table.state),
  index('lien_waivers_pay_app_idx').on(table.tenant_id, table.pay_app_id),
  check('lien_waivers_type_check', sql`${table.waiver_type} IN ('CONDITIONAL_PROGRESS','UNCONDITIONAL_PROGRESS','CONDITIONAL_FINAL','UNCONDITIONAL_FINAL')`),
  check('lien_waivers_state_check', sql`${table.state} IN ('GENERATED','PENDING','NOTARIZED','FILED','DELIVERED','RELEASED','VOIDED','SUPERSEDED')`),
  check('lien_waivers_trigger_source_check', sql`${table.trigger_source} IS NULL OR ${table.trigger_source} IN ('AUTO_PAY_APP_SUBMITTED','AUTO_PAY_APP_PAID','MANUAL')`),
]);

// AIA §14.1 + §9 — cash receipts against pay apps
export const cash_receipts = pgTable('cash_receipts', {
  receipt_id: uuid('receipt_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  pay_app_id: uuid('pay_app_id').references(() => pay_applications.pay_app_id),
  receipt_date: date('receipt_date').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  source: text('source').notNull().default('MANUAL'),
  qbo_payment_ref: text('qbo_payment_ref'),
  reconciliation_status: text('reconciliation_status').notNull().default('UNMATCHED'),
  matched_by: uuid('matched_by').references(() => users.user_id),
  matched_at: timestamp('matched_at', { withTimezone: true }),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('cash_receipts_engagement_idx').on(table.tenant_id, table.engagement_id, table.receipt_date),
  index('cash_receipts_pay_app_idx').on(table.tenant_id, table.pay_app_id),
  check('cash_receipts_source_check', sql`${table.source} IN ('MANUAL','QBO_FEED')`),
  check('cash_receipts_reconciliation_status_check', sql`${table.reconciliation_status} IN ('UNMATCHED','FULL','PARTIAL','OVER')`),
]);

// AIA §14.1 + §9.3 — retainage held per pay app (per-line granularity supported)
export const retainage_holdings = pgTable('retainage_holdings', {
  holding_id: uuid('holding_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  pay_app_id: uuid('pay_app_id').notNull().references(() => pay_applications.pay_app_id, { onDelete: 'cascade' }),
  pay_app_line_id: uuid('pay_app_line_id').references(() => pay_app_line_items.pay_app_line_id, { onDelete: 'cascade' }),
  amount_held: numeric('amount_held', { precision: 14, scale: 2 }).notNull().default('0'),
  release_trigger: text('release_trigger').notNull().default('SUBSTANTIAL_COMPLETION'),
  released_at: timestamp('released_at', { withTimezone: true }),
  released_pay_app_id: uuid('released_pay_app_id').references((): AnyPgColumn => pay_applications.pay_app_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('retainage_holdings_engagement_idx').on(table.tenant_id, table.engagement_id),
  index('retainage_holdings_pay_app_idx').on(table.pay_app_id),
  check('retainage_holdings_release_trigger_check', sql`${table.release_trigger} IN ('SUBSTANTIAL_COMPLETION','FINAL_PAYMENT','CONTRACT_DATE','MANUAL')`),
]);

// AIA §14.1 + §13 — PM handoff validation snapshots
export const handoff_validations = pgTable('handoff_validations', {
  validation_id: uuid('validation_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  mode: text('mode').notNull(),
  validated_by: uuid('validated_by').references(() => users.user_id),
  validated_at: timestamp('validated_at', { withTimezone: true }).notNull().defaultNow(),
  sov_state_at_handoff: text('sov_state_at_handoff'),
  sov_version_id: uuid('sov_version_id').references(() => sov_versions.sov_version_id),
  missing_fields: jsonb('missing_fields').notNull().default(sql`'[]'::jsonb`),
  exceptions: jsonb('exceptions').notNull().default(sql`'[]'::jsonb`),
  required_field_snapshot: jsonb('required_field_snapshot').notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('handoff_validations_engagement_idx').on(table.tenant_id, table.engagement_id, table.validated_at),
  check('handoff_validations_mode_check', sql`${table.mode} IN ('ACCEPT','REJECT_NEEDS_FIX','ACCEPT_WITH_EXCEPTIONS')`),
]);

// AIA §11.3 — T&M Tickets (child of tm_authorizations)
export const tm_tickets = pgTable('tm_tickets', {
  ticket_id: uuid('ticket_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  tm_auth_id: uuid('tm_auth_id').notNull().references(() => tm_authorizations.tm_auth_id, { onDelete: 'cascade' }),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  ticket_number: text('ticket_number').notNull(),
  work_date: date('work_date').notNull(),
  description: text('description'),
  location: jsonb('location').notNull().default(sql`'{}'::jsonb`),
  labor: jsonb('labor').notNull().default(sql`'[]'::jsonb`),
  labor_total: numeric('labor_total', { precision: 14, scale: 2 }).notNull().default('0'),
  materials: jsonb('materials').notNull().default(sql`'[]'::jsonb`),
  materials_subtotal: numeric('materials_subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  materials_markup: numeric('materials_markup', { precision: 14, scale: 2 }).notNull().default('0'),
  materials_total: numeric('materials_total', { precision: 14, scale: 2 }).notNull().default('0'),
  equipment: jsonb('equipment').notNull().default(sql`'[]'::jsonb`),
  equipment_total: numeric('equipment_total', { precision: 14, scale: 2 }).notNull().default('0'),
  ticket_total: numeric('ticket_total', { precision: 14, scale: 2 }).notNull().default('0'),
  photos: jsonb('photos').notNull().default(sql`'[]'::jsonb`),
  field_signoff_by: uuid('field_signoff_by').references(() => users.user_id),
  field_signoff_at: timestamp('field_signoff_at', { withTimezone: true }),
  gc_signoff_required: boolean('gc_signoff_required').notNull().default(false),
  gc_signoff_name: text('gc_signoff_name'),
  gc_signoff_at: timestamp('gc_signoff_at', { withTimezone: true }),
  gc_signoff_evidence_ref: text('gc_signoff_evidence_ref'),
  status: text('status').notNull().default('DRAFT'),
  pay_app_id: uuid('pay_app_id').references(() => pay_applications.pay_app_id),
  billed_at: timestamp('billed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('tm_tickets_engagement_number_uidx').on(table.tenant_id, table.engagement_id, table.ticket_number),
  index('tm_tickets_tm_auth_status_idx').on(table.tenant_id, table.tm_auth_id, table.status),
  index('tm_tickets_pay_app_idx').on(table.tenant_id, table.pay_app_id),
  check('tm_tickets_status_check', sql`${table.status} IN ('DRAFT','LOGGED','READY_FOR_GC_APPROVAL','GC_APPROVED','DISPUTED','BILLABLE','BILLED','PAID','REJECTED')`),
]);

// AIA §14.1 + §7.10 — Oracle Textura CSV submission records (BAN-337 v2b
// extends with bundle drive ids + external submission id; status enum
// expanded for the v2b GENERATED → UPLOADED_TO_TEXTURA → CONFIRMED chain).
export const textura_submissions = pgTable('textura_submissions', {
  submission_id: uuid('submission_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  pay_app_id: uuid('pay_app_id').notNull().references(() => pay_applications.pay_app_id, { onDelete: 'cascade' }),
  csv_file_ref: text('csv_file_ref'),
  bundle_drive_id: text('bundle_drive_id'),
  csv_drive_id: text('csv_drive_id'),
  notarized_pdf_drive_id: text('notarized_pdf_drive_id'),
  textura_submission_id: text('textura_submission_id'),
  textura_submission_id_external: text('textura_submission_id_external'),
  submission_status: text('submission_status').notNull().default('UPLOADED'),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  submitted_by: uuid('submitted_by').references(() => users.user_id),
  failure_reason: text('failure_reason'),
  created_by: uuid('created_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('textura_submissions_engagement_idx').on(table.tenant_id, table.engagement_id),
  index('textura_submissions_pay_app_idx').on(table.pay_app_id),
  check('textura_submissions_status_check', sql`${table.submission_status} IN ('GENERATED','UPLOADED','UPLOADED_TO_TEXTURA','CONFIRMED_BY_TEXTURA','FAILED','REJECTED','REJECTED_BY_TEXTURA','ACCEPTED','RESUBMITTED')`),
]);

// ─── BAN-304 Pass 3b: Closeout v1.1 entity schema ───────────────────────────
// Per BAN-304 D1-D6, Closeout Trunk v1.1 §19.1 + §5/§6.2/§7/§8.1/§8.6/§9.3/§11.3/§12/§13/§16.2.
// All ten child entities inherit test-vs-production status from engagements.is_test_project
// (TPA §10.2 inheritance; D2). gold_dataset_entries is the documented exception that
// denormalises the flag (D2 carve-out). Activity Spine event_contract.ts NOT modified —
// PROJECT_STATE_CHANGED already covers the spec's PROJECT_LIFECYCLE_STATE_CHANGED (D5).
// See ADR-013.

// 10 enum types — created by migration 0015 as native Postgres enums (divergence
// from the 0014 text+CHECK pattern is intentional per BAN-304 dispatch; rationale
// in ADR-013).
export const projectLifecycleStateEnum = pgEnum('project_lifecycle_state', [
  'IN_CLOSEOUT',
  'SUBSTANTIALLY_COMPLETE',
  'FINAL_COMPLETE',
  'ARCHIVED',
]);

export const punchListItemSourceEnum = pgEnum('punch_list_item_source', [
  'FIELD_ISSUE',
  'SUBSTANTIAL_WALKTHROUGH',
  'GC_TRANSMITTAL',
  'OWNER_WALKTHROUGH',
  'ARCHITECT_WALKTHROUGH',
  'INTERNAL_QA',
]);

export const punchListItemCategoryEnum = pgEnum('punch_list_item_category', [
  'GLASS',
  'FRAMING',
  'HARDWARE',
  'SEALANT',
  'FINISH',
  'CLEANING',
  'DOCUMENTATION',
  'OTHER',
]);

export const punchListResponsiblePartyEnum = pgEnum('punch_list_responsible_party', [
  'KULA',
  'OTHER_TRADE',
  'GC',
  'DISPUTED',
]);

export const punchListItemStatusEnum = pgEnum('punch_list_item_status', [
  'NEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'SIGNED_OFF',
  'DISPUTED',
  'DEFERRED_TO_WARRANTY',
]);

export const warrantyStatusEnum = pgEnum('warranty_status', [
  'ACTIVE',
  'EXPIRED',
  'PARTIALLY_EXPIRED',
]);

export const warrantyClaimInboundSourceEnum = pgEnum('warranty_claim_inbound_source', [
  'EMAIL',
  'PHONE',
  'PORTAL',
  'FIELD_DISCOVERY',
]);

export const warrantyClaimTriageResultEnum = pgEnum('warranty_claim_triage_result', [
  'KULA_RESPONSIBLE',
  'MANUFACTURER_RESPONSIBLE',
  'OTHER_TRADE_RESPONSIBLE',
  'OUT_OF_WARRANTY',
  'DISPUTED',
]);

export const warrantyClaimResolutionEnum = pgEnum('warranty_claim_resolution', [
  'COMPLETED',
  'REFERRED',
  'WRITTEN_OFF',
  'UNRESOLVED',
]);

export const deliverableTypeEnum = pgEnum('deliverable_type', [
  'AS_BUILT_DRAWING',
  'OM_MANUAL_COMPONENT',
  'OM_MANUAL_COMPLETE',
  'UNIFIED_JOB_PACKET',
  'OTHER',
]);

// Closeout §16.2 — engagement state transition audit log
export const project_lifecycle_states = pgTable('project_lifecycle_states', {
  lifecycle_state_id: uuid('lifecycle_state_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id, { onDelete: 'cascade' }),
  state: projectLifecycleStateEnum('state').notNull(),
  entered_at: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  exited_at: timestamp('exited_at', { withTimezone: true }),
  reopen_reason: text('reopen_reason'),
  reopen_by: uuid('reopen_by').references(() => users.user_id),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('project_lifecycle_states_engagement_idx').on(table.tenant_id, table.engagement_id, table.entered_at),
  index('project_lifecycle_states_state_idx').on(table.tenant_id, table.state, table.entered_at),
  check('project_lifecycle_states_reopen_pair_check', sql`(${table.reopen_reason} IS NULL AND ${table.reopen_by} IS NULL) OR (${table.reopen_reason} IS NOT NULL AND ${table.reopen_by} IS NOT NULL)`),
]);

// Closeout §6.2 — punch list items
export const punch_list_items = pgTable('punch_list_items', {
  punch_item_id: uuid('punch_item_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  item_number: integer('item_number').notNull(),
  source: punchListItemSourceEnum('source').notNull(),
  source_ref: text('source_ref'),
  description: text('description').notNull(),
  location: jsonb('location').notNull().default(sql`'{}'::jsonb`),
  category: punchListItemCategoryEnum('category').notNull().default('OTHER'),
  responsible_party: punchListResponsiblePartyEnum('responsible_party').notNull().default('KULA'),
  photos_required: boolean('photos_required').notNull().default(false),
  photo_evidence: text('photo_evidence').array().notNull().default(sql`ARRAY[]::text[]`),
  assigned_to: uuid('assigned_to').references(() => users.user_id),
  due_date: date('due_date'),
  status: punchListItemStatusEnum('status').notNull().default('NEW'),
  completion_evidence: jsonb('completion_evidence').notNull().default(sql`'{}'::jsonb`),
  signoff_evidence: jsonb('signoff_evidence').notNull().default(sql`'{}'::jsonb`),
  dispute_reason: text('dispute_reason'),
  dispute_resolution: jsonb('dispute_resolution'),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('punch_list_items_engagement_number_uidx').on(table.tenant_id, table.engagement_id, table.item_number),
  index('punch_list_items_engagement_status_idx').on(table.tenant_id, table.engagement_id, table.status),
  index('punch_list_items_assigned_status_idx').on(table.tenant_id, table.assigned_to, table.status),
]);

// Closeout §7 — substantial completion attestation
export const substantial_completion_certs = pgTable('substantial_completion_certs', {
  cert_id: uuid('cert_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  walkthrough_date: date('walkthrough_date').notNull(),
  attendees: jsonb('attendees').notNull().default(sql`'[]'::jsonb`),
  per_system_completion: jsonb('per_system_completion').notNull().default(sql`'{}'::jsonb`),
  cert_evidence_drive_id: text('cert_evidence_drive_id'),
  gc_signoff_evidence_drive_id: text('gc_signoff_evidence_drive_id'),
  signed_at: timestamp('signed_at', { withTimezone: true }),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('substantial_completion_certs_engagement_uidx').on(table.tenant_id, table.engagement_id),
  index('substantial_completion_certs_walkthrough_idx').on(table.tenant_id, table.walkthrough_date),
]);

// Closeout §8.1 — active warranty registry
export const warranties = pgTable('warranties', {
  warranty_id: uuid('warranty_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  start_date: date('start_date').notNull(),
  scope_warranties: jsonb('scope_warranties').notNull().default(sql`'[]'::jsonb`),
  status: warrantyStatusEnum('status').notNull().default('ACTIVE'),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('warranties_engagement_uidx').on(table.tenant_id, table.engagement_id),
  index('warranties_status_idx').on(table.tenant_id, table.status),
]);

// Closeout §8.6 — warranty claims (FK warranties; service_wo_id is a text kID
// reference because service WOs remain in Sheets per ADR-026).
export const warranty_claims = pgTable('warranty_claims', {
  claim_id: uuid('claim_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  warranty_id: uuid('warranty_id').notNull().references(() => warranties.warranty_id, { onDelete: 'cascade' }),
  inbound_source: warrantyClaimInboundSourceEnum('inbound_source').notNull(),
  inbound_evidence: text('inbound_evidence'),
  inbound_date: date('inbound_date').notNull(),
  reported_by: jsonb('reported_by').notNull().default(sql`'{}'::jsonb`),
  issue_description: text('issue_description').notNull(),
  affected_scope: text('affected_scope'),
  triage_result: warrantyClaimTriageResultEnum('triage_result'),
  triage_by: uuid('triage_by').references(() => users.user_id),
  triage_at: timestamp('triage_at', { withTimezone: true }),
  triage_reasoning: text('triage_reasoning'),
  service_wo_id: text('service_wo_id'),
  back_charge_id: uuid('back_charge_id'),
  resolution: warrantyClaimResolutionEnum('resolution'),
  resolution_evidence_drive_id: text('resolution_evidence_drive_id'),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('warranty_claims_warranty_idx').on(table.tenant_id, table.warranty_id, table.inbound_date),
  index('warranty_claims_engagement_idx').on(table.tenant_id, table.engagement_id, table.inbound_date),
  index('warranty_claims_service_wo_idx').on(table.tenant_id, table.service_wo_id),
]);

// Closeout §11.3 — HRS Notice of Completion filing record
export const notices_of_completion = pgTable('notices_of_completion', {
  noc_id: uuid('noc_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  filed_date: date('filed_date').notNull(),
  recording_number: text('recording_number'),
  recording_evidence_drive_id: text('recording_evidence_drive_id'),
  hrs_basis: text('hrs_basis'),
  lien_deadline_days: integer('lien_deadline_days').notNull().default(45),
  lien_deadline_date: date('lien_deadline_date'),
  filed_by: uuid('filed_by').references(() => users.user_id),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('notices_of_completion_engagement_uidx').on(table.tenant_id, table.engagement_id),
  index('notices_of_completion_lien_deadline_idx').on(table.tenant_id, table.lien_deadline_date),
]);

// Closeout §9.3 — closeout deliverables (as-builts, O&M manuals, packets)
export const deliverable_documents = pgTable('deliverable_documents', {
  deliverable_id: uuid('deliverable_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  deliverable_type: deliverableTypeEnum('deliverable_type').notNull(),
  category: text('category'),
  drive_file_id: text('drive_file_id').notNull(),
  version: integer('version').notNull().default(1),
  uploaded_by: uuid('uploaded_by').references(() => users.user_id),
  uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  required_for_state: projectLifecycleStateEnum('required_for_state'),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('deliverable_documents_engagement_idx').on(table.tenant_id, table.engagement_id, table.deliverable_type),
  index('deliverable_documents_required_state_idx').on(table.tenant_id, table.required_for_state).where(sql`${table.required_for_state} IS NOT NULL`),
]);

// Closeout §13 — generated unified packet snapshots
export const unified_job_packets = pgTable('unified_job_packets', {
  packet_id: uuid('packet_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  template_version: text('template_version').notNull(),
  drive_file_id: text('drive_file_id').notNull(),
  generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  generated_by: uuid('generated_by').references(() => users.user_id),
  sections_included: jsonb('sections_included').notNull().default(sql`'[]'::jsonb`),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('unified_job_packets_engagement_idx').on(table.tenant_id, table.engagement_id, table.generated_at),
]);

// Closeout §12 — denormalised gold dataset entries (carries test_project per D2 carve-out)
export const gold_dataset_entries = pgTable('gold_dataset_entries', {
  gold_entry_id: uuid('gold_entry_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  project_classification: jsonb('project_classification').notNull().default(sql`'{}'::jsonb`),
  bid_data: jsonb('bid_data').notNull().default(sql`'{}'::jsonb`),
  actual_data: jsonb('actual_data').notNull().default(sql`'{}'::jsonb`),
  schedule_data: jsonb('schedule_data').notNull().default(sql`'{}'::jsonb`),
  punch_list_data: jsonb('punch_list_data').notNull().default(sql`'{}'::jsonb`),
  warranty_data: jsonb('warranty_data').notNull().default(sql`'{}'::jsonb`),
  inter_island_logistics_data: jsonb('inter_island_logistics_data').notNull().default(sql`'{}'::jsonb`),
  test_project: boolean('test_project').notNull().default(false),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('gold_dataset_entries_engagement_uidx').on(table.tenant_id, table.engagement_id),
  index('gold_dataset_entries_production_default_idx').on(table.tenant_id, table.engagement_id).where(sql`${table.test_project} = false`),
]);

// Closeout §5 — denormalised search payload for closeout search UI
export const project_search_indexes = pgTable('project_search_indexes', {
  search_index_id: uuid('search_index_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id, { onDelete: 'cascade' }),
  index_payload: text('index_payload').notNull(),
  last_indexed_at: timestamp('last_indexed_at', { withTimezone: true }).notNull().defaultNow(),
  index_version: integer('index_version').notNull().default(1),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_by: uuid('updated_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('project_search_indexes_engagement_uidx').on(table.tenant_id, table.engagement_id),
  index('project_search_indexes_last_indexed_idx').on(table.tenant_id, table.last_indexed_at),
]);

// ─── PM Trunk v1.0 §5 — Submittal Log (BAN-340) ──────────────────────────────

export const submittalTypeEnum = pgEnum('submittal_type', [
  'ACTION',
  'PHYSICAL',
  'CLOSEOUT',
]);

export const submittalStatusEnum = pgEnum('submittal_status', [
  'REQUIRED',
  'IN_PROGRESS',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'APPROVED_AS_NOTED',
  'REVISE_RESUBMIT',
  'REJECTED',
  'CLOSED',
]);

export const submittalSubmittedToEnum = pgEnum('submittal_submitted_to', [
  'GC',
  'ARCHITECT',
  'ENGINEER',
  'OWNER',
]);

export const submittalBallInCourtEnum = pgEnum('submittal_ball_in_court', [
  'SUBCONTRACTOR',
  'GC',
  'ARCHITECT',
  'ENGINEER',
  'OWNER',
]);

export const submittalSourceEnum = pgEnum('submittal_source', [
  'PM_MANUAL',
  'KAI_EXTRACTED_FROM_SPEC',
]);

export const submittals = pgTable('submittals', {
  submittal_id: uuid('submittal_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),

  submittal_number: text('submittal_number').notNull(),
  display_label: text('display_label'),

  csi_division: text('csi_division'),
  csi_spec_section: text('csi_spec_section').notNull(),
  csi_subsection: text('csi_subsection').notNull(),
  csi_sub_subsection: text('csi_sub_subsection').notNull(),
  spec_document_ref: text('spec_document_ref'),

  submittal_type: submittalTypeEnum('submittal_type').notNull(),
  description: text('description'),
  requirements_text: text('requirements_text'),
  required_quantity: integer('required_quantity'),

  status: submittalStatusEnum('status').notNull().default('REQUIRED'),

  required_by_date: date('required_by_date'),
  submitted_to: submittalSubmittedToEnum('submitted_to'),
  submitted_date: date('submitted_date'),
  reviewed_date: date('reviewed_date'),
  approved_date: date('approved_date'),
  closed_date: date('closed_date'),

  lead_time_days: integer('lead_time_days'),

  ball_in_court: submittalBallInCourtEnum('ball_in_court'),
  current_assignee_user_id: uuid('current_assignee_user_id').references(() => users.user_id),

  submitted_documents: text('submitted_documents').array().notNull().default(sql`ARRAY[]::text[]`),
  review_comments_documents: text('review_comments_documents').array().notNull().default(sql`ARRAY[]::text[]`),
  approved_documents: text('approved_documents').array().notNull().default(sql`ARRAY[]::text[]`),

  external_visible: boolean('external_visible').notNull().default(false),

  source: submittalSourceEnum('source').notNull().default('PM_MANUAL'),
  kai_extraction_confidence: numeric('kai_extraction_confidence', { precision: 3, scale: 2 }),
  kai_extraction_ref: uuid('kai_extraction_ref'),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('submittals_number_uidx').on(table.submittal_number),
  unique('submittals_engagement_csi_uidx').on(
    table.engagement_id,
    table.csi_spec_section,
    table.csi_subsection,
    table.csi_sub_subsection,
  ),
  index('submittals_engagement_idx').on(table.engagement_id),
  index('submittals_status_idx').on(table.status),
  index('submittals_ball_in_court_idx').on(table.ball_in_court),
  index('submittals_required_by_date_idx').on(table.required_by_date),
  check(
    'submittals_csi_spec_section_format',
    sql`${table.csi_spec_section} ~ '^[0-9]{5}$|^[0-9]{6}$'`,
  ),
  check(
    'submittals_csi_subsection_format',
    sql`${table.csi_subsection} ~ '^[0-9]+\\.[0-9]+$'`,
  ),
  check(
    'submittals_csi_sub_subsection_format',
    sql`${table.csi_sub_subsection} ~ '^[A-Z]$|^[1-9]$'`,
  ),
]);

// ─── PM Trunk v1.0 §6 — RFI Log (BAN-341) ────────────────────────────────────

export const rfiReasonEnum = pgEnum('rfi_reason', [
  'SCOPE_CLARIFICATION',
  'DRAWING_CONFLICT',
  'SPEC_AMBIGUITY',
  'FIELD_CONDITION',
  'DESIGN_INTENT',
  'OTHER',
]);

export const rfiStatusEnum = pgEnum('rfi_status', [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ANSWERED',
  'RESOLVED',
  'CLOSED',
  'VOID',
]);

export const rfiSubmittedToEnum = pgEnum('rfi_submitted_to', [
  'GC',
  'ARCHITECT',
  'ENGINEER',
  'OWNER',
]);

export const rfiBallInCourtEnum = pgEnum('rfi_ball_in_court', [
  'SUBCONTRACTOR',
  'GC',
  'ARCHITECT',
  'ENGINEER',
  'OWNER',
]);

export const rfis = pgTable('rfis', {
  rfi_id: uuid('rfi_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),

  rfi_number: text('rfi_number').notNull(),

  subject: text('subject').notNull(),
  question: text('question').notNull(),
  reason_for_rfi: rfiReasonEnum('reason_for_rfi'),

  cost_or_schedule_impact_anticipated: boolean('cost_or_schedule_impact_anticipated').notNull().default(false),
  cost_impact_estimate: numeric('cost_impact_estimate', { precision: 14, scale: 2 }),
  schedule_impact_days: integer('schedule_impact_days'),

  submitted_to: rfiSubmittedToEnum('submitted_to'),
  submitted_date: date('submitted_date'),
  required_response_by_date: date('required_response_by_date'),

  status: rfiStatusEnum('status').notNull().default('DRAFT'),
  ball_in_court: rfiBallInCourtEnum('ball_in_court'),

  response_received_date: date('response_received_date'),
  response_text: text('response_text'),
  response_documents: text('response_documents').array().notNull().default(sql`ARRAY[]::text[]`),

  generates_change_order: boolean('generates_change_order').notNull().default(false),
  linked_change_order_id: uuid('linked_change_order_id'),

  rfi_pdf_drive_id: text('rfi_pdf_drive_id'),
  submitted_attachments: text('submitted_attachments').array().notNull().default(sql`ARRAY[]::text[]`),

  external_visible: boolean('external_visible').notNull().default(false),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  unique('rfis_number_uidx').on(table.rfi_number),
  index('rfis_engagement_idx').on(table.engagement_id),
  index('rfis_status_idx').on(table.status),
  index('rfis_ball_in_court_idx').on(table.ball_in_court),
  index('rfis_required_response_idx').on(table.required_response_by_date),
  check(
    'rfis_number_format',
    sql`${table.rfi_number} ~ '-RFI-[0-9]{3}$'`,
  ),
]);

// ─── PM Trunk v1.0 §7 — Verbal Agreement Log (BAN-342) ──────────────────────

export const verbalAgreementTypeEnum = pgEnum('verbal_agreement_type', [
  'SCOPE_CHANGE',
  'SCHEDULE_AGREEMENT',
  'T_M_AUTHORIZATION',
  'DESIGN_CLARIFICATION',
  'PAYMENT_TERM',
  'DELIVERY_COMMITMENT',
  'OTHER',
]);

export const verbalAgreementStatusEnum = pgEnum('verbal_agreement_status', [
  'LOGGED',
  'FOLLOWED_UP',
  'FORMALIZED',
  'DISPUTED',
  'RESOLVED',
]);

export const verbal_agreements = pgTable('verbal_agreements', {
  verbal_agreement_id: uuid('verbal_agreement_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),

  captured_at: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  captured_by: uuid('captured_by').references(() => users.user_id),
  occurred_at: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

  subject: text('subject').notNull(),
  external_party_org: text('external_party_org').notNull(),
  external_party_contact_name: text('external_party_contact_name'),
  external_party_contact_role: text('external_party_contact_role'),
  external_party_contact_email: text('external_party_contact_email'),
  external_party_contact_phone: text('external_party_contact_phone'),

  agreement_type: verbalAgreementTypeEnum('agreement_type').notNull().default('OTHER'),
  cost_impact_estimate: numeric('cost_impact_estimate', { precision: 14, scale: 2 }),
  schedule_impact_days: integer('schedule_impact_days'),

  agreement_summary: text('agreement_summary').notNull(),
  context_or_circumstances: text('context_or_circumstances'),

  audio_recording_drive_id: text('audio_recording_drive_id'),
  photo_documentation_drive_ids: text('photo_documentation_drive_ids').array().notNull().default(sql`ARRAY[]::text[]`),
  written_followup_email_drive_id: text('written_followup_email_drive_id'),

  followup_email_sent: boolean('followup_email_sent').notNull().default(false),
  followup_email_sent_date: date('followup_email_sent_date'),
  formal_documentation_generated: boolean('formal_documentation_generated').notNull().default(false),
  formal_documentation_ref: uuid('formal_documentation_ref'),
  formal_documentation_type: text('formal_documentation_type'),

  status: verbalAgreementStatusEnum('status').notNull().default('LOGGED'),
  external_visible: boolean('external_visible').notNull().default(false),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  index('verbal_agreements_engagement_idx').on(table.engagement_id),
  index('verbal_agreements_status_idx').on(table.status),
  index('verbal_agreements_type_idx').on(table.agreement_type),
  index('verbal_agreements_occurred_idx').on(table.occurred_at),
  check('verbal_agreements_subject_length', sql`char_length(${table.subject}) <= 200`),
  check(
    'verbal_agreements_formal_doc_type_check',
    sql`${table.formal_documentation_type} IS NULL OR ${table.formal_documentation_type} IN ('CHANGE_ORDER','TM_TICKET','RFI')`,
  ),
]);

// ── BAN-338 Pay Apps v2c — Joint Check Agreements, External Lien Waiver
// Requests, GC-Required Docs Checklist ──────────────────────────────────────

// Joint check agreements bind Kula + a manufacturer for two-party payment
// from the GC. PROPOSED → EXECUTED → ACTIVE → CLOSED (with DISPUTED side
// branch). When an ACTIVE agreement exists for a project, pay-app
// submission emails include a payment-instruction footer naming the
// manufacturer (see lib/lien-waivers/joint-check-footer.ts).
export const joint_check_agreements = pgTable('joint_check_agreements', {
  joint_check_id: uuid('joint_check_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  manufacturer_org_id: uuid('manufacturer_org_id').notNull().references(() => organizations.org_id),
  manufacturer_contact_name: text('manufacturer_contact_name'),
  manufacturer_contact_email: text('manufacturer_contact_email'),
  manufacturer_contact_phone: text('manufacturer_contact_phone'),
  scope: text('scope'),
  status: text('status').notNull().default('PROPOSED'),
  trigger_source: text('trigger_source').notNull().default('KULA_PROPOSED'),
  execution_date: date('execution_date'),
  execution_evidence_drive_id: text('execution_evidence_drive_id'),
  start_date: date('start_date'),
  end_date: date('end_date'),
  notes: text('notes'),
  created_by: uuid('created_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('joint_check_agreements_engagement_idx').on(table.tenant_id, table.engagement_id, table.status),
  index('joint_check_agreements_manufacturer_idx').on(table.tenant_id, table.manufacturer_org_id),
  check('joint_check_agreements_status_check', sql`${table.status} IN ('PROPOSED','EXECUTED','ACTIVE','CLOSED','DISPUTED')`),
  check('joint_check_agreements_trigger_source_check', sql`${table.trigger_source} IN ('GC_REQUIRED','MANUFACTURER_REQUESTED','KULA_PROPOSED')`),
]);

// Admin-driven workflow for collecting signed waivers FROM upstream
// manufacturers and forwarding them TO the GC. Lifecycle:
// REQUESTED → RECEIVED → UPLOADED → DELIVERED_TO_GC (with VOIDED escape).
export const external_lien_waiver_requests = pgTable('external_lien_waiver_requests', {
  external_waiver_id: uuid('external_waiver_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  manufacturer_org_id: uuid('manufacturer_org_id').notNull().references(() => organizations.org_id),
  manufacturer_contact_name: text('manufacturer_contact_name'),
  manufacturer_contact_email: text('manufacturer_contact_email'),
  waiver_type: text('waiver_type').notNull(),
  status: text('status').notNull().default('REQUESTED'),
  requested_at: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  requested_by: uuid('requested_by').references(() => users.user_id),
  request_method: text('request_method'),
  request_evidence_drive_id: text('request_evidence_drive_id'),
  received_at: timestamp('received_at', { withTimezone: true }),
  received_evidence_drive_id: text('received_evidence_drive_id'),
  uploaded_at: timestamp('uploaded_at', { withTimezone: true }),
  uploaded_by: uuid('uploaded_by').references(() => users.user_id),
  delivered_to_gc_at: timestamp('delivered_to_gc_at', { withTimezone: true }),
  delivered_to_gc_evidence_drive_id: text('delivered_to_gc_evidence_drive_id'),
  pay_app_id: uuid('pay_app_id').references(() => pay_applications.pay_app_id),
  joint_check_agreement_id: uuid('joint_check_agreement_id').references(() => joint_check_agreements.joint_check_id),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('external_lien_waiver_requests_engagement_idx').on(table.tenant_id, table.engagement_id, table.status),
  index('external_lien_waiver_requests_status_idx').on(table.tenant_id, table.status, table.requested_at),
  check('external_lien_waiver_requests_status_check', sql`${table.status} IN ('REQUESTED','RECEIVED','UPLOADED','DELIVERED_TO_GC','VOIDED')`),
  check('external_lien_waiver_requests_type_check', sql`${table.waiver_type} IN ('CONDITIONAL_PROGRESS','UNCONDITIONAL_PROGRESS','CONDITIONAL_FINAL','UNCONDITIONAL_FINAL')`),
  check('external_lien_waiver_requests_method_check', sql`${table.request_method} IS NULL OR ${table.request_method} IN ('EMAIL','PORTAL','MAIL','PHONE')`),
]);

// Per-engagement sticky checklist of GC-required documents (informational
// only — does NOT block pay app submission per Sean directive 2026-05-18).
export const gc_required_docs_checklist = pgTable('gc_required_docs_checklist', {
  checklist_id: uuid('checklist_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').notNull().references(() => engagements.engagement_id),
  identified_phase: text('identified_phase'),
  identified_at: timestamp('identified_at', { withTimezone: true }),
  identified_by: uuid('identified_by').references(() => users.user_id),
  requires_conditional_progress_waiver_from_kula: boolean('requires_conditional_progress_waiver_from_kula').notNull().default(true),
  requires_unconditional_progress_waiver_from_kula: boolean('requires_unconditional_progress_waiver_from_kula').notNull().default(true),
  requires_conditional_final_waiver_from_kula: boolean('requires_conditional_final_waiver_from_kula').notNull().default(true),
  requires_unconditional_final_waiver_from_kula: boolean('requires_unconditional_final_waiver_from_kula').notNull().default(true),
  requires_external_waivers_from_manufacturers: boolean('requires_external_waivers_from_manufacturers').notNull().default(false),
  external_waiver_required_manufacturers: jsonb('external_waiver_required_manufacturers').notNull().default(sql`'[]'::jsonb`),
  requires_joint_check_agreement: boolean('requires_joint_check_agreement').notNull().default(false),
  joint_check_required_manufacturers: jsonb('joint_check_required_manufacturers').notNull().default(sql`'[]'::jsonb`),
  requires_certificate_of_vendor_compliance: boolean('requires_certificate_of_vendor_compliance').notNull().default(false),
  requires_glaziers_union_lien_clearance: boolean('requires_glaziers_union_lien_clearance').notNull().default(false),
  requires_certified_payroll: boolean('requires_certified_payroll').notNull().default(false),
  requires_safety_documentation: boolean('requires_safety_documentation').notNull().default(false),
  custom_required_docs: jsonb('custom_required_docs').notNull().default(sql`'[]'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('gc_required_docs_checklist_engagement_uidx').on(table.tenant_id, table.engagement_id),
  check('gc_required_docs_checklist_phase_check', sql`${table.identified_phase} IS NULL OR ${table.identified_phase} IN ('ESTIMATING_SCOPE_REVIEW','POST_HANDOFF_REVIEW','MID_PROJECT_AMENDMENT')`),
]);

// ── BAN-343 PM-V1.0-D — Meeting Intelligence (MANUAL source in v1.0) ────────
// PM Trunk v1.0 §8.  Meetings can be cross-project (engagement_id nullable).
// source_platform reserves the Connector Framework values so future
// auto-population (Read.ai / Otter.ai / Fireflies.ai) is purely additive.

export const meetingTypeEnum = pgEnum('meeting_type', [
  'PROJECT_KICKOFF',
  'OAC',
  'DESIGN_REVIEW',
  'CONSTRUCTION_PROGRESS',
  'PRECON',
  'PRE_INSTALL',
  'PUNCHWALK',
  'PROJECT_CLOSEOUT',
  'OTHER',
]);

export const meetingSourcePlatformEnum = pgEnum('meeting_source_platform', [
  'MANUAL',
  'READ_AI',
  'OTTER_AI',
  'FIREFLIES_AI',
  'OTHER',
]);

export const meetings = pgTable('meetings', {
  meeting_id: uuid('meeting_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').references(() => engagements.engagement_id),

  title: text('title').notNull(),
  meeting_date: timestamp('meeting_date', { withTimezone: true }).notNull(),
  duration_minutes: integer('duration_minutes'),

  meeting_type: meetingTypeEnum('meeting_type'),

  summary: text('summary'),
  key_topics: text('key_topics').array().notNull().default(sql`ARRAY[]::text[]`),
  decisions_made: text('decisions_made').array().notNull().default(sql`ARRAY[]::text[]`),

  transcript_drive_file_id: text('transcript_drive_file_id'),
  source_recording_url: text('source_recording_url'),

  source_platform: meetingSourcePlatformEnum('source_platform').notNull().default('MANUAL'),
  source_external_id: text('source_external_id'),

  external_visible: boolean('external_visible').notNull().default(false),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').notNull().references(() => users.user_id),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updated_by: uuid('updated_by').references(() => users.user_id),
}, (table) => [
  index('idx_meetings_engagement').on(table.engagement_id),
  index('idx_meetings_date').on(table.meeting_date),
  index('idx_meetings_type').on(table.meeting_type),
  check('meetings_title_length', sql`char_length(${table.title}) <= 200`),
]);

export const meeting_attendees = pgTable('meeting_attendees', {
  meeting_attendee_id: uuid('meeting_attendee_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  meeting_id: uuid('meeting_id').notNull().references(() => meetings.meeting_id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  email: text('email'),
  organization: text('organization'),
  role: text('role'),

  is_kula_user: boolean('is_kula_user').notNull().default(false),
  kula_user_id: uuid('kula_user_id').references(() => users.user_id),

  attended: boolean('attended').notNull().default(true),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_meeting_attendees_meeting').on(table.meeting_id),
  index('idx_meeting_attendees_kula_user').on(table.kula_user_id),
  check(
    'meeting_attendees_kula_user_consistency',
    sql`${table.kula_user_id} IS NULL OR ${table.is_kula_user} = true`,
  ),
]);

// BAN-344 PM-V1.0-E — Action Item Tracker (Cross-Source Aggregator).
export const actionItemSourceEntityTypeEnum = pgEnum('action_item_source_entity_type', [
  'SUBMITTAL',
  'RFI',
  'VERBAL_AGREEMENT',
  'MEETING',
  'PAY_APP',
  'TM_TICKET',
  'CHANGE_ORDER',
  'PUNCH_LIST_ITEM',
  'EXTERNAL_WAIVER',
  'GC_REQUIRED_DOC',
  'WARRANTY_CLAIM',
  'MANUAL',
]);

export const actionItemPriorityEnum = pgEnum('action_item_priority', [
  'URGENT',
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const actionItemStatusEnum = pgEnum('action_item_status', [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'DEFERRED',
  'CANCELLED',
  'AUTO_CLOSED',
]);

export const action_items = pgTable('action_items', {
  action_item_id: uuid('action_item_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').references(() => engagements.engagement_id),

  source_event_type: text('source_event_type').notNull(),
  source_entity_type: actionItemSourceEntityTypeEnum('source_entity_type').notNull(),
  source_entity_id: uuid('source_entity_id').notNull(),

  title: text('title').notNull(),
  description: text('description'),
  action_required: text('action_required'),

  assigned_to: uuid('assigned_to').references(() => users.user_id),
  due_date: date('due_date'),

  priority: actionItemPriorityEnum('priority').notNull().default('MEDIUM'),
  status: actionItemStatusEnum('status').notNull().default('OPEN'),
  auto_closed_reason: text('auto_closed_reason'),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  created_by: uuid('created_by').references(() => users.user_id),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  completed_by: uuid('completed_by').references(() => users.user_id),

  notes: text('notes'),
}, (table) => [
  index('idx_action_items_tenant_engagement_status').on(table.tenant_id, table.engagement_id, table.status),
  index('idx_action_items_tenant_assignee_open')
    .on(table.tenant_id, table.assigned_to, table.status)
    .where(sql`${table.status} IN ('OPEN','IN_PROGRESS')`),
  index('idx_action_items_tenant_due_open')
    .on(table.tenant_id, table.due_date)
    .where(sql`${table.status} IN ('OPEN','IN_PROGRESS')`),
  index('idx_action_items_source_entity').on(table.source_entity_type, table.source_entity_id),
  check('action_items_title_length', sql`char_length(${table.title}) <= 300`),
]);

// BAN-345 PM-V1.0-F — Document Hub (central document repository + kind tagging).
export const documentKindEnum = pgEnum('document_kind', [
  'CONTRACT',
  'SHOP_DRAWING',
  'SUBMITTAL_PACKAGE',
  'RFI_TRANSMITTAL',
  'CO_DOCUMENT',
  'PAY_APP_PDF',
  'NOC',
  'LIEN_WAIVER',
  'PUNCH_LIST',
  'WARRANTY_LETTER',
  'AS_BUILT',
  'OM_MANUAL',
  'SPEC_BOOK',
  'PHOTO_PACKAGE',
  'EMAIL_THREAD',
  'SCHEDULE_VERSION',
  'OTHER',
]);

export const documentLinkedEntityTypeEnum = pgEnum('document_linked_entity_type', [
  'SUBMITTAL',
  'RFI',
  'CO',
  'PAY_APP',
  'PUNCH_LIST_ITEM',
  'VERBAL_AGREEMENT',
  'MEETING',
  'WARRANTY_CLAIM',
  'SCHEDULE_VERSION',
  'SCHEDULE_ACTIVITY',
  'TM_TICKET',
  'EXTERNAL_WAIVER',
  'FIELD_EVENT',
  'ACTION_ITEM',
  'OTHER',
]);

export const document_hub_entries = pgTable('document_hub_entries', {
  document_id: uuid('document_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  engagement_id: uuid('engagement_id').references(() => engagements.engagement_id),
  kid: text('kid'),

  drive_file_id: text('drive_file_id').notNull(),
  filename: text('filename').notNull(),

  kind: documentKindEnum('kind').notNull(),
  subkind: text('subkind'),

  linked_entity_type: documentLinkedEntityTypeEnum('linked_entity_type'),
  linked_entity_id: uuid('linked_entity_id'),

  external_visible: boolean('external_visible').notNull().default(false),

  version: integer('version').notNull().default(1),
  superseded_by_document_id: uuid('superseded_by_document_id').references((): AnyPgColumn => document_hub_entries.document_id),
  is_current: boolean('is_current').generatedAlwaysAs(sql`superseded_by_document_id IS NULL`),

  uploaded_by: uuid('uploaded_by').references(() => users.user_id),
  uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),

  notes: text('notes'),
  is_test_project: boolean('is_test_project').notNull().default(false),
}, (table) => [
  index('idx_document_hub_tenant_kid').on(table.tenant_id, table.kid),
  index('idx_document_hub_tenant_engagement_kind').on(table.tenant_id, table.engagement_id, table.kind),
  index('idx_document_hub_linked_entity')
    .on(table.linked_entity_type, table.linked_entity_id)
    .where(sql`${table.linked_entity_type} IS NOT NULL`),
  index('idx_document_hub_tenant_current')
    .on(table.tenant_id, table.kind)
    .where(sql`${table.is_current} = true`),
  index('idx_document_hub_drive_file').on(table.drive_file_id),
  check('document_hub_entries_filename_length', sql`char_length(${table.filename}) <= 500`),
  check(
    'document_hub_entries_linked_entity_consistency',
    sql`(${table.linked_entity_type} IS NULL AND ${table.linked_entity_id} IS NULL) OR (${table.linked_entity_type} IS NOT NULL AND ${table.linked_entity_id} IS NOT NULL)`,
  ),
]);

// BAN-346 PM-V1.0-G — PM Handoff Receipt (Estimating → PM handoff acceptance).
export const pmHandoffStateEnum = pgEnum('pm_handoff_state', [
  'pending_review',
  'reviewed_complete',
  'accepted',
  'rejected_with_gaps',
  'accepted_with_gaps',
]);

export const pm_handoff_receipts = pgTable('pm_handoff_receipts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  kid: text('kid'),
  engagement_id: uuid('engagement_id').references(() => engagements.engagement_id),
  estimate_version_id: text('estimate_version_id'),

  state: pmHandoffStateEnum('state').notNull().default('pending_review'),

  submitted_by_user_id: uuid('submitted_by_user_id').references(() => users.user_id),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),

  reviewed_by_user_id: uuid('reviewed_by_user_id').references(() => users.user_id),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),

  accepted_at: timestamp('accepted_at', { withTimezone: true }),
  rejected_at: timestamp('rejected_at', { withTimezone: true }),

  critical_gaps: jsonb('critical_gaps').notNull().default(sql`'[]'::jsonb`),
  reviewer_notes: text('reviewer_notes'),

  packet_drive_file_id: text('packet_drive_file_id'),

  is_test_project: boolean('is_test_project').notNull().default(false),

  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_pm_handoff_receipts_tenant_kid').on(table.tenant_id, table.kid),
  index('idx_pm_handoff_receipts_tenant_state_pending')
    .on(table.tenant_id, table.state)
    .where(sql`${table.state} IN ('pending_review','reviewed_complete')`),
  index('idx_pm_handoff_receipts_tenant_engagement').on(table.tenant_id, table.engagement_id),
  check(
    'pm_handoff_receipts_critical_gaps_is_array',
    sql`jsonb_typeof(${table.critical_gaps}) = 'array'`,
  ),
]);

// BAN-348 PM-V1.0-I — User dashboard layouts (PM Overview Dashboard).
// One row per (user_id, dashboard_kind).  Absent row → API serves the
// seeded default layout for the user's role.  Drag-rearrange persistence
// is pure UI state in Postgres; no LLM in the data path.
export const userDashboardKindEnum = ['PM_OVERVIEW', 'SERVICE_PM_OVERVIEW', 'GM_OVERVIEW'] as const;

export const user_dashboard_layouts = pgTable('user_dashboard_layouts', {
  layout_id: uuid('layout_id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  user_id: uuid('user_id').notNull().references(() => users.user_id),
  dashboard_kind: text('dashboard_kind').notNull(),
  layout_data: jsonb('layout_data').notNull().default(sql`'{}'::jsonb`),
  visible_widgets: text('visible_widgets').array().notNull().default(sql`ARRAY[]::text[]`),
  last_modified: timestamp('last_modified', { withTimezone: true }).notNull().defaultNow(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('user_dashboard_layouts_user_kind_uidx').on(table.user_id, table.dashboard_kind),
  index('user_dashboard_layouts_tenant_kind_idx').on(table.tenant_id, table.dashboard_kind),
  check(
    'user_dashboard_layouts_kind_check',
    sql`${table.dashboard_kind} IN ('PM_OVERVIEW','SERVICE_PM_OVERVIEW','GM_OVERVIEW')`,
  ),
  check(
    'user_dashboard_layouts_layout_is_object',
    sql`jsonb_typeof(${table.layout_data}) = 'object'`,
  ),
]);
