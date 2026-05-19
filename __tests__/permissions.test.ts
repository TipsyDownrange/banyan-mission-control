/**
 * WARROOM-PERMISSIONS dispatch (2026-05-19) — permission helpers test.
 *
 * Covers the RolePermission infrastructure added to lib/permissions.ts:
 *   - ROLE_PERMISSIONS_DEFAULTS shape and War Room defaults (business_admin
 *     + super_admin) preserve PR #188 behavior when no env var is set.
 *   - parseRolePermissions handles missing / empty / malformed JSON safely
 *     and rejects unknown permission strings.
 *   - getRolePermissions memoizes and reflects ROLE_PERMISSIONS_JSON when
 *     set, otherwise falls back to defaults.
 *   - hasPermission and passPermissionGate return correct 401 / 403 / ok
 *     across the documented session shapes.
 *   - ALL_ROLE_PERMISSIONS covers every member of the union (drift guard).
 */

export {}; // module-scope guard

import {
  ALL_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS_DEFAULTS,
  parseRolePermissions,
  getRolePermissions,
  resetRolePermissionsCacheForTests,
  hasPermission,
  passPermissionGate,
  type RolePermission,
} from '@/lib/permissions';

function session(role: string, email = `${role}@kulaglass.com`) {
  return { user: { email, role } } as Parameters<typeof hasPermission>[0];
}

beforeEach(() => {
  delete process.env.ROLE_PERMISSIONS_JSON;
  resetRolePermissionsCacheForTests();
});

describe('ROLE_PERMISSIONS_DEFAULTS', () => {
  it('grants WARROOM_VIEW + WARROOM_TASK_WRITE to business_admin and super_admin', () => {
    expect(ROLE_PERMISSIONS_DEFAULTS.business_admin).toEqual(
      expect.arrayContaining(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']),
    );
    expect(ROLE_PERMISSIONS_DEFAULTS.super_admin).toEqual(
      expect.arrayContaining(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']),
    );
  });

  it('grants no War Room permissions to roles outside the leadership set', () => {
    const leadership = new Set(['business_admin', 'super_admin']);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS_DEFAULTS)) {
      if (leadership.has(role)) continue;
      expect(perms).not.toEqual(expect.arrayContaining(['WARROOM_VIEW']));
      expect(perms).not.toEqual(expect.arrayContaining(['WARROOM_TASK_WRITE']));
    }
  });

  // KB-PERMISSIONS dispatch (2026-05-19) — KB defaults reproduce BAN-355's
  // KNOWLEDGE_WRITE_ROLES / SETUP role gates exactly.
  it('grants KB_WRITE + KB_TRIAGE to pm, business_admin, super_admin, catalog_admin', () => {
    for (const role of ['pm', 'business_admin', 'super_admin', 'catalog_admin']) {
      expect(ROLE_PERMISSIONS_DEFAULTS[role]).toEqual(
        expect.arrayContaining(['KB_WRITE', 'KB_TRIAGE']),
      );
    }
  });

  it('grants KB_SETUP to super_admin only', () => {
    expect(ROLE_PERMISSIONS_DEFAULTS.super_admin).toEqual(
      expect.arrayContaining(['KB_SETUP']),
    );
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS_DEFAULTS)) {
      if (role === 'super_admin') continue;
      expect(perms).not.toEqual(expect.arrayContaining(['KB_SETUP']));
    }
  });

  it('grants KB_VIEW to every documented role except none', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS_DEFAULTS)) {
      if (role === 'none') {
        expect(perms).not.toEqual(expect.arrayContaining(['KB_VIEW']));
        continue;
      }
      expect(perms).toEqual(expect.arrayContaining(['KB_VIEW']));
    }
  });

  it('denies KB_WRITE / KB_TRIAGE / KB_SETUP for roles outside the KB management set', () => {
    const writeRoles = new Set(['pm', 'business_admin', 'super_admin', 'catalog_admin']);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS_DEFAULTS)) {
      if (writeRoles.has(role)) continue;
      expect(perms).not.toEqual(expect.arrayContaining(['KB_WRITE']));
      expect(perms).not.toEqual(expect.arrayContaining(['KB_TRIAGE']));
      expect(perms).not.toEqual(expect.arrayContaining(['KB_SETUP']));
    }
  });
});

