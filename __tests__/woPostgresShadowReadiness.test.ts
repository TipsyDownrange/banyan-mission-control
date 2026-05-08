import fs from 'fs';
import path from 'path';

describe('WO Postgres shadow readiness script', () => {
  it('documents no-write mode and cutover delta plan', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/wo-postgres-shadow-readiness.ts'), 'utf8');
    expect(script).toContain('spreadsheets.readonly');
    expect(script).toContain('no insert function supplied');
    expect(script).toContain('cutoverDeltaPlan');
    expect(script).toContain('Capture final pre-cutover Sheet snapshot');
    expect(script).not.toContain('spreadsheets.values.update');
    expect(script).not.toContain('spreadsheets.values.append');
  });
});
