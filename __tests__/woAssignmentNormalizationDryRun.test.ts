import fs from 'fs';
import path from 'path';

describe('WO assignment normalization dry-run script', () => {
  it('is read-only and reports assignment mapping payload', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/wo-assignment-normalization-dry-run.ts'), 'utf8');
    expect(script).toContain('spreadsheets.readonly');
    expect(script).toContain('Users_Roles!A2:R500');
    expect(script).toContain('assigned_user_ids');
    expect(script).toContain('assigned_unresolved_tokens');
    expect(script).not.toContain('values.update');
    expect(script).not.toContain('values.append');
    expect(script).not.toContain('batchUpdate');
  });
});
