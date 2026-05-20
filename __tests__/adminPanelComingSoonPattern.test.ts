/**
 * BAN-280 — AdminPanel "Coming soon" canonical-pattern guardrail.
 *
 * The WIP Report surface previously rendered a divergent "WIP Engine — Next
 * Build" gradient card plus an Active Projects table. BAN-262 ratified the
 * `BuildQueuePlaceholder` component as the canonical "in build queue" surface
 * across AdminPanel. This test locks WIP Report (and its placeholder siblings
 * Vendors, HR, Safety, Fleet) onto the canonical `ComingSoonPanel` →
 * `BuildQueuePlaceholder` path so the divergence cannot regress.
 */

import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'components', 'AdminPanel.tsx'),
  'utf8',
);

const PLACEHOLDER_SURFACES = ['wip', 'vendors', 'hr', 'safety', 'fleet'] as const;

describe('BAN-280 AdminPanel canonical Coming-Soon pattern', () => {
  it('imports the canonical BuildQueuePlaceholder component', () => {
    expect(SRC).toMatch(/import\s+BuildQueuePlaceholder\s+from\s+['"]\.\/BuildQueuePlaceholder['"]/);
  });

  it('keeps WIP Report in the SECTION_META map with the canonical icon and subtitle', () => {
    expect(SRC).toContain("wip:");
    expect(SRC).toContain("title: 'WIP Report'");
    expect(SRC).toContain("icon: '📊'");
    expect(SRC).toMatch(/Work in Progress — live financial position across all active projects/);
  });

  it('routes every placeholder surface (incl. WIP Report) through ComingSoonPanel', () => {
    const dispatchMatch = SRC.match(
      /\(([^)]*?)\)\s*&&\s*\(\s*\n?\s*<ComingSoonPanel\s+section=\{section\}\s*\/>/,
    );
    expect(dispatchMatch).not.toBeNull();
    const condition = dispatchMatch![1];
    for (const surface of PLACEHOLDER_SURFACES) {
      expect(condition).toContain(`section === '${surface}'`);
    }
  });

  it('does NOT render a divergent WIPPanel surface', () => {
    expect(SRC).not.toMatch(/function\s+WIPPanel\s*\(/);
    expect(SRC).not.toContain('<WIPPanel');
    expect(SRC).not.toContain('WIP Engine — Next Build');
    expect(SRC).not.toContain('WIP calculation in queue');
  });

  it('passes the canonical BuildQueuePlaceholder prop set from ComingSoonPanel', () => {
    const block = SRC.match(/<BuildQueuePlaceholder[\s\S]*?\/>/);
    expect(block).not.toBeNull();
    const invocation = block![0];
    expect(invocation).toContain('surfaceName={meta.title}');
    expect(invocation).toContain('specDate=');
    expect(invocation).toContain('buildQueueStatus="Build scheduled"');
    expect(invocation).toContain('description={meta.subtitle}');
    expect(invocation).toContain('icon={meta.icon}');
  });

  it('only invokes BuildQueuePlaceholder once — via the shared ComingSoonPanel', () => {
    const occurrences = SRC.match(/<BuildQueuePlaceholder\b/g) || [];
    expect(occurrences.length).toBe(1);
  });
});