describe('ALL_ROLE_PERMISSIONS', () => {
  it('lists every RolePermission union member exactly once', () => {
    // Drift guard: any new member added to the RolePermission union below
    // must also be appended to ALL_ROLE_PERMISSIONS so parseRolePermissions
    // and the test helpers can validate it.
    const expected: RolePermission[] = [
      'WARROOM_VIEW',
      'WARROOM_TASK_WRITE',
      'KB_VIEW',
      'KB_WRITE',
      'KB_TRIAGE',
      'KB_SETUP',
    ];
    expect([...ALL_ROLE_PERMISSIONS].sort()).toEqual(expected.sort());
  });
});

describe('parseRolePermissions', () => {
  it('returns null for undefined / empty / whitespace input', () => {
    expect(parseRolePermissions(undefined)).toBeNull();
    expect(parseRolePermissions(null)).toBeNull();
    expect(parseRolePermissions('')).toBeNull();
    expect(parseRolePermissions('   ')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseRolePermissions('"WARROOM_VIEW"')).toBeNull();
    expect(parseRolePermissions('[]')).toBeNull();
    expect(parseRolePermissions('null')).toBeNull();
    expect(parseRolePermissions('123')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseRolePermissions('{')).toBeNull();
    expect(parseRolePermissions('not-json')).toBeNull();
  });

  it('returns null when a role maps to a non-array', () => {
    expect(parseRolePermissions('{"super_admin": "WARROOM_VIEW"}')).toBeNull();
  });

  it('returns null when an unknown permission string is present', () => {
    expect(
      parseRolePermissions('{"super_admin": ["WARROOM_VIEW", "BOGUS_PERM"]}'),
    ).toBeNull();
  });

  it('returns null when array contains a non-string', () => {
    expect(parseRolePermissions('{"super_admin": [42]}')).toBeNull();
  });

  it('parses a well-formed map', () => {
    const raw = JSON.stringify({
      gm: ['WARROOM_VIEW'],
      owner: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
    });
    expect(parseRolePermissions(raw)).toEqual({
      gm: ['WARROOM_VIEW'],
      owner: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
    });
  });
});

describe('getRolePermissions', () => {
  it('returns defaults when ROLE_PERMISSIONS_JSON is unset', () => {
    expect(getRolePermissions()).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });

  it('returns defaults when ROLE_PERMISSIONS_JSON is malformed', () => {
    process.env.ROLE_PERMISSIONS_JSON = '{not valid';
    expect(getRolePermissions()).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });

  it('returns defaults when ROLE_PERMISSIONS_JSON contains an unknown permission', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      super_admin: ['BOGUS_PERM'],
    });
    expect(getRolePermissions()).toBe(ROLE_PERMISSIONS_DEFAULTS);
  });

  it('reflects a valid ROLE_PERMISSIONS_JSON override', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      gm: ['WARROOM_VIEW'],
      owner: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
      business_admin: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
      super_admin: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
    });
    const map = getRolePermissions();
    expect(map.gm).toEqual(['WARROOM_VIEW']);
    expect(map.owner).toEqual(['WARROOM_VIEW', 'WARROOM_TASK_WRITE']);
  });

  it('memoizes after first read — env changes after first call are ignored until reset', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({ gm: ['WARROOM_VIEW'] });
    const first = getRolePermissions();
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({ owner: ['WARROOM_VIEW'] });
    expect(getRolePermissions()).toBe(first);
    resetRolePermissionsCacheForTests();
    const second = getRolePermissions();
    expect(second.owner).toEqual(['WARROOM_VIEW']);
    expect(second.gm).toBeUndefined();
  });
});

