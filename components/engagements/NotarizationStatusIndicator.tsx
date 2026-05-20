/**
 * BAN-322 Pay Apps v1 — notarization status badge.
 *
 * Per RF6: returns null when notarizationRequired is false (no badge at all).
 * When required + no active session → muted "Not started" badge.
 * When session exists → state-colored badge + "View" link to a future
 * /notarization/[session_id] route (acceptable 404 per dispatch).
 */

import type { CSSProperties } from 'react';

export type NotarizationSession = {
  session_id: string;
  state: string;
  provider: string;
  provider_session_url: string | null;
  completed_at: string | null;
};

const STATE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  CREATED:     { bg: '#eff6ff', color: '#1d4ed8', label: 'Notarization · Created' },
  IN_PROGRESS: { bg: '#eff6ff', color: '#1d4ed8', label: 'Notarization · In Progress' },
  COMPLETED:   { bg: '#f0fdfa', color: 'var(--bos-color-brand-primary-deep)', label: 'Notarization · Completed' },
  FAILED:      { bg: 'var(--color-red-50)', color: 'var(--color-red-700)', label: 'Notarization · Failed' },
  CANCELLED:   { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)', label: 'Notarization · Cancelled' },
};

const ROW: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
  background: 'white', borderRadius: 12, border: '1px solid var(--color-surface-border)',
};

export default function NotarizationStatusIndicator({
  latestNotarization,
  notarizationRequired,
}: {
  latestNotarization: NotarizationSession | null;
  notarizationRequired: boolean;
}) {
  if (!notarizationRequired) return null;

  if (latestNotarization === null) {
    return (
      <div style={ROW}>
        <span style={{
          padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
          letterSpacing: '0.04em', background: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)',
          border: '1px solid #64748b33',
        }}>
          Notarization · Not started
        </span>
        <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
          Required by billing format. No session has been created yet.
        </span>
      </div>
    );
  }

  const badge = STATE_BADGE[latestNotarization.state]
    ?? { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)', label: latestNotarization.state.replace(/_/g, ' ') };

  return (
    <div style={ROW}>
      <span style={{
        padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
        letterSpacing: '0.04em', background: badge.bg, color: badge.color,
        border: `1px solid ${badge.color}33`, whiteSpace: 'nowrap',
      }}>
        {badge.label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>
        {latestNotarization.provider} · {latestNotarization.session_id.slice(0, 8)}
      </span>
      <a
        href={`/notarization/${latestNotarization.session_id}`}
        style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700,
          color: 'var(--bos-color-brand-primary-deep)', textDecoration: 'none',
        }}
      >
        View →
      </a>
    </div>
  );
}
