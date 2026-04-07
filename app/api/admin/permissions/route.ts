/**
 * Permissions Control API
 *
 * GET  /api/admin/permissions  — returns matrix + user list
 * POST /api/admin/permissions  — toggle a permission (role, permission, enabled)
 * PUT  /api/admin/permissions  — update a user's role
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { checkPermissionServer } from '@/lib/permissions';
import type { Permission } from '@/lib/permissions';
import {
  ROLE_PERMISSIONS_DEFAULT,
  refreshPermissionsCache,
  setPermissionsCache,
  getPermissionsCache,
} from '@/lib/permissions';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const MATRIX_TAB = 'Permissions_Matrix';
const USERS_TAB = 'Users_Roles';

// All known permission keys (ordered for display)
export const ALL_PERMISSIONS: Permission[] = [
  'wo:create',
  'wo:edit',
  'wo:dispatch',
  'wo:view',
  'finance:view',
  'dispatch:assign',
  'dispatch:create',
  'admin:all',
  'project:view',
  'project:edit',
  'project:create',
  'estimating:view',
  'estimating:edit',
  'field:log',
  'field:photo',
  'crew:view',
  'crew:edit',
  'reports:view',
];

// All managed roles (ordered for display)
export const ALL_ROLES = [
  'gm',
  'owner',
  'service_pm',
  'super',
  'pm',
  'estimator',
  'admin_mgr',
  'admin',
  'field',
  'pm_track',
  'sales',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWriteAuth() {
  return getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
}

function getReadAuth() {
  return getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
}

/**
 * Try to load permissions from Permissions_Matrix sheet tab.
 * Returns null if the tab doesn't exist or is empty.
 */