describe('hasPermission', () => {
  it('returns false for null / undefined session', () => {
    expect(hasPermission(null, 'WARROOM_VIEW')).toBe(false);
    expect(hasPermission(undefined, 'WARROOM_VIEW')).toBe(false);
  });

  it('returns false when session has no email', () => {
    expect(
      hasPermission({ user: { email: null } } as unknown as Parameters<typeof hasPermission>[0], 'WARROOM_VIEW'),
    ).toBe(false);
  });

  it('returns true for super_admin and business_admin (defaults)', () => {
    expect(hasPermission(session('super_admin'), 'WARROOM_VIEW')).toBe(true);
    expect(hasPermission(session('super_admin'), 'WARROOM_TASK_WRITE')).toBe(true);
    expect(hasPermission(session('business_admin'), 'WARROOM_VIEW')).toBe(true);
    expect(hasPermission(session('business_admin'), 'WARROOM_TASK_WRITE')).toBe(true);
  });

  it('returns false for pm / field / estimator / sales / catalog_admin (War Room defaults)', () => {
    for (const role of ['pm', 'field', 'estimator', 'sales', 'catalog_admin']) {
      expect(hasPermission(session(role), 'WARROOM_VIEW')).toBe(false);
      expect(hasPermission(session(role), 'WARROOM_TASK_WRITE')).toBe(false);
    }
  });

  it('honors a ROLE_PERMISSIONS_JSON override', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      gm: ['WARROOM_VIEW'],
      business_admin: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
      super_admin: ['WARROOM_VIEW', 'WARROOM_TASK_WRITE'],
    });
    expect(hasPermission(session('gm'), 'WARROOM_VIEW')).toBe(true);
    expect(hasPermission(session('gm'), 'WARROOM_TASK_WRITE')).toBe(false);
  });

  // KB-PERMISSIONS dispatch (2026-05-19) — exercise the new KB_* permissions.
  it('returns true for KB_WRITE / KB_TRIAGE on pm, business_admin, super_admin, catalog_admin (defaults)', () => {
    for (const role of ['pm', 'business_admin', 'super_admin', 'catalog_admin']) {
      expect(hasPermission(session(role), 'KB_WRITE')).toBe(true);
      expect(hasPermission(session(role), 'KB_TRIAGE')).toBe(true);
    }
  });

  it('returns false for KB_WRITE / KB_TRIAGE on roles outside the KB management set', () => {
    for (const role of ['field', 'estimator', 'sales', 'admin', 'pm_track']) {
      expect(hasPermission(session(role), 'KB_WRITE')).toBe(false);
      expect(hasPermission(session(role), 'KB_TRIAGE')).toBe(false);
    }
  });

  it('returns true for KB_SETUP only on super_admin (defaults)', () => {
    expect(hasPermission(session('super_admin'), 'KB_SETUP')).toBe(true);
    for (const role of ['pm', 'business_admin', 'catalog_admin', 'field']) {
      expect(hasPermission(session(role), 'KB_SETUP')).toBe(false);
    }
  });

  it('returns true for KB_VIEW on every documented role except none (defaults)', () => {
    const documented = [
      'super_admin', 'business_admin', 'gm', 'owner', 'service_pm', 'super',
      'pm', 'estimator', 'admin_mgr', 'admin', 'field', 'pm_track', 'sales',
      'catalog_admin',
    ];
    for (const role of documented) {
      expect(hasPermission(session(role), 'KB_VIEW')).toBe(true);
    }
  });

  it('honors a ROLE_PERMISSIONS_JSON override widening KB_WRITE to field', () => {
    process.env.ROLE_PERMISSIONS_JSON = JSON.stringify({
      pm: ['KB_VIEW', 'KB_WRITE', 'KB_TRIAGE'],
      business_admin: ['KB_VIEW', 'KB_WRITE', 'KB_TRIAGE'],
      super_admin: ['KB_VIEW', 'KB_WRITE', 'KB_TRIAGE', 'KB_SETUP'],
      catalog_admin: ['KB_VIEW', 'KB_WRITE', 'KB_TRIAGE'],
      field: ['KB_VIEW', 'KB_WRITE'],
    });
    expect(hasPermission(session('field'), 'KB_WRITE')).toBe(true);
    // Override doesn't grant KB_TRIAGE, so the field role still cannot triage.
    expect(hasPermission(session('field'), 'KB_TRIAGE')).toBe(false);
    // Roles not present in the override map fall through to "no permissions"
    // (the override fully replaces defaults rather than merging).
    expect(hasPermission(session('admin'), 'KB_VIEW')).toBe(false);
  });
});

describe('passPermissionGate', () => {
  it('returns 401 response when no session', () => {
    const result = passPermissionGate(null, 'WARROOM_VIEW');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('returns 403 response when role lacks permission', () => {
    const result = passPermissionGate(session('pm'), 'WARROOM_VIEW');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('returns ok with actorEmail + role when permission is granted', () => {
    const result = passPermissionGate(session('business_admin'), 'WARROOM_VIEW');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actorEmail).toBe('business_admin@kulaglass.com');
      expect(result.role).toBe('business_admin');
    }
  });
});
