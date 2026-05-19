/**
 * BAN-347 PM-V1.0-H — source-file regression for the 9 Overview panels.
 *
 * Asserts every §12.3 panel is present in the rendered component and that
 * the Overview data path is Kai-optional (deterministic count rollups, no
 * LLM imports).  Pairs with ban347ProjectsPanelTabOrder for the tab gate.
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'components', 'engagements', 'ProjectOverview.tsx'),
  'utf8',
);

describe('BAN-347 ProjectOverview component', () => {
  it('declares each of the 9 §12.3 panels via data-overview-panel attributes', () => {
    const expectedPanels = [
      'project-header',
      'status-summary',
      'open-actions',
      'submittals-kpi',
      'rfis-kpi',
      'documents',
      'financial-summary',
      'schedule-snapshot',
      'activity-ticker',
    ];
    for (const slug of expectedPanels) {
      expect(SRC).toContain(`data-overview-panel="${slug}"`);
    }
  });

  it('fetches the 7 canonical Overview data sources', () => {
    expect(SRC).toContain('/api/pm/submittals?kID=');
    expect(SRC).toContain('/api/pm/rfi?kID=');
    expect(SRC).toContain('/api/action-items/by-kid/${enc}?status=OPEN,IN_PROGRESS');
    expect(SRC).toContain('/api/documents/by-kid/');
    expect(SRC).toContain('/api/aia/billing/by-kid/');
    expect(SRC).toContain('/api/handoff-receipts/by-kid/');
    expect(SRC).toContain('/api/events?kID=${enc}&limit=10');
  });

  it('wires Open Actions and Documents rows to onNavigateTab for deep-linking', () => {
    expect(SRC).toContain("onClick={() => onNavigateTab?.('action-items')}");
    expect(SRC).toContain("onClick={() => onNavigateTab?.('documents')}");
    expect(SRC).toContain("onClick={() => onNavigateTab?.('activity')}");
    expect(SRC).toContain('data-action-row-id={it.action_item_id}');
    expect(SRC).toContain('data-document-row-id={d.document_id}');
  });

  it('renders the Schedule Snapshot as a stub with the pending message', () => {
    expect(SRC).toMatch(/Schedule Trunk pending/);
    expect(SRC).toContain('TODO(Schedule Trunk)');
  });

  it('annotates the change_orders TODO instead of escalating', () => {
    expect(SRC).toContain('TODO(BAN-348+)');
    expect(SRC).toContain('change_orders is not a Postgres table');
  });

  it('imports the §5.4/§6.5 pure-logic helpers from lib/pm/overview/panels', () => {
    expect(SRC).toContain("from '@/lib/pm/overview/panels'");
    expect(SRC).toContain('computeSubmittalKpi');
    expect(SRC).toContain('computeRfiKpi');
    expect(SRC).toContain('computeFinancialSummary');
    expect(SRC).toContain('buildActivityTicker');
    expect(SRC).toContain('topOpenActionItems');
    expect(SRC).toContain('topRecentDocuments');
    expect(SRC).toContain('daysSince');
    expect(SRC).toContain('pickHandoffReferenceTimestamp');
  });

  it('keeps the Overview data path Kai-optional (no LLM client imports)', () => {
    expect(SRC).not.toMatch(/from ['"]@\/lib\/(ai|llm|kai)\b/);
    expect(SRC).not.toMatch(/anthropic|openai/i);
  });
});

describe('BAN-347 lib/pm/overview/panels helper module', () => {
  const HELPERS = fs.readFileSync(
    path.join(process.cwd(), 'lib', 'pm', 'overview', 'panels.ts'),
    'utf8',
  );

  it('reuses BAN-340 isOutstandingSubmittal and BAN-341 isOverdueRfi canon', () => {
    expect(HELPERS).toContain("from '@/lib/pm/submittals/state-machine'");
    expect(HELPERS).toContain("from '@/lib/pm/rfis/state-machine'");
    expect(HELPERS).toContain('isOutstandingSubmittal');
    expect(HELPERS).toContain('isOverdueRfi');
  });

  it('reuses BAN-344 OPEN_ACTIONABLE_STATUSES and BAN-346 PM_HANDOFF_TERMINAL_STATES', () => {
    expect(HELPERS).toContain("from '@/lib/pm/action-items/types'");
    expect(HELPERS).toContain('OPEN_ACTIONABLE_STATUSES');
    expect(HELPERS).toContain("from '@/lib/pm/handoff-receipts/types'");
    expect(HELPERS).toContain('PM_HANDOFF_TERMINAL_STATES');
  });

  it('does not import LLM or schema-migration modules', () => {
    expect(HELPERS).not.toMatch(/anthropic|openai|drizzle-orm|@\/db\b/);
  });
});
