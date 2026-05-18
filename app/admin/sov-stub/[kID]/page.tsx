/**
 * BAN-336 Pay App Core — Admin SOV-stub form (server shell + client form).
 *
 * /admin/sov-stub/[kID]
 *
 * Resolves the kID → engagement_id via the existing billing/by-kid aggregator,
 * then renders the inline create form. Submit POSTs /api/admin/sov-stub.
 * Lock button POSTs /api/admin/sov-stub/[sov_id]/lock once a draft version
 * exists, transitioning APPROVED_INTERNAL → LOCKED.
 *
 * Gate: super_admin / business_admin. Page wraps the existing AGENTS.md
 * staging guard via the API gate on the underlying routes; the UI is
 * permissive client-side and lets the server return 403 if the actor isn't
 * authorized.
 */

import SovStubForm from './SovStubForm';

export default async function AdminSovStubPage(
  props: { params: Promise<{ kID: string }> },
) {
  const { kID } = await props.params;
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6,
        }}>
          Admin · SOV Stub
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Stub Schedule of Values — {kID}
        </h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Bypasses Phase 1 Estimating Workspace. Create a Schedule of Values
          manually with N lines and lock it so the Pay App create wizard can
          fire. Super-admin / business-admin only.
        </p>
      </div>
      <SovStubForm kID={kID} />
    </div>
  );
}
