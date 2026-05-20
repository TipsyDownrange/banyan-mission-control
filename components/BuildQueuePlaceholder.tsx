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
    <div style={{ background: 'white', borderRadius: 20, border: '1px solid var(--color-surface-border)', padding: '60px 40px', textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>}
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-ink-primary)', marginBottom: 8 }}>{surfaceName} — In Build Queue</div>
      {description && (
        <div style={{ fontSize: 14, color: 'var(--bos-color-ink-disabled)', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>{description}.</div>
      )}
      <div style={{ marginTop: 20, fontSize: 12, color: 'var(--bos-color-ink-tertiary)' }}>{statusLine}</div>
    </div>
  );
}
