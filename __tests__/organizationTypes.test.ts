import { ORGANIZATION_TYPE_LABELS, ORGANIZATION_TYPES } from '@/lib/organization-types';

describe('organization type compatibility', () => {
  it('keeps CUSTOMER as a governed editable type for WO repair-created organizations', () => {
    expect(ORGANIZATION_TYPES).toContain('CUSTOMER');
    expect(ORGANIZATION_TYPE_LABELS.CUSTOMER).toBe('Customer');
  });
});
