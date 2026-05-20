/**
 * BAN-375 Closeout v1.1 Phase 2 — warranty claim triage capture.
 *
 * PATCHes to the existing `PATCH /api/closeout/warranty-claims/[id]`
 * route (app/api/closeout/warranty-claims/[id]/route.ts). Only
 * triage_* + service_wo_id + back_charge_id are sent — resolution
 * fields are captured later in WarrantyClaimDetail.
 *
 * triage_by / triage_at default to the current actor on submit (the
 * underlying PATCH gate already attaches updated_at; triage_at is
 * captured at submit time to bind the timestamp to the user action
 * rather than the row's last touch).
 *
 * ADR-026 — service_wo_id must match /^SRV-/ (validated in the API
 * route at line 50-53 of warranty-claims/route.ts). The form surfaces
 * the INVALID_SERVICE_WO_ID code so reviewers see the same error
 * shape they will see in production.
 */

'use client';

import { useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';

const TRIAGE_RESULTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'KULA_RESPONSIBLE', label: 'Kula responsible' },
  { value: 'MANUFACTURER_RESPONSIBLE', label: 'Manufacturer responsible' },
  { value: 'OTHER_TRADE_RESPONSIBLE', label: 'Other trade responsible' },
  { value: 'OUT_OF_WARRANTY', label: 'Out of warranty' },
  { value: 'DISPUTED', label: 'Disputed' },
];

export type WarrantyClaimSummary = {
  claim_id: string;
  warranty_id: string;
  inbound_source: string;
  inbound_date: string;
  issue_description: string;
  triage_result?: string | null;
  triage_reasoning?: string | null;
  service_wo_id?: string | null;
  back_charge_id?: string | null;
};

export type TriageValues = {
  triage_result: string;
  triage_reasoning: string;
  service_wo_id: string;
  back_charge_id: string;
};

export const EMPTY_TRIAGE: TriageValues = {
  triage_result: '',
  triage_reasoning: '',
  service_wo_id: '',
  back_charge_id: '',
};

const WRAP: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14,
  background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)',
  padding: 18,
};

const SUMMARY: CSSProperties = {
  background: 'var(--color-surface)', borderRadius: 10, padding: '10px 12px',
  display: 'flex', flexDirection: 'column', gap: 6,
  border: '1px solid #eef2f7',
};

const FIELD: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
};

const LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const INPUT: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)',
  background: 'white', fontSize: 13, color: 'var(--color-ink-primary)',
};

const TEXTAREA: CSSProperties = { ...INPUT, minHeight: 70, resize: 'vertical' };

const BUTTON: CSSProperties = {
  padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 13, fontWeight: 700,
};

const BUTTON_DISABLED: CSSProperties = { ...BUTTON, background: 'var(--bos-color-ink-tertiary)', cursor: 'not-allowed' };

const ERROR_BANNER: CSSProperties = {
  padding: '8px 12px', borderRadius: 8, background: '#fef2f2',
  border: '1px solid rgba(185,28,28,0.2)', color: '#b91c1c',
  fontSize: 12, fontWeight: 700,
};

const META_LABEL: CSSProperties = { fontSize: 10, color: 'var(--bos-color-ink-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' };
const META_VALUE: CSSProperties = { fontSize: 12, color: 'var(--color-ink-primary)', marginTop: 2 };

