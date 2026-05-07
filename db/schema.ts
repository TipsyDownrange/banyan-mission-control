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
  name: text('name').notNull(),
  normalized_name: text('normalized_name').generatedAlwaysAs(
    sql`lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))`
  ),
  types: text('types').array(),
  entity_type: orgEntityTypeEnum('entity_type'),
  default_island: islandCodeEnum('default_island'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  postal_code: text('postal_code'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  source: text('source'),
  notes: text('notes'),
  legacy_customer_id: text('legacy_customer_id'),
  legacy_source: jsonb('legacy_source'),
  status: text('status'),
  merged_into_org_id: uuid('merged_into_org_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

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
  crosswalk_type: crosswalkTypeEnum('crosswalk_type').notNull(),
  source_system: text('source_system'),
  source_id: text('source_id'),
  target_table: text('target_table'),
  target_id: uuid('target_id'),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
  from_org_id: uuid('from_org_id').references(() => organizations.org_id),
  to_org_id: uuid('to_org_id').references(() => organizations.org_id),
  relationship_type: relationshipTypeEnum('relationship_type'),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const entity_migration_audit_log = pgTable('entity_migration_audit_log', {
  log_id: uuid('log_id').defaultRandom().primaryKey(),
  entity_table: text('entity_table'),
  entity_id: uuid('entity_id'),
  action: migrationActionEnum('action'),
  performed_by: text('performed_by'),
  notes: text('notes'),
  before_state: jsonb('before_state'),
  after_state: jsonb('after_state'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
