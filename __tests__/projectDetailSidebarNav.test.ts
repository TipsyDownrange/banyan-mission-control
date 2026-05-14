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
});