export function TriagePanelView({
  claim,
  values,
  actorEmail,
  submitting,
  errorMessage,
  errorCode,
  onChange,
  onSubmit,
}: {
  claim: WarrantyClaimSummary;
  values: TriageValues;
  actorEmail: string | null;
  submitting: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  onChange: (next: TriageValues) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const setField = <K extends keyof TriageValues>(key: K) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange({ ...values, [key]: e.target.value });
    };

  return (
    <form
      style={WRAP}
      data-testid="warranty-claim-triage-panel"
      data-claim-id={claim.claim_id}
      onSubmit={onSubmit}
    >
      <div style={SUMMARY} data-testid="warranty-claim-triage-summary">
        <div>
          <div style={META_LABEL}>Claim</div>
          <div style={{ ...META_VALUE, fontFamily: 'monospace' }}>{claim.claim_id}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={META_LABEL}>Inbound source</div>
            <div style={META_VALUE}>{claim.inbound_source || '—'}</div>
          </div>
          <div>
            <div style={META_LABEL}>Inbound date</div>
            <div style={META_VALUE}>{claim.inbound_date || '—'}</div>
          </div>
        </div>
        <div>
          <div style={META_LABEL}>Issue</div>
          <div style={META_VALUE}>{claim.issue_description || '—'}</div>
        </div>
      </div>

      {errorMessage && (
        <div
          style={ERROR_BANNER}
          data-testid="warranty-claim-triage-error"
          data-error-code={errorCode ?? undefined}
        >
          {errorMessage}
        </div>
      )}

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-triage-result">Triage result</label>
        <select
          id="warranty-claim-triage-result"
          name="triage_result"
          value={values.triage_result}
          onChange={setField('triage_result')}
          style={INPUT}
          required
          data-testid="warranty-claim-triage-result-select"
        >
          <option value="">Select…</option>
          {TRIAGE_RESULTS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-triage-reasoning">Triage reasoning</label>
        <textarea
          id="warranty-claim-triage-reasoning"
          name="triage_reasoning"
          value={values.triage_reasoning}
          onChange={setField('triage_reasoning')}
          style={TEXTAREA}
          required
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={FIELD}>
          <label style={LABEL} htmlFor="warranty-claim-triage-service-wo">Service WO (SRV-…)</label>
          <input
            id="warranty-claim-triage-service-wo"
            name="service_wo_id"
            value={values.service_wo_id}
            onChange={setField('service_wo_id')}
            style={INPUT}
            placeholder="SRV-26-0001"
          />
        </div>
        <div style={FIELD}>
          <label style={LABEL} htmlFor="warranty-claim-triage-back-charge">Back charge ID</label>
          <input
            id="warranty-claim-triage-back-charge"
            name="back_charge_id"
            value={values.back_charge_id}
            onChange={setField('back_charge_id')}
            style={INPUT}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={META_LABEL} data-testid="warranty-claim-triage-actor">
          {actorEmail ? `Triaged by ${actorEmail}` : 'Triaged by current user'}
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={submitting ? BUTTON_DISABLED : BUTTON}
          data-testid="warranty-claim-triage-submit"
        >
          {submitting ? 'Saving…' : 'Save triage'}
        </button>
      </div>
    </form>
  );
}

export function buildTriagePayload(values: TriageValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    triage_result: values.triage_result,
    triage_reasoning: values.triage_reasoning.trim(),
    triage_at: new Date().toISOString(),
  };
  if (values.service_wo_id.trim()) payload.service_wo_id = values.service_wo_id.trim();
  if (values.back_charge_id.trim()) payload.back_charge_id = values.back_charge_id.trim();
  return payload;
}

export default function WarrantyClaimTriagePanel({
  claim,
  actorEmail,
  onTriaged,
}: {
  claim: WarrantyClaimSummary;
  actorEmail?: string | null;
  onTriaged?: (claimId: string) => void;
}) {
  const initial = useMemo<TriageValues>(() => ({
    triage_result: claim.triage_result ?? '',
    triage_reasoning: claim.triage_reasoning ?? '',
    service_wo_id: claim.service_wo_id ?? '',
    back_charge_id: claim.back_charge_id ?? '',
  }), [claim]);

  const [values, setValues] = useState<TriageValues>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);
    try {
      const res = await fetch(`/api/closeout/warranty-claims/${encodeURIComponent(claim.claim_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTriagePayload(values)),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status !== 200 || !body.ok) {
        setErrorMessage(typeof body.error === 'string' ? body.error : 'Failed to save triage');
        setErrorCode(typeof body.code === 'string' ? body.code : null);
        return;
      }
      onTriaged?.(claim.claim_id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setErrorCode(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TriagePanelView
      claim={claim}
      values={values}
      actorEmail={actorEmail ?? null}
      submitting={submitting}
      errorMessage={errorMessage}
      errorCode={errorCode}
      onChange={setValues}
      onSubmit={handleSubmit}
    />
  );
}
