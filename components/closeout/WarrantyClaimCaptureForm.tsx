/**
 * BAN-375 Closeout v1.1 Phase 2 — inbound warranty claim capture.
 *
 * POSTs to the existing `POST /api/closeout/warranty-claims` route
 * (app/api/closeout/warranty-claims/route.ts) using the payload shape
 * already validated server-side: warranty_id, inbound_source,
 * inbound_date, issue_description (all required); inbound_evidence,
 * reported_by, affected_scope (optional). Triage and resolution
 * fields are intentionally excluded — triage is captured later in
 * WarrantyClaimTriagePanel.
 *
 * Split into <FormView> (pure, prop-driven, easy to render-test) and
 * <WarrantyClaimCaptureForm> (state + fetch). Same orchestrator
 * pattern as PunchListTab (components/engagements/PunchListTab.tsx).
 */

'use client';

import { useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';
import type { WarrantyRow } from './WarrantyRecordCard';

const INBOUND_SOURCES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'PORTAL', label: 'Portal' },
  { value: 'FIELD_DISCOVERY', label: 'Field discovery' },
];

export type WarrantyClaimCaptureValues = {
  warranty_id: string;
  inbound_source: string;
  inbound_date: string;
  issue_description: string;
  inbound_evidence: string;
  reported_by_name: string;
  reported_by_email: string;
  reported_by_phone: string;
  affected_scope: string;
};

export const EMPTY_VALUES: WarrantyClaimCaptureValues = {
  warranty_id: '',
  inbound_source: '',
  inbound_date: '',
  issue_description: '',
  inbound_evidence: '',
  reported_by_name: '',
  reported_by_email: '',
  reported_by_phone: '',
  affected_scope: '',
};

const WRAP: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)',
  padding: 18,
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
  padding: '8px 12px', borderRadius: 8, background: 'var(--color-red-50)',
  border: '1px solid rgba(185,28,28,0.2)', color: 'var(--color-red-700)',
  fontSize: 12, fontWeight: 700,
};

