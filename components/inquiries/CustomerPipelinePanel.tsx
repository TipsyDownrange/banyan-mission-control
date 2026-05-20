'use client';

/**
 * BAN-376 Customer Pipeline — combined inbox + capture + detail panel.
 *
 * Used by both the dedicated /inquiries route and the in-shell SPA render
 * (app/page.tsx activeView='Customer Pipeline').  Same component, two entry
 * points — Tia/Jenny can pin /inquiries on their workstations per spec §7.4,
 * while operators inside the main SPA can reach the same UI from the
 * sidebar without leaving the shell.
 */

import { useState } from 'react';
import InquiryInboxList, { type InquiryRow } from './InquiryInboxList';
import InquiryQuickCaptureForm from './InquiryQuickCaptureForm';
import InquiryDetailPanel, { type InquiryDetail } from './InquiryDetailPanel';

export default function CustomerPipelinePanel() {
  const [showCapture, setShowCapture] = useState(false);
  const [selected, setSelected] = useState<InquiryDetail | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadDetail(row: InquiryRow) {
    try {
      const res = await fetch(`/api/inquiries/${row.inquiry_id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { inquiry: InquiryDetail };
      setSelected(data.inquiry);
    } catch {
      setSelected(null);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '2fr 1fr' : '1fr', height: '100%', overflow: 'hidden' }}>
      <main style={{ overflowY: 'auto' }}>
        <InquiryInboxList
          key={refreshKey}
          onSelect={loadDetail}
          onCreateNew={() => setShowCapture(true)}
        />

        {showCapture && (
          <div style={{ padding: 16, borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Log a new inquiry</h3>
              <button onClick={() => setShowCapture(false)} aria-label="Close capture form">×</button>
            </div>
            <InquiryQuickCaptureForm
              onSubmitted={() => {
                setShowCapture(false);
                setRefreshKey(k => k + 1);
              }}
            />
          </div>
        )}
      </main>

      {selected && (
        <InquiryDetailPanel
          inquiry={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
