/**
 * Packet 001: Seed Master Library reference tables from Master Library v0.3 xlsx.
 *
 * Usage: npx ts-node --project tsconfig.json -e "require('./scripts/seed-master-library')"
 *   or:  npx tsx scripts/seed-master-library.ts
 *
 * Reads: db/seeds/master_library_v0_3.xlsx by default; override with MASTER_LIBRARY_XLSX_PATH.
 * Writes to: families, system_types, manufacturers, work_types, schema_metadata
 * Tenant: 00000000-0000-4000-8000-000000000001 (Kula Glass TEN-001)
 * Safe: uses ON CONFLICT DO NOTHING — idempotent.
 */

import * as path from 'path';
import * as XLSX from 'xlsx';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const KULA_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const XLSX_PATH = process.env.MASTER_LIBRARY_XLSX_PATH
  ? path.resolve(process.env.MASTER_LIBRARY_XLSX_PATH)
  : path.resolve(__dirname, '../db/seeds/master_library_v0_3.xlsx');

// ─── DB setup ────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool, { schema });

// ─── Schema metadata rows ─────────────────────────────────────────────────────

type MetaRow = typeof schema.schema_metadata.$inferInsert;

function metaRow(
  tableName: string,
  columnName: string,
  meaning: string,
  tenantScoped: boolean,
  extra?: Partial<MetaRow>,
): MetaRow {
  return {
    table_name: tableName,
    column_name: columnName,
    plain_english_meaning: meaning,
    domain_owner: 'Platform Governance',
    write_owner: 'catalog_admin',
    allowed_writers: ['catalog_admin', 'seed_script'],
    consumers: ['Master Library API', 'ServiceIntake', 'TakeoffTab', 'WorkBreakdown'],
    tenant_scoped: tenantScoped,
    source_system: 'internal',
    migration_status: 'current',
    audit_requirement: 'changes_only',
    pii: false,
    ...extra,
  };
}