export function FormView({
  values,
  warranties,
  submitting,
  errorMessage,
  errorCode,
  onChange,
  onSubmit,
}: {
  values: WarrantyClaimCaptureValues;
  warranties: WarrantyRow[];
  submitting: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  onChange: (next: WarrantyClaimCaptureValues) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const setField = <K extends keyof WarrantyClaimCaptureValues>(key: K) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange({ ...values, [key]: e.target.value });
    };

  return (
    <form
      style={WRAP}
      data-testid="warranty-claim-capture-form"
      onSubmit={onSubmit}
    >
      {errorMessage && (
        <div
          style={ERROR_BANNER}
          data-testid="warranty-claim-capture-error"
          data-error-code={errorCode ?? undefined}
        >
          {errorMessage}
        </div>
      )}

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-warranty">Warranty</label>
        <select
          id="warranty-claim-warranty"
          name="warranty_id"
          value={values.warranty_id}
          onChange={setField('warranty_id')}
          style={INPUT}
          required
          data-testid="warranty-claim-warranty-select"
        >
          <option value="">
            {warranties.length === 0
              ? 'No warranties available'
              : `Select warranty (${warranties.length})`}
          </option>
          {warranties.map((w) => (
            <option key={w.warranty_id} value={w.warranty_id}>
              {w.warranty_id.slice(0, 8)} · {w.start_date} · {String(w.status)}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-source">Inbound source</label>
        <select
          id="warranty-claim-source"
          name="inbound_source"
          value={values.inbound_source}
          onChange={setField('inbound_source')}
          style={INPUT}
          required
        >
          <option value="">Select source…</option>
          {INBOUND_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-date">Inbound date</label>
        <input
          id="warranty-claim-date"
          type="date"
          name="inbound_date"
          value={values.inbound_date}
          onChange={setField('inbound_date')}
          style={INPUT}
          required
        />
      </div>

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-description">Issue description</label>
        <textarea
          id="warranty-claim-description"
          name="issue_description"
          value={values.issue_description}
          onChange={setField('issue_description')}
          style={TEXTAREA}
          required
        />
      </div>

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-evidence">Inbound evidence (Drive ID or URL)</label>
        <input
          id="warranty-claim-evidence"
          name="inbound_evidence"
          value={values.inbound_evidence}
          onChange={setField('inbound_evidence')}
          style={INPUT}
        />
      </div>

      <div style={FIELD}>
        <label style={LABEL} htmlFor="warranty-claim-affected-scope">Affected scope</label>
        <input
          id="warranty-claim-affected-scope"
          name="affected_scope"
          value={values.affected_scope}
          onChange={setField('affected_scope')}
          style={INPUT}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={FIELD}>
          <label style={LABEL} htmlFor="warranty-claim-reported-name">Reported by — name</label>
          <input
            id="warranty-claim-reported-name"
            name="reported_by_name"
            value={values.reported_by_name}
            onChange={setField('reported_by_name')}
            style={INPUT}
          />
        </div>
        <div style={FIELD}>
          <label style={LABEL} htmlFor="warranty-claim-reported-email">Reported by — email</label>
          <input
            id="warranty-claim-reported-email"
            type="email"
            name="reported_by_email"
            value={values.reported_by_email}
            onChange={setField('reported_by_email')}
            style={INPUT}
          />
        </div>
        <div style={FIELD}>
          <label style={LABEL} htmlFor="warranty-claim-reported-phone">Reported by — phone</label>
          <input
            id="warranty-claim-reported-phone"
            name="reported_by_phone"
            value={values.reported_by_phone}
            onChange={setField('reported_by_phone')}
            style={INPUT}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={submitting}
          style={submitting ? BUTTON_DISABLED : BUTTON}
          data-testid="warranty-claim-capture-submit"
        >
          {submitting ? 'Creating…' : 'Create claim'}
        </button>
      </div>
    </form>
  );
}

export function buildPayload(values: WarrantyClaimCaptureValues): Record<string, unknown> {
  const reported: Record<string, string> = {};
  if (values.reported_by_name.trim()) reported.name = values.reported_by_name.trim();
  if (values.reported_by_email.trim()) reported.email = values.reported_by_email.trim();
  if (values.reported_by_phone.trim()) reported.phone = values.reported_by_phone.trim();

  const payload: Record<string, unknown> = {
    warranty_id: values.warranty_id.trim(),
    inbound_source: values.inbound_source.trim(),
    inbound_date: values.inbound_date.trim(),
    issue_description: values.issue_description.trim(),
  };
  if (values.inbound_evidence.trim()) payload.inbound_evidence = values.inbound_evidence.trim();
  if (values.affected_scope.trim()) payload.affected_scope = values.affected_scope.trim();
  if (Object.keys(reported).length > 0) payload.reported_by = reported;
  return payload;
}

export default function WarrantyClaimCaptureForm({
  warranties,
  onCreated,
  initialValues,
}: {
  warranties: WarrantyRow[];
  onCreated?: (claimId: string, warrantyId: string) => void;
  initialValues?: Partial<WarrantyClaimCaptureValues>;
}) {
  const [values, setValues] = useState<WarrantyClaimCaptureValues>({
    ...EMPTY_VALUES,
    ...(initialValues ?? {}),
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);
    try {
      const res = await fetch('/api/closeout/warranty-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(values)),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status !== 201 || !body.ok) {
        setErrorMessage(typeof body.error === 'string' ? body.error : 'Failed to create claim');
        setErrorCode(typeof body.code === 'string' ? body.code : null);
        return;
      }
      onCreated?.(String(body.claim_id), String(body.warranty_id));
      setValues({ ...EMPTY_VALUES });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setErrorCode(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormView
      values={values}
      warranties={warranties}
      submitting={submitting}
      errorMessage={errorMessage}
      errorCode={errorCode}
      onChange={setValues}
      onSubmit={handleSubmit}
    />
  );
}
