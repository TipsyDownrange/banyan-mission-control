import fs from 'fs';
import path from 'path';

describe('WO folder classification readiness script', () => {
  it('is read-oriented and reports all folder buckets', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'scripts/wo-folder-classification-readiness.ts'), 'utf8');
    expect(script).toContain('spreadsheets.readonly');
    expect(script).toContain('classifyWOFolder');
    expect(script).toContain('shared_drive_canonical');
    expect(script).toContain('shared_drive_missing_subfolders');
    expect(script).toContain('my_drive');
    expect(script).not.toContain('files.create');
    expect(script).not.toContain('files.update');
    expect(script).not.toContain('files.delete');
    expect(script).not.toContain('permissions.create');
    expect(script).not.toContain('values.update');
    expect(script).not.toContain('values.append');
  });
});
