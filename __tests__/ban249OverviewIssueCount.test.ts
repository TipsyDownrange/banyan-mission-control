import { countOpenFieldIssues, isOpenFieldIssue } from '@/lib/field-issues';

describe('BAN-249 Operations Overview issue count semantics', () => {
  it('counts FIELD_ISSUE events whose effective status is not RESOLVED', () => {
    const fieldIssues = Array.from({ length: 20 }, (_, index) => ({
      id: `FI-${String(index + 1).padStart(2, '0')}`,
      status: index === 19 ? 'RESOLVED' : index === 0 ? '' : 'OPEN',
    }));
    const staleProjectAggregate = 3;

    expect(countOpenFieldIssues(fieldIssues)).toBe(19);
    expect(countOpenFieldIssues(fieldIssues)).not.toBe(staleProjectAggregate);
  });

  it('uses the same case-insensitive RESOLVED exclusion as the Issues open tab', () => {
    expect(isOpenFieldIssue({ status: 'resolved' })).toBe(false);
    expect(isOpenFieldIssue({ status: ' RESOLVED ' })).toBe(false);
    expect(isOpenFieldIssue({ status: undefined })).toBe(true);
    expect(isOpenFieldIssue({ status: 'OPEN' })).toBe(true);
  });
});
