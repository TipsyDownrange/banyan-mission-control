/**
 * BAN-375 Closeout v1.1.1 Phase 1 — /admin/subcontractors
 *
 * Server-side wrapper around the SubcontractorsTable client component.
 * Mounted under /admin to keep the surface gated to admin-tier roles by the
 * existing middleware boundary. The API itself enforces business:admin on
 * mutations; the page renders read-only for any project:view role and the
 * UI exposes no write controls in this phase.
 */

import SubcontractorsTable from '@/components/admin/SubcontractorsTable';

export const dynamic = 'force-dynamic';

export default function SubcontractorsAdminPage() {
  return (
    <main
      style={{
        padding: '32px 28px',
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
      data-testid="subs-admin-page"
    >
      <div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em',
        }}>
          Subcontractors
        </div>
        <div style={{ fontSize: 13, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
          Tenant-scoped subs catalog. Framers and waterproofers only (BanyanOS
          Scheduling Spine alignment). Closeout punch items reference rows
          here via <code>assigned_to_sub_id</code>.
        </div>
      </div>
      <SubcontractorsTable />
    </main>
  );
}
