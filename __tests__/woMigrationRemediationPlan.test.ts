import fs from 'fs';
import path from 'path';

describe('WO migration remediation plan script', () => {
  it('is no-write and includes lights-on lanes', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/wo-migration-remediation-plan.ts'), 'utf8');
    expect(script).toContain('Assignment normalization');
    expect(script).toContain('Folder URL remediation');
    expect(script).toContain('Site/address resolution');
    expect(script).toContain('Cutover delta sync');
    expect(script).toContain('lightsOnChecklist');
    expect(script).not.toContain('google.sheets');
    expect(script).not.toContain('values.update');
    expect(script).not.toContain('values.append');
  });
});
