'use client';

/**
 * BAN-376 Customer Pipeline — top-level page (spec §7.1).
 *
 * Thin wrapper around <CustomerPipelinePanel> so the panel can also be
 * rendered inside the main SPA shell at app/page.tsx.  Tia / Jenny can pin
 * /inquiries directly on their workstations per spec §7.4.
 */

import CustomerPipelinePanel from '@/components/inquiries/CustomerPipelinePanel';

export default function InquiriesPage() {
  return (
    <div style={{ height: '100vh' }}>
      <CustomerPipelinePanel />
    </div>
  );
}
