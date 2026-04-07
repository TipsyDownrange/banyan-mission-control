'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────────────

type Permission = string;

interface UserRow {
  user_id: string;
  name: string;
  role: string;
  displayRole?: string;
  email: string;
  island: string;
}

interface PermissionsData {
  matrix: Record<string, Record<Permission, boolean>>;
  allPermissions: Permission[];
  allRoles: string[];
  users: UserRow[];
}

// ── Label Maps ────────────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  'wo:create':        'Create WOs',
  'wo:edit':          'Edit WOs',
  'wo:dispatch':      'Dispatch WOs',
  'wo:view':          'View WOs',
  'finance:view':     'View Finance',
  'dispatch:assign':  'Assign Crew',
  'dispatch:create':  'Create Schedule',
  'admin:all':        'Full Admin',
  'project:view':     'View Projects',
  'project:edit':     'Edit Projects',
  'project:create':   'Create Projects',
  'estimating:view':  'View Estimates',
  'estimating:edit':  'Edit Estimates',
  'field:log':        'Field Logs',
  'field:photo':      'Upload Photos',
  'crew:view':        'View Crew',
  'crew:edit':        'Edit Crew',
  'reports:view':     'View Reports',
};

const ROLE_LABELS: Record<string, string> = {
  gm:         'GM',
  owner:      'Owner',
  service_pm: 'Service PM',
  super:      'Superintendent',
  pm:         'PM',
  estimator:  'Estimator',
  admin_mgr:  'Admin Manager',
  admin:      'Admin',
  field:      'Field',
  pm_track:   'PM Track',
  sales:      'Sales',
};

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
      color: '#fff',
      padding: '10px 18px',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      boxShadow: '0 8px 24px rgba(20,184,166,0.35)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(8px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      pointerEvents: 'none',
      zIndex: 9999,
    }}>
      ✓ {message}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [data, setData] = useState<PermissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [highlightRole, setHighlightRole] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});

  // ── Auth check ──
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) { router.push('/login'); return; }
    const role = (session.user as { role?: string })?.role || '';
    if (role !== 'gm' && role !== 'owner') {
      router.push('/');
    }
  }, [session, status, router]);

  // ── Fetch permissions data ──
  useEffect(() => {
    fetch('/api/admin/permissions')
      .then(r => r.json())
      .then((d: PermissionsData) => {
        setData(d);
        // Init user roles
        const roles: Record<string, string> = {};
        for (const u of d.users) roles[u.user_id] = u.role;
        setUserRoles(roles);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  }, []);

  // ── Toggle a permission ──
  async function handleToggle(role: string, permission: string, currentValue: boolean) {
    if (!data) return;

    // Locked: GM/Owner admin:all
    if ((role === 'gm' || role === 'owner') && permission === 'admin:all') return;

    const key = `${role}:${permission}`;
    setSaving(key);

    const newEnabled = !currentValue;

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        matrix: {
          ...prev.matrix,
          [role]: {
            ...prev.matrix[role],
            [permission]: newEnabled,
          },
        },
      };
    });

    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, permission, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Changes saved');
    } catch {
      // Revert on error
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          matrix: {
            ...prev.matrix,
            [role]: {
              ...prev.matrix[role],
              [permission]: currentValue,
            },
          },
        };
      });
      showToast('Save failed — check connection');
    } finally {
      setSaving(null);
    }
  }

  // ── Update a user's role ──
  async function handleRoleChange(userId: string, newRole: string) {
    setUserRoles(prev => ({ ...prev, [userId]: newRole }));
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Role updated');
    } catch {
      showToast('Role update failed');
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#071722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 14 }}>Loading permissions…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#071722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#f87171', fontSize: 14 }}>Failed to load permissions data.</div>
      </div>
    );
  }

  const { matrix, allPermissions, allRoles, users } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#071722', color: '#f8fafc', fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif' }}>
      <Toast message={toast} visible={toastVisible} />

      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg, #071722 0%, #0c2330 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <a href="/" style={{ color: 'rgba(148,163,184,0.4)', fontSize: 12, textDecoration: 'none', letterSpacing: '0.02em' }}>
              ← Mission Control
            </a>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Permissions<span style={{ color: '#14b8a6' }}> Control</span>
          </h1>
          <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)', marginTop: 3 }}>
            Configure role-based access — changes sync to Google Sheets
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(20,184,166,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          GM / Owner only
        </div>
      </div>

      <div style={{ padding: '28px 28px 60px' }}>

        {/* ── Permissions Matrix ── */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#14b8a6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, marginTop: 0 }}>
            Role Permissions Matrix
          </h2>

          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{
              borderCollapse: 'separate',
              borderSpacing: 0,
              minWidth: 'max-content',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.07)',
              overflow: 'hidden',
            }}>
              <thead>
                <tr>
                  {/* Sticky role column header */}
                  <th style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: '#0c2330',
                    padding: '14px 20px 14px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'rgba(148,163,184,0.5)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                    whiteSpace: 'nowrap',
                    minWidth: 140,
                  }}>
                    Role
                  </th>
                  {/* Permission column headers — rotated */}
                  {allPermissions.map(perm => (
                    <th key={perm} style={{
                      background: '#0c2330',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      padding: '0 2px',
                      verticalAlign: 'bottom',
                      width: 56,
                      minWidth: 56,
                      height: 120,
                      textAlign: 'center',
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute',
                        bottom: 8,
                        left: '50%',
                        transformOrigin: 'bottom left',
                        transform: 'rotate(-45deg) translateX(-50%)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'rgba(203,213,225,0.85)',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.2,
                        letterSpacing: '0.01em',
                      }}>
                        {PERMISSION_LABELS[perm] || perm}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRoles.map((role, rIdx) => {
                  const rowPerms = matrix[role] || {};
                  const isHighlighted = highlightRole === role;
                  const isLocked = role === 'gm' || role === 'owner';

                  return (
                    <tr
                      key={role}
                      style={{
                        background: isHighlighted
                          ? 'rgba(20,184,166,0.07)'
                          : rIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Role label — sticky left */}
                      <td style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background: isHighlighted
                          ? '#0d2a1f'
                          : rIdx % 2 === 0 ? '#0c2330' : '#0b2030',
                        padding: '10px 20px 10px 16px',
                        borderRight: '1px solid rgba(255,255,255,0.08)',
                        borderBottom: rIdx < allRoles.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: isLocked ? 700 : 500,
                          color: isLocked ? '#14b8a6' : 'rgba(226,232,240,0.85)',
                        }}>
                          {ROLE_LABELS[role] || role}
                        </span>
                        {isLocked && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(20,184,166,0.5)', fontWeight: 600 }}>
                            ADMIN
                          </span>
                        )}
                      </td>

                      {/* Permission cells */}
                      {allPermissions.map(perm => {
                        const hasIt = rowPerms[perm] ?? false;
                        const isAdminLocked = isLocked && perm === 'admin:all';
                        const key = `${role}:${perm}`;
                        const isSaving = saving === key;

                        return (
                          <td
                            key={perm}
                            style={{
                              textAlign: 'center',
                              padding: '10px 4px',
                              borderBottom: rIdx < allRoles.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                            }}
                          >
                            <button
                              onClick={() => handleToggle(role, perm, hasIt)}
                              disabled={isAdminLocked || isSaving}
                              title={isAdminLocked ? 'Locked — GM/Owner always have full admin' : (hasIt ? 'Click to revoke' : 'Click to grant')}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: hasIt
                                  ? '1px solid rgba(20,184,166,0.4)'
                                  : '1px solid rgba(255,255,255,0.08)',
                                background: hasIt
                                  ? 'rgba(20,184,166,0.15)'
                                  : 'rgba(255,255,255,0.02)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: isAdminLocked ? 'default' : 'pointer',
                                opacity: isAdminLocked ? 0.7 : 1,
                                transition: 'all 0.15s ease',
                                margin: '0 auto',
                                outline: 'none',
                              }}
                            >
                              {isSaving ? (
                                <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(20,184,166,0.5)', borderTopColor: '#14b8a6', animation: 'spin 0.6s linear infinite' }} />
                              ) : hasIt ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isAdminLocked ? 'rgba(20,184,166,0.6)' : '#14b8a6'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              Has permission
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }} />
              No permission
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
              <span style={{ color: '#14b8a6' }}>●</span>
              Locked (GM/Owner admin is permanent)
            </div>
          </div>
        </div>

        {/* ── User List ── */}
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#14b8a6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, marginTop: 0 }}>
            Users & Role Assignment
          </h2>

          <div style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.07)',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.8fr 2fr 1.4fr 1fr 1fr',
              padding: '10px 20px',
              background: '#0c2330',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(148,163,184,0.5)',
            }}>
              <div>Name</div>
              <div>Email</div>
              <div>Role</div>
              <div>Island</div>
              <div style={{ textAlign: 'center' }}>Permissions</div>
            </div>

            {users.map((user, idx) => {
              const currentRole = userRoles[user.user_id] || user.role;
              const isGmOwner = currentRole === 'gm' || currentRole === 'owner';

              return (
                <div
                  key={user.user_id || idx}
                  onMouseEnter={() => setHighlightRole(currentRole)}
                  onMouseLeave={() => setHighlightRole(null)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.8fr 2fr 1.4fr 1fr 1fr',
                    padding: '10px 20px',
                    borderBottom: idx < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: highlightRole === currentRole ? 'rgba(20,184,166,0.05)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    alignItems: 'center',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {/* Name */}
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>
                    {user.name || '—'}
                  </div>

                  {/* Email */}
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>
                    {user.email || '—'}
                  </div>

                  {/* Role dropdown */}
                  <div>
                    <select
                      value={currentRole}
                      onChange={e => handleRoleChange(user.user_id, e.target.value)}
                      style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 7,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: isGmOwner ? 'rgba(20,184,166,0.08)' : 'rgba(255,255,255,0.04)',
                        color: isGmOwner ? '#14b8a6' : 'rgba(203,213,225,0.8)',
                        cursor: 'pointer',
                        outline: 'none',
                        width: '100%',
                        fontWeight: isGmOwner ? 700 : 400,
                      }}
                    >
                      {allRoles.map(r => (
                        <option key={r} value={r} style={{ background: '#0c2330' }}>
                          {ROLE_LABELS[r] || r}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Island */}
                  <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)' }}>
                    {user.island || '—'}
                  </div>

                  {/* Permission count */}
                  <div style={{ textAlign: 'center' }}>
                    {isGmOwner ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#14b8a6', background: 'rgba(20,184,166,0.1)', padding: '3px 8px', borderRadius: 6 }}>
                        All
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.5)' }}>
                        {Object.values(matrix[currentRole] || {}).filter(Boolean).length} of {allPermissions.length}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
