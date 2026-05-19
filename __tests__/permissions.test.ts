/**
 * WARROOM-PERMISSIONS — permission system v2 tests.
 *
 * Covers:
 *   - default ROLE_PERMISSIONS_DEFAULTS map (PR #188 parity)
 *   - ROLE_PERMISSIONS_JSON env override (merge semantics, valid + malformed)
 *   - malformed env → safe fallback (never throws)
 *   - the BanyanPermission constants are exhaustive (ALL_PERMISSIONS)
 *   - hasPermission(session, perm) behavior for legitimate / missing sessions
 */

import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS_DEFAULTS,
  __resetRolePermissionsForTest,
  getRolePermissions,
  parseRolePermissions,
  type BanyanPermission,
} from '@/lib/permissions-config';
import { hasPermission } from '@/lib/permissions-gate';

function sessionFor(role: string, email = `${role}@kulaglass.com`) {
  return {
    user: { email, role },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  delete process.env.ROLE_PERMISSIONS_JSON;
  __resetRolePermissionsForTest();
});

afterAll(() => {
  delete process.env.ROLE_PERMISSIONS_JSON;
  __resetRolePermissionsForTest();
});

describe('ROLE_PERMISSIONS_DEFAULTS — PR #188 parity', () => {
  it('grants WARROOM_VIEW + WARROOM_TASK_WRITE to business_admin and super_admin only', () => {
    expect(ROLE_PERMISSIONS_DEFAULTS.business_admin).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
    expect(ROLE_PERMISSIONS_DEFAULTS.super_admin).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
  });

  it('grants no permissions to every other known role', () => {
    const granted = ['business_admin', 'super_admin'];
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS_DEFAULTS)) {
      if (granted.includes(role)) continue;
      expect(perms).toEqual([]);
    }
  });

  it('lists every role known to lib/auth.ts (no silent admit via typo)', () => {
    const expected = [
      'business_admin', 'super_admin', 'owner', 'gm', 'pm', 'service_pm',
      'super', 'estimator', 'admin_mgr', 'admin', 'field', 'pm_track',
      'sales', 'catalog_admin', 'none',
    ].sort();
    expect(Object.keys(ROLE_PERMISSIONS_DEFAULTS).sort()).toEqual(expected);
  });
});

describe('ALL_PERMISSIONS — union coverage', () => {
  it('lists exactly WARROOM_VIEW and WARROOM_TASK_WRITE', () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual(['WARROOM_TASK_WRITE', 'WARROOM_VIEW']);
  });

  it('is type-compatible with BanyanPermission', () => {
    for (const p of ALL_PERMISSIONS) {
      const typed: BanyanPermission = p;
      expect(typeof typed).toBe('string');
    }
  });
});

describe('parseRolePermissions — env override parsing', () => {
  it('returns defaults when raw is undefined / null / empty / whitespace', () => {
    expect(parseRolePermissions(undefined)).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions(null)).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions('')).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions('   ')).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });

  it('returns defaults when JSON is malformed', () => {
    expect(parseRolePermissions('{not json')).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions('null')).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions('[]')).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions('"a string"')).toBe(ROLE_PERMISSIONS_DEFAULTS);
    expect(parseRolePermissions('42')).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });

  it('merges override on top of defaults (absent roles keep defaults)', () => {
    const result = parseRolePermissions(JSON.stringify({
      gm: ['WARROOM_VIEW'],
    }));
    expect(result.gm).toEqual(['WARROOM_VIEW']);
    // business_admin / super_admin defaults preserved
    expect(result.business_admin).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
    expect(result.super_admin).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
  });

  it('lets the env override remove access (empty array)', () => {
    const result = parseRolePermissions(JSON.stringify({
      business_admin: [],
    }));
    expect(result.business_admin).toEqual([]);
    // super_admin default preserved
    expect(result.super_admin).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
  });

  it('drops unknown permission strings silently and keeps valid ones', () => {
    const result = parseRolePermissions(JSON.stringify({
      gm: ['WARROOM_VIEW', 'NOT_A_REAL_PERMISSION', 'WARROOM_TASK_WRITE'],
    }));
    expect(result.gm).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
  });

  it('ignores entries whose value is not an array', () => {
    const result = parseRolePermissions(JSON.stringify({
      gm: 'WARROOM_VIEW', // not an array
      sales: ['WARROOM_VIEW'],
    }));
    // gm keeps default (entry skipped)
    expect(result.gm).toEqual([]);
    expect(result.sales).toEqual(['WARROOM_VIEW']);
  });
});

