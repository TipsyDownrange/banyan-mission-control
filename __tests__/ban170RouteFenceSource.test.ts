import fs from 'fs';
import path from 'path';

const repo = process.cwd();

function read(file: string): string {
  return fs.readFileSync(path.join(repo, file), 'utf8');
}

describe('BAN-170 route fence source contracts', () => {
  it('Drive/PDF routes use STAGING_DRIVE_FOLDER_ID resolver before Drive writes', () => {
    const files = [
      'app/api/projects/handoff/route.ts',
      'app/api/daily-report/pdf/route.ts',
      'app/api/field-issue/pdf/route.ts',
      'app/api/service/dispatch-pdf/route.ts',
      'app/api/tm-tickets/route.ts',
      'app/api/admin/backfill-wo-customer-fk/route.ts',
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain('resolveStagingDriveParentId');
      expect(source).toContain('isStaging()');
    }
  });

  it('Drive/PDF staging paths do not scope list queries to BANYAN_DRIVE_ID in staging', () => {
    expect(read('app/api/daily-report/pdf/route.ts')).toContain('if (!isStaging())');
    expect(read('app/api/field-issue/pdf/route.ts')).toContain('if (!isStaging())');
  });

  it('calendar writes are explicitly blocked in staging before google calendar mutation', () => {
    const source = read('app/api/calendar/route.ts');
    // Branch uses calendarWriteSkipReason() for POST/PATCH/DELETE (returns skip_reason: 'staging')
    expect(source.match(/calendarWriteSkipReason/g)).toHaveLength(4); // import + 3 usages
    expect(source).toContain('events.insert');
    expect(source).toContain('events.patch');
    expect(source).toContain('events.delete');
  });

  it('dispatch schedule uses central email skip logic and env-driven Field App URL', () => {
    const source = read('app/api/dispatch-schedule/route.ts');
    expect(source).toContain('emailSkipReason');
    expect(source).toContain('getFieldAppBaseUrl'); // main: uses central env helper for FA base URL
    expect(source).not.toContain('DISABLE_DISPATCH_EMAILS !==');
  });

  it('external ID routes use env helpers instead of hardcoded production IDs', () => {
    expect(read('app/api/bids/create/route.ts')).toContain('getBidLogSheetId');
    expect(read('app/api/cost/invoice/route.ts')).toContain('getCostInvoiceSheetId');
    expect(read('app/api/scheduling/route.ts')).toContain('getManpowerScheduleSheetId');
  });
});

