/**
 * BAN-347 PM-V1.0-H — tab-order guardrail.
 *
 * Locks the canonical 16-tab order published in the BAN-347 brief and the
 * Closeout D6 ratified note (BAN-344 + BAN-346 closeout).  Also asserts that
 * the new ProjectOverview component is wired in and that BAN-344/345/346
 * tabs are not removed.
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'components', 'ProjectsPanel.tsx'),
  'utf8',
);

const CANONICAL_16 = [
  'overview',
  'submittals',
  'rfis',
  'verbal-agreements',
  'meetings',
  'action-items',
  'documents',
  'handoff',
  'cos',
  'pay-apps',
  'tm-tickets',
  'budget',
  'work-breakdown',
  'matrix',
  'punch-list',
  'activity',
];

function extractTabKeys(source: string): string[] {
  const start = source.indexOf('const TABS = [');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('] as const;', start);
  expect(end).toBeGreaterThan(start);
  const block = source.slice(start, end);
  const keys: string[] = [];
  const re = /\{\s*key:\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) keys.push(m[1]);
  return keys;
}

describe('BAN-347 tab-order canon', () => {
  it('renders the 16-tab canonical order in TABS', () => {
    expect(extractTabKeys(SRC)).toEqual(CANONICAL_16);
  });

  it('does NOT remove BAN-344 action-items, BAN-345 documents, or BAN-346 handoff', () => {
    expect(SRC).toContain("import ActionItemsTab from '@/components/engagements/ActionItemsTab'");
    expect(SRC).toContain("import DocumentsTab from '@/components/engagements/DocumentsTab'");
    expect(SRC).toContain("import HandoffTab from '@/components/engagements/HandoffTab'");
    expect(SRC).toContain('<ActionItemsTab kID={project.kID} />');
    expect(SRC).toContain('<DocumentsTab kID={project.kID} />');
    expect(SRC).toContain('<HandoffTab kID={project.kID} />');
  });

  it('mounts the new ProjectOverview component on the overview tab', () => {
    expect(SRC).toContain("import ProjectOverview from '@/components/engagements/ProjectOverview'");
    expect(SRC).toContain('<ProjectOverview');
    expect(SRC).toContain('onNavigateTab={(tab) => setActiveTab(tab as typeof activeTab)}');
  });

  it('keeps overview as the default active tab', () => {
    expect(SRC).toContain(">('overview')");
  });

  it('exposes every canonical tab key in the activeTab type union', () => {
    for (const key of CANONICAL_16) {
      expect(SRC).toContain(`'${key}'`);
    }
  });
});