const SCHEMA_META_ROWS: MetaRow[] = [
  // families
  metaRow('families', 'family_id', 'Entity-prefixed primary key for the family record', true),
  metaRow('families', 'kid', 'Human-readable family ID (e.g. FAM-01)', true),
  metaRow('families', 'name', 'Display name for the family', true),
  metaRow('families', 'description', 'Optional family description', true),
  metaRow('families', 'gold_data_rollup', 'Whether this family feeds the Gold Dataset pricing rollup (ADR-007)', true),
  metaRow('families', 'display_order', 'UI sort order; lower numbers render first', true),
  metaRow('families', 'status', 'Global lifecycle: canonical | active | retired | legacy', true),
  metaRow('families', 'is_active', 'Per-tenant toggle controlled by catalog_admin', true),
  metaRow('families', 'tenant_id', 'Tenant scope per ADR-003', true),
  metaRow('families', 'created_at', 'Row creation timestamp', true),
  metaRow('families', 'updated_at', 'Row last-update timestamp', true),
  metaRow('families', 'created_by', 'User who created this row', true),
  metaRow('families', 'updated_by', 'User who last updated this row', true),
  // system_types
  metaRow('system_types', 'system_type_id', 'Entity-prefixed primary key for the system type record', true),
  metaRow('system_types', 'kid', 'Human-readable system type ID (e.g. ST-001)', true),
  metaRow('system_types', 'family_id', 'Parent family reference', true),
  metaRow('system_types', 'name', 'Display name for the system type', true),
  metaRow('system_types', 'description', 'Optional description', true),
  metaRow('system_types', 'common_aliases', 'Alias array for fuzzy and AI search', true),
  metaRow('system_types', 'notes', 'Internal notes', true),
  metaRow('system_types', 'status', 'Global lifecycle: canonical | active | retired | legacy', true),
  metaRow('system_types', 'is_active', 'Per-tenant toggle controlled by catalog_admin', true),
  metaRow('system_types', 'tenant_id', 'Tenant scope per ADR-003', true),
  metaRow('system_types', 'created_at', 'Row creation timestamp', true),
  metaRow('system_types', 'updated_at', 'Row last-update timestamp', true),
  metaRow('system_types', 'created_by', 'User who created this row', true),
  metaRow('system_types', 'updated_by', 'User who last updated this row', true),
  // manufacturers
  metaRow('manufacturers', 'manufacturer_id', 'Entity-prefixed primary key for the manufacturer record', true),
  metaRow('manufacturers', 'kid', 'Human-readable manufacturer ID (e.g. MFG-001)', true),
  metaRow('manufacturers', 'name', 'Manufacturer display name', true),
  metaRow('manufacturers', 'primary_trade_role', 'Free-text trade role descriptor', true),
  metaRow('manufacturers', 'notes', 'Internal notes', true),
  metaRow('manufacturers', 'contact_info', 'JSONB contact metadata reserved for future expansion', true),
  metaRow('manufacturers', 'status', 'Global lifecycle: canonical | active | retired | legacy', true),
  metaRow('manufacturers', 'is_active', 'Per-tenant toggle controlled by catalog_admin', true),
  metaRow('manufacturers', 'tenant_id', 'Tenant scope per ADR-003', true),
  metaRow('manufacturers', 'created_at', 'Row creation timestamp', true),
  metaRow('manufacturers', 'updated_at', 'Row last-update timestamp', true),
  metaRow('manufacturers', 'created_by', 'User who created this row', true),
  metaRow('manufacturers', 'updated_by', 'User who last updated this row', true),
  // work_types
  metaRow('work_types', 'work_type_id', 'Entity-prefixed primary key for the work type record', true),
  metaRow('work_types', 'kid', 'Human-readable work type ID (e.g. WRK-01)', true),
  metaRow('work_types', 'name', 'Display name (e.g. Install)', true),
  metaRow('work_types', 'description', 'Optional description', true),
  metaRow('work_types', 'status', 'Lifecycle status; locked per Master Library v0.3', true),
  metaRow('work_types', 'is_active', 'Per-tenant toggle', true),
  metaRow('work_types', 'tenant_id', 'Tenant scope per ADR-003', true),
  metaRow('work_types', 'created_at', 'Row creation timestamp', true),
  metaRow('work_types', 'updated_at', 'Row last-update timestamp', true),
  metaRow('work_types', 'created_by', 'User who created this row', true),
  metaRow('work_types', 'updated_by', 'User who last updated this row', true),
  // schema_metadata (self-describing)
  metaRow('schema_metadata', 'meta_id', 'Entity-prefixed primary key for the schema metadata record', false),
  metaRow('schema_metadata', 'table_name', 'Target table name', false),
  metaRow('schema_metadata', 'column_name', 'Target column name within table_name', false),
  metaRow('schema_metadata', 'plain_english_meaning', 'Plain-English purpose of this column', false),
  metaRow('schema_metadata', 'domain_owner', 'Owning domain: Identity | Work | Documents | Finance | Platform Governance', false),
  metaRow('schema_metadata', 'write_owner', 'Role or service that owns writes to this column', false),
  metaRow('schema_metadata', 'allowed_writers', 'Role or service names permitted to write', false),
  metaRow('schema_metadata', 'consumers', 'Trunk or domain names that read this column', false),
  metaRow('schema_metadata', 'tenant_scoped', 'True if the referenced column is tenant-scoped', false),
  metaRow('schema_metadata', 'source_system', 'Origin system: internal | sheets | external', false),
  metaRow('schema_metadata', 'migration_status', 'Migration lifecycle: current | target | transitional', false),
  metaRow('schema_metadata', 'legacy_alias', 'Prior column name if this column was renamed', false),
  metaRow('schema_metadata', 'validation_rules', 'Human-readable validation contract', false),
  metaRow('schema_metadata', 'audit_requirement', 'Audit level: full | changes_only | none', false),
  metaRow('schema_metadata', 'pii', 'True if this column contains personally identifiable information', false),
  metaRow('schema_metadata', 'created_at', 'Row creation timestamp', false),
  metaRow('schema_metadata', 'updated_at', 'Row last-update timestamp', false),
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[seed] Reading xlsx:', XLSX_PATH);
  const wb = XLSX.readFile(XLSX_PATH);

  // ── 1. Families ───────────────────────────────────────────────────────────
  const famRows: (typeof schema.families.$inferInsert)[] = XLSX.utils
    .sheet_to_json<Record<string, string>>(wb.Sheets['Families'])
    .map((r, i) => ({
      kid: r['Family ID'],
      name: r['Family Name'],
      description: r['Description'] || null,
      gold_data_rollup: r['Gold Data Rollup']?.trim().toLowerCase() === 'yes',
      is_active: r['Kula Active']?.trim().toUpperCase() === 'ON',
      display_order: i,
      status: 'canonical' as const,
      tenant_id: KULA_TENANT_ID,
    }));

  console.log(`[seed] Upserting ${famRows.length} families…`);
  for (const row of famRows) {
    await db
      .insert(schema.families)
      .values(row)
      .onConflictDoNothing();
  }

  // Load family ID map (kid → family_id) for system_types FK resolution
  const allFamilies = await db
    .select({ family_id: schema.families.family_id, kid: schema.families.kid })
    .from(schema.families)
    .where(eq(schema.families.tenant_id, KULA_TENANT_ID));
  const familyByKid = new Map(allFamilies.map(f => [f.kid, f.family_id]));

  // ── 2. System Types ───────────────────────────────────────────────────────
  const stRows: (typeof schema.system_types.$inferInsert)[] = XLSX.utils
    .sheet_to_json<Record<string, string>>(wb.Sheets['System Types'])
    .map(r => {
      const famKid = r['Family'];
      const famId = familyByKid.get(famKid);
      if (!famId) throw new Error(`System type ${r['System ID']} references unknown family KID: ${famKid}`);
      const aliases = (r['Common Aliases'] || '')
        .split(',')
        .map((a: string) => a.trim())
        .filter(Boolean);
      return {
        kid: r['System ID'],
        family_id: famId,
        name: r['System Type Name'],
        description: null,
        common_aliases: aliases,
        notes: r['Notes'] || null,
        is_active: r['Kula Active']?.trim().toUpperCase() === 'ON',
        status: 'canonical' as const,
        tenant_id: KULA_TENANT_ID,
      };
    });

  console.log(`[seed] Upserting ${stRows.length} system_types…`);
  for (const row of stRows) {
    await db
      .insert(schema.system_types)
      .values(row)
      .onConflictDoNothing();
  }

  // ── 3. Manufacturers ──────────────────────────────────────────────────────
  const mfgRows: (typeof schema.manufacturers.$inferInsert)[] = XLSX.utils
    .sheet_to_json<Record<string, string>>(wb.Sheets['Manufacturers'])
    .map(r => ({
      kid: r['Mfg ID'],
      name: r['Manufacturer'],
      primary_trade_role: r['Primary Trade Role'] || null,
      notes: r['Notes'] || null,
      contact_info: {},
      is_active: r['Kula Active']?.trim().toUpperCase() === 'ON',
      status: 'canonical' as const,
      tenant_id: KULA_TENANT_ID,
    }));

  console.log(`[seed] Upserting ${mfgRows.length} manufacturers…`);
  for (const row of mfgRows) {
    await db
      .insert(schema.manufacturers)
      .values(row)
      .onConflictDoNothing();
  }

  // ── 4. Work Types ─────────────────────────────────────────────────────────
  const wtRows: (typeof schema.work_types.$inferInsert)[] = XLSX.utils
    .sheet_to_json<Record<string, string>>(wb.Sheets['Work Types'])
    .map(r => ({
      kid: r['Work Type ID'],
      name: r['Work Type'],
      description: r['Description'] || null,
      status: 'locked' as const,
      is_active: true,
      tenant_id: KULA_TENANT_ID,
    }));

  console.log(`[seed] Upserting ${wtRows.length} work_types…`);
  for (const row of wtRows) {
    await db
      .insert(schema.work_types)
      .values(row)
      .onConflictDoNothing();
  }

  // ── 5. Schema Metadata ────────────────────────────────────────────────────
  console.log(`[seed] Upserting ${SCHEMA_META_ROWS.length} schema_metadata rows…`);
  for (const row of SCHEMA_META_ROWS) {
    await db
      .insert(schema.schema_metadata)
      .values(row)
      .onConflictDoNothing();
  }

  // ── Verification counts ───────────────────────────────────────────────────
  const [fCount, stCount, mCount, wtCount, smCount] = await Promise.all([
    db.$count(schema.families, eq(schema.families.tenant_id, KULA_TENANT_ID)),
    db.$count(schema.system_types, eq(schema.system_types.tenant_id, KULA_TENANT_ID)),
    db.$count(schema.manufacturers, eq(schema.manufacturers.tenant_id, KULA_TENANT_ID)),
    db.$count(schema.work_types, eq(schema.work_types.tenant_id, KULA_TENANT_ID)),
    db.$count(schema.schema_metadata),
  ]);

  console.log('\n[seed] ✓ Counts:');
  console.log(`  families:        ${fCount}  (expected 11)`);
  console.log(`  system_types:    ${stCount}  (expected 79)`);
  console.log(`  manufacturers:   ${mCount}  (expected 65)`);
  console.log(`  work_types:      ${wtCount}  (expected 10)`);
  console.log(`  schema_metadata: ${smCount}  (expected ${SCHEMA_META_ROWS.length})`);

  const ok =
    Number(fCount) === 11 &&
    Number(stCount) === 79 &&
    Number(mCount) === 65 &&
    Number(wtCount) === 10;

  if (!ok) {
    console.error('[seed] ✗ Count mismatch — check xlsx source and conflict handling');
    process.exit(1);
  }

  console.log('\n[seed] ✓ All counts match. Seed complete.');
  await pool.end();
}

main().catch(err => {
  console.error('[seed] Fatal:', err);
  pool.end().finally(() => process.exit(1));
});
