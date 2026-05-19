/**
 * BAN-348 PM-V1.0-I — Role → default route + nav surface tests.
 *
 * Confirms that the BAN-348 default-route change is scoped to the `pm`
 * role only and does not touch any other role's existing landing view.
 */

import { defaultViewForRole, navSectionsForRole } from '@/lib/roles';

describe('BAN-348 defaultViewForRole', () => {
  it('pm role now lands on PM Dashboard', () => {
    expect(defaultViewForRole('pm')).toBe('PM Dashboard');
  });

  it('does not change the default for non-PM roles (scope guarantee)', () => {
    expect(defaultViewForRole('glazier')).toBe('Today');
    expect(defaultViewForRole('estimator')).toBe('Bid Queue');
    expect(defaultViewForRole('service_pm')).toBe('Work Orders');
    expect(defaultViewForRole('super')).toBe('Today');
    expect(defaultViewForRole('sales')).toBe('Bid Queue');
    expect(defaultViewForRole('admin')).toBe('Today');
    expect(defaultViewForRole('pm_track')).toBe('Today');
    expect(defaultViewForRole('owner')).toBe('Today');
  });
});

describe('BAN-348 PM nav surface', () => {
  it('pm sees the Projects section (which hosts PM Dashboard)', () => {
    expect(navSectionsForRole('pm')).toContain('Projects');
  });

  it('service_pm + super_admin still see the surfaces they expect', () => {
    expect(navSectionsForRole('super_admin')).toContain('Projects');
    expect(navSectionsForRole('service_pm')).toContain('Service');
  });

  it('glaziers are NOT given the Projects section by this change', () => {
    expect(navSectionsForRole('glazier')).not.toContain('Projects');
  });
});
