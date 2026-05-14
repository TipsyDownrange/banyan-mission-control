type BuildQueuePlaceholderProps = {
  surfaceName: string;
  specDate: string | null;
  buildQueueStatus: string;
  description?: string;
  icon?: string;
};

export default function BuildQueuePlaceholder({
  surfaceName,
  specDate,
  buildQueueStatus,
  description,
  icon,
}: BuildQueuePlaceholderProps) {
  const statusLine = specDate
    ? `Architecture specced ${specDate} · ${buildQueueStatus}`
    : buildQueueStatus;

  return (
    <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: '60px 40px', textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>}
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{surfaceName} — In Build Queue</div>
      {description && (
        <div style={{ fontSize: 14, color: '#64748b', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>{description}.</div>
      )}
      <div style={{ marginTop: 20, fontSize: 12, color: '#94a3b8' }}>{statusLine}</div>
    </div>
  );
}
