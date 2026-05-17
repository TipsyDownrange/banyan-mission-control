import fs from 'fs';
import path from 'path';

const migrationPath = path.join(process.cwd(), 'db/migrations/0015_pass3b_closeout_v11_enums.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const ENUMS: Array<{ name: string; values: string[] }> = [
  {
    name: 'project_lifecycle_state',
    values: ['IN_CLOSEOUT', 'SUBSTANTIALLY_COMPLETE', 'FINAL_COMPLETE', 'ARCHIVED'],
  },
  {
    name: 'punch_list_item_source',
    values: [
      'FIELD_ISSUE',
      'SUBSTANTIAL_WALKTHROUGH',
      'GC_TRANSMITTAL',
      'OWNER_WALKTHROUGH',
      'ARCHITECT_WALKTHROUGH',
      'INTERNAL_QA',
    ],
  },
  {
    name: 'punch_list_item_category',
    values: ['GLASS', 'FRAMING', 'HARDWARE', 'SEALANT', 'FINISH', 'CLEANING', 'DOCUMENTATION', 'OTHER'],
  },
  {
    name: 'punch_list_responsible_party',
    values: ['KULA', 'OTHER_TRADE', 'GC', 'DISPUTED'],
  },
  {
    name: 'punch_list_item_status',
    values: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SIGNED_OFF', 'DISPUTED', 'DEFERRED_TO_WARRANTY'],
  },
  {
    name: 'warranty_status',
    values: ['ACTIVE', 'EXPIRED', 'PARTIALLY_EXPIRED'],
  },
  {
    name: 'warranty_claim_inbound_source',
    values: ['EMAIL', 'PHONE', 'PORTAL', 'FIELD_DISCOVERY'],
  },
  {
    name: 'warranty_claim_triage_result',
    values: ['KULA_RESPONSIBLE', 'MANUFACTURER_RESPONSIBLE', 'OTHER_TRADE_RESPONSIBLE', 'OUT_OF_WARRANTY', 'DISPUTED'],
  },
  {
    name: 'warranty_claim_resolution',
    values: ['COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED'],
  },
  {
    name: 'deliverable_type',
    values: ['AS_BUILT_DRAWING', 'OM_MANUAL_COMPONENT', 'OM_MANUAL_COMPLETE', 'UNIFIED_JOB_PACKET', 'OTHER'],
  },
];

describe('BAN-304 Pass 3b — migration 0015 enum types', () => {
  it('declares all 10 ratified enum types', () => {
    expect(ENUMS).toHaveLength(10);
    for (const { name } of ENUMS) {
      expect(sql).toContain(`CREATE TYPE public.${name} AS ENUM`);
    }
  });

  it.each(ENUMS)('enum $name carries the spec-locked value set', ({ name, values }) => {
    const block = sql.split(`CREATE TYPE public.${name} AS ENUM`)[1];
    expect(block).toBeDefined();
    const closingIdx = block.indexOf(');');
    expect(closingIdx).toBeGreaterThan(-1);
    const enumBody = block.slice(0, closingIdx);
    for (const value of values) {
      expect(enumBody).toContain(`'${value}'`);
    }
  });

  it('wraps every CREATE TYPE in an idempotent DO block with duplicate_object guard', () => {
    const doBlockMatches = sql.match(/DO \$\$ BEGIN[\s\S]*?EXCEPTION WHEN duplicate_object THEN NULL;\s*END \$\$;/g);
    expect(doBlockMatches).not.toBeNull();
    expect(doBlockMatches!.length).toBe(ENUMS.length);
  });

  it('orders DO blocks so PostgreSQL sees deterministic enum creation', () => {
    const order = ENUMS.map(({ name }) => sql.indexOf(`CREATE TYPE public.${name}`));
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it('does not contain destructive statements against protected schema', () => {
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
  });

  it('does not modify BAN-293 protected surfaces (DDL only — comments may reference them for context)', () => {
    const sqlNoComments = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
    expect(sqlNoComments).not.toMatch(/field_events/);
    expect(sqlNoComments).not.toMatch(/field_events_event_type_ban293_check/);
    expect(sqlNoComments).not.toMatch(/event_type/);
  });

  it('uses public schema namespace for every enum', () => {
    for (const { name } of ENUMS) {
      expect(sql).toContain(`public.${name}`);
    }
  });

  it('does not introduce any new event_type values (D6)', () => {
    const eventTypes = [
      'PROJECT_LIFECYCLE_STATE_CHANGED',
      'NEW_EVENT_TYPE',
      'CLOSEOUT_EVENT',
    ];
    for (const candidate of eventTypes) {
      expect(sql).not.toContain(candidate);
    }
  });
});