describe('getRolePermissions — env-driven memoized accessor', () => {
  it('returns defaults when ROLE_PERMISSIONS_JSON is unset', () => {
    delete process.env.ROLE_PERMISSIONS_JSON;
    __resetRolePermissionsForTest();
    expect(getRolePermissions()).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });

  it('returns parsed override when ROLE_PERMISSIONS_JSON is valid', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      gm: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
    });
    __resetRolePermissionsForTest();
    const map = getRolePermissions();
    expect(map.gm).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
    expect(map.business_admin).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
  });

  it('memoizes the parse — subsequent env mutation without reset is ignored', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({ gm: ['WARROOM_VIEW'] });
    __resetRolePermissionsForTest();
    const first = getRolePermissions();
    // mutate env, but don't reset cache
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({ gm: [] });
    const second = getRolePermissions();
    expect(second).toBe(first);
    expect(second.gm).toEqual(['WARROOM_VIEW']);
  });

  it('falls back to defaults on malformed env without throwing', () => {
    process.env.ROLE_PERMISSIONS_JSON = '{ malformed';
    __resetRolePermissionsForTest();
    expect(() => getRolePermissions()).not.toThrow();
    expect(getRolePermissions()).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });
});

describe('hasPermission — session integration', () => {
  it('returns false for null / undefined session', () => {
    expect(hasPermission(null, 'WARROOM_VIEW')).toBe(false);
    expect(hasPermission(undefined, 'WARROOM_VIEW')).toBe(false);
  });

  it('returns false for a session without an email', () => {
    expect(hasPermission({ user: {}, expires: '2099-01-01' } as never, 'WARROOM_VIEW')).toBe(false);
  });

  it('returns true for business_admin (default mapping)', () => {
    expect(hasPermission(sessionFor('business_admin'), 'WARROOM_VIEW')).toBe(true);
    expect(hasPermission(sessionFor('business_admin'), 'WARROOM_TASK_WRITE')).toBe(true);
  });

  it('returns true for super_admin (default mapping)', () => {
    expect(hasPermission(sessionFor('super_admin'), 'WARROOM_VIEW')).toBe(true);
    expect(hasPermission(sessionFor('super_admin'), 'WARROOM_TASK_WRITE')).toBe(true);
  });

  it('returns false for pm, field, estimator, sales, catalog_admin, owner, gm (default mapping)', () => {
    for (const role of ['pm', 'field', 'estimator', 'sales', 'catalog_admin', 'owner', 'gm']) {
      expect(hasPermission(sessionFor(role), 'WARROOM_VIEW')).toBe(false);
      expect(hasPermission(sessionFor(role), 'WARROOM_TASK_WRITE')).toBe(false);
    }
  });

  it('falls back to email-derived role when session.user.role is missing', () => {
    // sean@kulaglass.com → super_admin via ROLE_MAP in lib/auth.ts
    const session = { user: { email: 'sean@kulaglass.com' }, expires: '2099-01-01' };
    expect(hasPermission(session as never, 'WARROOM_VIEW')).toBe(true);
  });

  it('honors ROLE_PERMISSIONS_JSON override when set', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      gm: ['WARROOM_VIEW'],
    });
    __resetRolePermissionsForTest();
    expect(hasPermission(sessionFor('gm'), 'WARROOM_VIEW')).toBe(true);
    expect(hasPermission(sessionFor('gm'), 'WARROOM_TASK_WRITE')).toBe(false);
    // defaults still apply to roles not in override
    expect(hasPermission(sessionFor('business_admin'), 'WARROOM_VIEW')).toBe(true);
  });
});