async function loadMatrixFromSheet(): Promise<Record<string, Permission[]> | null> {
  try {
    const auth = getReadAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${MATRIX_TAB}!A2:C5000`,
    });
    const rows = res.data.values || [];
    if (rows.length === 0) return null;

    const map: Record<string, Permission[]> = {};
    for (const row of rows) {
      const role = (row[0] || '').trim();
      const perm = (row[1] || '').trim() as Permission;
      const enabled = (row[2] || '').trim().toUpperCase() === 'TRUE';
      if (!role || !perm) continue;
      if (!map[role]) map[role] = [];
      if (enabled) map[role].push(perm);
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * Seed the Permissions_Matrix tab from the hardcoded defaults.
 * Creates a header row, then one row per (role, permission) combo.
 */
async function seedMatrixToSheet(auth: ReturnType<typeof getWriteAuth>): Promise<void> {
  const sheets = google.sheets({ version: 'v4', auth });

  // Build header + rows
  const values: string[][] = [['role', 'permission', 'enabled']];
  for (const role of ALL_ROLES) {
    const rolePerm = ROLE_PERMISSIONS_DEFAULT[role] || [];
    for (const perm of ALL_PERMISSIONS) {
      const enabled = rolePerm.includes('admin:all') || rolePerm.includes(perm);
      values.push([role, perm, enabled ? 'TRUE' : 'FALSE']);
    }
  }

  // Try to get existing sheets to see if tab already exists
  let tabExists = false;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    tabExists = (meta.data.sheets || []).some(
      s => s.properties?.title === MATRIX_TAB
    );
  } catch {
    // ignore
  }

  if (!tabExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: MATRIX_TAB } } }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${MATRIX_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

/**
 * Get permissions matrix — from cache, then sheet, then hardcoded defaults.
 * Returns the map AND (if it wasn't cached) caches it.
 */
async function getMatrix(): Promise<Record<string, Permission[]>> {
  const cached = getPermissionsCache();
  if (cached) return cached;

  const fromSheet = await loadMatrixFromSheet();
  if (fromSheet) {
    setPermissionsCache(fromSheet);
    return fromSheet;
  }

  // Seed sheet from defaults
  try {
    const auth = getWriteAuth();
    await seedMatrixToSheet(auth);
  } catch {
    // If seeding fails, just return defaults
  }

  setPermissionsCache(ROLE_PERMISSIONS_DEFAULT);
  return ROLE_PERMISSIONS_DEFAULT;
}

/**
 * Build a flat matrix representation: { role → { permission → boolean } }
 */
function buildFlatMatrix(roleMap: Record<string, Permission[]>): Record<string, Record<Permission, boolean>> {
  const result: Record<string, Record<Permission, boolean>> = {};
  for (const role of ALL_ROLES) {
    result[role] = {} as Record<Permission, boolean>;
    const perms = roleMap[role] || [];
    const isAdmin = perms.includes('admin:all');
    for (const perm of ALL_PERMISSIONS) {
      result[role][perm] = isAdmin || perms.includes(perm);
    }
  }
  return result;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { allowed } = await checkPermissionServer('admin:all');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // Load matrix
    const roleMap = await getMatrix();
    const matrix = buildFlatMatrix(roleMap);

    // Load users from Users_Roles
    const auth = getReadAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const usersRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${USERS_TAB}!A2:R200`,
    });
    const userRows = usersRes.data.values || [];
    const users = userRows
      .filter(r => r[0] && r[1])
      .map(r => ({
        user_id: (r[0] || '').trim(),
        name:    (r[1] || '').trim(),
        role:    (r[2] || '').trim(),
        email:   (r[3] || '').trim(),
        island:  (r[5] || '').trim(),
      }));

    return NextResponse.json({
      matrix,
      roleMap,
      allPermissions: ALL_PERMISSIONS,
      allRoles: ALL_ROLES,
      users,
    });
  } catch (err: unknown) {
    console.error('GET /api/admin/permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST — toggle a permission ────────────────────────────────────────────────

export async function POST(req: Request) {
  const { allowed } = await checkPermissionServer('admin:all');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { role, permission, enabled } = body as {
      role: string;
      permission: Permission;
      enabled: boolean;
    };

    if (!role || !permission) {
      return NextResponse.json({ error: 'role and permission required' }, { status: 400 });
    }

    // Lock: GM and Owner admin:all can never be disabled
    if ((role === 'gm' || role === 'owner') && permission === 'admin:all' && !enabled) {
      return NextResponse.json({ error: 'Cannot remove admin:all from GM or Owner' }, { status: 400 });
    }

    // Load current matrix
    const roleMap = await getMatrix();
    const current = roleMap[role] ? [...roleMap[role]] : [];

    let updated: Permission[];
    if (enabled) {
      updated = current.includes(permission) ? current : [...current, permission];
    } else {
      updated = current.filter(p => p !== permission);
    }

    const newRoleMap = { ...roleMap, [role]: updated };

    // Write updated matrix to sheet
    const auth = getWriteAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Find or create the row for this role+permission
    const allValues: string[][] = [];
    for (const r of ALL_ROLES) {
      const rPerms = newRoleMap[r] || [];
      const isAdmin = rPerms.includes('admin:all');
      for (const p of ALL_PERMISSIONS) {
        const isEnabled = isAdmin || rPerms.includes(p);
        allValues.push([r, p, isEnabled ? 'TRUE' : 'FALSE']);
      }
    }

    // Rewrite the full matrix (simpler than patching individual cells)
    const values = [['role', 'permission', 'enabled'], ...allValues];

    // Ensure tab exists
    let tabExists = false;
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
      tabExists = (meta.data.sheets || []).some(s => s.properties?.title === MATRIX_TAB);
    } catch { /* ignore */ }

    if (!tabExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ addSheet: { properties: { title: MATRIX_TAB } } }] },
      });
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${MATRIX_TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    // Update cache
    refreshPermissionsCache();
    setPermissionsCache(newRoleMap);

    return NextResponse.json({ ok: true, role, permission, enabled });
  } catch (err: unknown) {
    console.error('POST /api/admin/permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PUT — update a user's role ────────────────────────────────────────────────

export async function PUT(req: Request) {
  const { allowed } = await checkPermissionServer('admin:all');
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { user_id, role } = body as { user_id: string; role: string };

    if (!user_id || !role) {
      return NextResponse.json({ error: 'user_id and role required' }, { status: 400 });
    }

    const auth = getWriteAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row with this user_id
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${USERS_TAB}!A2:R200`,
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => (r[0] || '').trim() === user_id);

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const sheetRow = rowIndex + 2; // 1-indexed + header
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${USERS_TAB}!C${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[role]] },
    });

    return NextResponse.json({ ok: true, user_id, role });
  } catch (err: unknown) {
    console.error('PUT /api/admin/permissions error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
