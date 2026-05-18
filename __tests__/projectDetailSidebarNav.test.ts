import fs from 'node:fs';
import path from 'node:path';

describe('project detail sidebar navigation regression', () => {
  it('does not render project detail as a fixed full-viewport overlay over the sidebar', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components', 'ProjectsPanel.tsx'),
      'utf8',
    );

    expect(source).toContain("position: 'absolute', inset: 0");
    expect(source).not.toContain("position: 'fixed', inset: 0, zIndex: 100");
  });

  it('opens project detail on Overview so the financial summary is visible by default', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components', 'ProjectsPanel.tsx'),
      'utf8',
    );

    expect(source).toContain("useState<'overview'|'submittals'|'rfis'|'verbal-agreements'|'meetings'|'cos'|'pay-apps'|'tm-tickets'|'punch-list'|'budget'|'work-breakdown'|'matrix'|'activity'>('overview')");
    expect(source).toContain("{ key: 'rfis', label: `RFIs (${rfis.length})` }");
    expect(source).toContain("{ key: 'verbal-agreements', label: `Verbal Agreements (${verbalAgreements.length})` }");
    expect(source).toContain("{ key: 'meetings', label: `Meetings (${meetings.length})` }");
    expect(source).toContain("{ key: 'cos', label: `Change Orders (${cos.length})` }");
  });

});
