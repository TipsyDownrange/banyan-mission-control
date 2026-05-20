/**
 * AIA Submission Packet Export — UI button.
 *
 * Triggers the GET /api/aia/pay-applications/[id]/submission-bundle endpoint
 * and streams the resulting PDF (default) or ZIP archive to the browser via
 * Blob download. Disabled when the pay app is in a state that has no signed
 * artifact yet (PENDING_DRAFT, READY_FOR_NOTARIZATION) or no submission
 * scenario (REJECTED, PAID_PARTIAL, PAID_FULL).
 */

'use client';

import { useState, type CSSProperties } from 'react';

const ENABLED_STATES = new Set([
  'READY_FOR_SUBMISSION',
  'SUBMITTED',
  'ARCHITECT_CERTIFIED',
  'GC_APPROVED',
]);

const STATE_TOOLTIP: Record<string, string> = {
  PENDING_DRAFT: 'No signed pay app available yet — finish the draft first.',
  READY_FOR_NOTARIZATION: 'Notarize (or skip notarization) before generating a submission packet.',
  REJECTED: 'Rejected pay apps cannot be submitted.',
  PAID_PARTIAL: 'Paid pay apps are closed — use the archived bundle instead.',
  PAID_FULL: 'Paid pay apps are closed — use the archived bundle instead.',
};

export interface SubmissionPacketButtonProps {
  payAppId: string;
  payAppNumber: number;
  state: string;
}

export default function SubmissionPacketButton({
  payAppId,
  payAppNumber,
  state,
}: SubmissionPacketButtonProps) {
  const [busy, setBusy] = useState<null | 'pdf' | 'zip'>(null);
  const [err, setErr] = useState<string | null>(null);

  const enabled = ENABLED_STATES.has(state);
  const tooltip = enabled
    ? 'Generate a single PDF (or ZIP) bundle with cover letter, signed pay app, all lien waivers, and manifest.'
    : STATE_TOOLTIP[state] ?? 'Submission packet is only available once the pay app is ready for submission.';

  async function download(format: 'pdf' | 'zip') {
    if (!enabled) return;
    setBusy(format);
    setErr(null);
    try {
      const res = await fetch(
        `/api/aia/pay-applications/${payAppId}/submission-bundle?format=${format}`,
      );
      if (!res.ok) {
        let detail = `${res.status}`;
        try {
          const data = await res.json();
          detail = data.error ?? data.code ?? detail;
        } catch {
          /* not json */
        }
        setErr(`Submission packet failed (${detail})`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const fallback = `PayApp-${payAppNumber}-submission.${format}`;
      const filename = match ? match[1] : fallback;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  const baseBtn: CSSProperties = {
    padding: '7px 14px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 800,
    cursor: enabled ? 'pointer' : 'not-allowed',
    border: '1px solid',
  };
  const primaryBtn: CSSProperties = {
    ...baseBtn,
    background: enabled ? '#0c2330' : '#f8fafc',
    color: enabled ? '#fff' : '#94a3b8',
    borderColor: enabled ? '#0c2330' : '#e2e8f0',
  };
  const secondaryBtn: CSSProperties = {
    ...baseBtn,
    background: '#fff',
    color: enabled ? '#0c2330' : '#94a3b8',
    borderColor: enabled ? '#cbd5e1' : '#e2e8f0',
  };

  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => download('pdf')}
        disabled={!enabled || busy !== null}
        aria-disabled={!enabled}
        title={tooltip}
        style={primaryBtn}
      >
        {busy === 'pdf' ? 'Generating…' : 'Generate Submission Packet'}
      </button>
      <button
        type="button"
        onClick={() => download('zip')}
        disabled={!enabled || busy !== null}
        aria-disabled={!enabled}
        title={tooltip}
        style={secondaryBtn}
      >
        {busy === 'zip' ? 'Building…' : 'Download as ZIP'}
      </button>
      {err && (
        <span style={{ fontSize: 11, color: '#b91c1c' }}>{err}</span>
      )}
    </div>
  );
}
