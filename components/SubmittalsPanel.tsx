export default function SubmittalsPanel() {
  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Project Management</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Submittals & RFIs</h1>
      </div>
      <div style={{ background: 'white', borderRadius: 24, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.04)', padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 16 }}>Coming in Phase 2</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: 10 }}>Submittals & RFIs</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, maxWidth: 400, margin: '0 auto' }}>
          Submittal logs, RFI tracking, and approval status will replace Smartsheet here. Kai auto-detects approvals from email and updates status without manual input.
        </div>
      </div>
    </div>
  );
}
