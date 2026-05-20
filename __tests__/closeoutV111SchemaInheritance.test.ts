/**
 * BAN-375 Closeout v1.1.1 Phase 1 — Drizzle schema extension test.
 *
 * Reads db/schema.ts as text (mirroring closeout-pass3b-tpa-inheritance.test.ts)
 * and asserts the v1.1.1 additions are wired:
 *   - punchTradeEnum declared with 10 values
 *   - punchListItemStatusEnum extended with WAIVED
 *   - subcontractors / punch_walks / punch_list_item_history pgTables exported
 *   - punch_list_items gains trade / assigned_to_sub_id / walk_id / waived_reason
 *
 * Reading as text avoids requiring a live db connection at test time and
 * matches the prior BAN-304 schema-introspection test style.
 */

import fs from 'fs';
import path from 'path';

const schemaTs = fs.readFileSync(path.join(process.cwd(), 'db/schema.ts'), 'utf8');

describe('BAN-375 Closeout v1.1.1 — schema.ts extensions', () => {
  it('declares punchTradeEnum pgEnum', () => {
    expect(schemaTs).toContain("punchTradeEnum = pgEnum('punch_trade'");
  });

  it('punchTradeEnum carries all 10 ratified trade values', () => {
    const block = schemaTs.split("punchTradeEnum = pgEnum('punch_trade'")[1];
    expect(block).toBeDefined();
    const closingIdx = block.indexOf(']);');
    expect(closingIdx).toBeGreaterThan(-1);
    const body = block.slice(0, closingIdx);
    for (const v of ['glazier', 'framer', 'waterproofer', 'electrician', 'plumber',
                     'hvac', 'drywall', 'paint', 'cleaning', 'other']) {
      expect(body).toContain(`'${v}'`);
    }
  });

  it('punchListItemStatusEnum now includes WAIVED', () => {
    const block = schemaTs.split("punchListItemStatusEnum = pgEnum('punch_list_item_status'")[1];
    expect(block).toBeDefined();
    const closingIdx = block.indexOf(']);');
    const body = block.slice(0, closingIdx);
    expect(body).toContain("'WAIVED'");
  });

  it('exports subcontractors pgTable with trade + island + active columns', () => {
    expect(schemaTs).toContain("subcontractors = pgTable('subcontractors'");
    const block = schemaTs.split("subcontractors = pgTable('subcontractors'")[1];
    expect(block).toMatch(/trade: text\('trade'\)\.notNull\(\)/);
    expect(block).toMatch(/island: text\('island'\)/);
    expect(block).toMatch(/active: boolean\('active'\)\.notNull\(\)\.default\(true\)/);
  });

  it('exports punch_walks pgTable referencing engagements', () => {
    expect(schemaTs).toContain("punch_walks = pgTable('punch_walks'");
    const block = schemaTs.split("punch_walks = pgTable('punch_walks'")[1];
    expect(block).toMatch(/engagement_id: uuid\('engagement_id'\)\.notNull\(\)\.references\(\(\) => engagements\.engagement_id\)/);
    expect(block).toMatch(/type: text\('type'\)\.notNull\(\)/);
    expect(block).toMatch(/walk_date: date\('walk_date'\)\.notNull\(\)/);
  });

  it('exports punch_list_item_history pgTable with SET NULL on punch_item_id (audit survives hard delete)', () => {
    expect(schemaTs).toContain("punch_list_item_history = pgTable('punch_list_item_history'");
    const block = schemaTs.split("punch_list_item_history = pgTable('punch_list_item_history'")[1];
    expect(block).toMatch(/onDelete: 'set null'/);
    expect(block).toMatch(/previous_status: punchListItemStatusEnum\('previous_status'\)/);
    expect(block).toMatch(/new_status: punchListItemStatusEnum\('new_status'\)/);
  });

  it('punch_list_items gains trade / assigned_to_sub_id / walk_id / waived_reason', () => {
    const block = schemaTs.split("punch_list_items = pgTable('punch_list_items'")[1]
      .split('export const ')[0];
    expect(block).toMatch(/trade: punchTradeEnum\('trade'\)\.notNull\(\)\.default\('other'\)/);
    expect(block).toMatch(/assigned_to_sub_id: uuid\('assigned_to_sub_id'\)\.references/);
    expect(block).toMatch(/walk_id: uuid\('walk_id'\)\.references/);
    expect(block).toMatch(/waived_reason: text\('waived_reason'\)/);
  });

  it('state-transitions.ts teaches the validator about WAIVED', () => {
    const transitionsTs = fs.readFileSync(
      path.join(process.cwd(), 'lib/closeout/state-transitions.ts'),
      'utf8',
    );
    expect(transitionsTs).toContain("'WAIVED',");
    const statesBlock = transitionsTs.split('PUNCH_LIST_ITEM_STATES = [')[1]
      .split('] as const')[0];
    expect(statesBlock).toContain("'WAIVED'");
    // WAIVED must be a terminal state (empty outbound list).
    expect(transitionsTs).toMatch(/WAIVED: \[\]/);
    // Non-terminal predecessors must allow WAIVED as a target.
    expect(transitionsTs).toMatch(/NEW: \[[^\]]*'WAIVED'/);
    expect(transitionsTs).toMatch(/IN_PROGRESS: \[[^\]]*'WAIVED'/);
  });
});
