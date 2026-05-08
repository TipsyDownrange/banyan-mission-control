import fs from 'fs';
import path from 'path';

describe('WO migration crosswalk readiness script', () => {
  it('is read-only and reports migration crosswalk surfaces', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/wo-migration-crosswalk-readiness.ts'), 'utf8');
    expect(script).toContain('spreadsheets.readonly');
    expect(script).toContain('Entity_Crosswalk!A2:E5000');
    expect(script).toContain('Users_Roles!A2:R500');
    expect(script).toContain('Sites!A2:M5000');
    expect(script).toContain('Organizations!A2:P5000');
    expect(script).not.toContain('values.update');
    expect(script).not.toContain('values.append');
    expect(script).not.toContain('batchUpdate');
  });
});
