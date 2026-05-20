/**
 * BAN-375 Closeout v1.1 Phase 2 — warranty claim detail + resolution.
 *
 * Read-only display of every column on a warranty_claims row
 * (db/schema.ts:1389) plus a resolution capture block that PATCHes
 * the existing /api/closeout/warranty-claims/[id] route. The
 * "Download warranty letter" affordance opens the new GET route at
 * /api/closeout/warranties/[id]/warranty-letter in a new tab — the
 * route streams the PDF so the browser handles the download.
 */

'use client';

import { useMemo, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';

const RESOLUTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REFERRED', label: 'Referred' },
  { value: 'WRITTEN_OFF', label: 'Written off' },
  { value: 'UNRESOLVED', label: 'Unresolved' },
];

export type WarrantyClaimRow = {
  claim_id: string;
  tenant_id?: string;
  engagement_id?: string;
  warranty_id: string;
  inbound_source: string;
  inbound_evidence: string | null;
  inbound_date: string;
  reported_by: Record<string, unknown> | null;
  issue_description: string;
  affected_scope: string | null;
  triage_result: string | null;
  triage_by: string | null;
  triage_at: string | null;
  triage_reasoning: string | null;
  service_wo_id: string | null;
  back_charge_id: string | null;
  resolution: string | null;
  resolution_evidence_drive_id: string | null;
  resolved_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ResolutionValues = {
  resolution: string;
  resolution_evidence_drive_id: string;
  resolved_at: string;
};

export const EMPTY_RESOLUTION: ResolutionValues = {
  resolution: '',
  resolution_evidence_drive_id: '',
  resolved_at: '',
};

const CARD: CSSProperties = {
  background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
  padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
};

const SECTION: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8,
};

const SECTION_HEAD: CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#0f766e',
  textTransform: 'uppercase', letterSpacing: '0.1em',
};

const FIELD_ROW: CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
};

const LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const VALUE: CSSProperties = {
  fontSize: 13, color: '#0f172a', marginTop: 2,
};

const MONO: CSSProperties = { ...VALUE, fontFamily: 'monospace' };

const INPUT: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
  background: 'white', fontSize: 13, color: '#0f172a',
};

const BUTTON: CSSProperties = {
  padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: '#0f766e', color: 'white', fontSize: 13, fontWeight: 700,
};

const BUTTON_DISABLED: CSSProperties = { ...BUTTON, background: '#94a3b8', cursor: 'not-allowed' };

const BUTTON_SECONDARY: CSSProperties = {
  padding: '10px 18px', borderRadius: 10, border: '1px solid #0f766e',
  background: 'white', color: '#0f766e', fontSize: 13, fontWeight: 700,
  textDecoration: 'none', display: 'inline-block',
};

const ERROR_BANNER: CSSProperties = {
  padding: '8px 12px', borderRadius: 8, background: '#fef2f2',
  border: '1px solid rgba(185,28,28,0.2)', color: '#b91c1c',
  fontSize: 12, fontWeight: 700,
};

const TRIAGE_LABEL: Record<string, string> = {
  KULA_RESPONSIBLE: 'Kula responsible',
  MANUFACTURER_RESPONSIBLE: 'Manufacturer responsible',
  OTHER_TRADE_RESPONSIBLE: 'Other trade responsible',
  OUT_OF_WARRANTY: 'Out of warranty',
  DISPUTED: 'Disputed',
};

const RESOLUTION_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  REFERRED: 'Referred',
  WRITTEN_OFF: 'Written off',
  UNRESOLVED: 'Unresolved',
};

const INBOUND_LABEL: Record<string, string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  PORTAL: 'Portal',
  FIELD_DISCOVERY: 'Field discovery',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function reportedBySummary(rb: Record<string, unknown> | null | undefined): string {
  if (!rb || typeof rb !== 'object' || Object.keys(rb).length === 0) return '—';
  const parts: string[] = [];
  for (const k of ['name', 'email', 'phone']) {
    const v = (rb as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim().length > 0) parts.push(`${k}: ${v}`);
  }
  if (parts.length === 0) {
    try { return JSON.stringify(rb); } catch { return '—'; }
  }
  return parts.join(' · ');
}

export function DetailView({
  claim,
  values,
  submitting,
  errorMessage,
  errorCode,
  onChange,
  onSubmit,
  letterHref,
}: {
  claim: WarrantyClaimRow;
  values: ResolutionValues;
  submitting: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  onChange: (next: ResolutionValues) => void;
  onSubmit: (e: FormEvent) => void;
  letterHref: string;
}) {
  const setField = <K extends keyof ResolutionValues>(key: K) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onChange({ ...values, [key]: e.target.value });
    };

  return (
    <div style={CARD} data-testid="warranty-claim-detail" data-claim-id={claim.claim_id}>
      <div style={SECTION}>
        <div style={SECTION_HEAD}>Claim</div>
        <div style={FIELD_ROW}>
          <div>
            <div style={LABEL}>Claim ID</div>
            <div style={MONO}>{claim.claim_id}</div>
          </div>
          <div>
            <div style={LABEL}>Warranty</div>
            <div style={MONO}>{claim.warranty_id}</div>
          </div>
        </div>
      </div>

      <div style={SECTION}>
        <div style={SECTION_HEAD}>Inbound</div>
        <div style={FIELD_ROW}>
          <div>
            <div style={LABEL}>Source</div>
            <div style={VALUE}>{INBOUND_LABEL[claim.inbound_source] ?? claim.inbound_source}</div>
          </div>
          <div>
            <div style={LABEL}>Date</div>
            <div style={VALUE}>{claim.inbound_date}</div>
          </div>
          <div>
            <div style={LABEL}>Evidence</div>
            <div style={VALUE}>{claim.inbound_evidence ?? '—'}</div>
          </div>
          <div>
            <div style={LABEL}>Reported by</div>
            <div style={VALUE}>{reportedBySummary(claim.reported_by)}</div>
          </div>
        </div>
        <div>
          <div style={LABEL}>Issue description</div>
          <div style={VALUE}>{claim.issue_description}</div>
        </div>
        <div>
          <div style={LABEL}>Affected scope</div>
          <div style={VALUE}>{claim.affected_scope ?? '—'}</div>
        </div>
      </div>

      <div style={SECTION}>
        <div style={SECTION_HEAD}>Triage</div>
        <div style={FIELD_ROW}>
          <div>
            <div style={LABEL}>Result</div>
            <div style={VALUE}>
              {claim.triage_result ? (TRIAGE_LABEL[claim.triage_result] ?? claim.triage_result) : '—'}
            </div>
          </div>
          <div>
            <div style={LABEL}>Triaged at</div>
            <div style={VALUE}>{claim.triage_at ?? '—'}</div>
          </div>
          <div>
            <div style={LABEL}>Service WO</div>
            <div style={MONO}>{claim.service_wo_id ?? '—'}</div>
          </div>
          <div>
            <div style={LABEL}>Back charge</div>
            <div style={MONO}>{claim.back_charge_id ?? '—'}</div>
          </div>
        </div>
        <div>
          <div style={LABEL}>Reasoning</div>
          <div style={VALUE}>{claim.triage_reasoning ?? '—'}</div>
        </div>
      </div>

      <form style={SECTION} onSubmit={onSubmit} data-testid="warranty-claim-resolution-form">
        <div style={SECTION_HEAD}>Resolution</div>
        {errorMessage && (
          <div
            style={ERROR_BANNER}
            data-testid="warranty-claim-resolution-error"
            data-error-code={errorCode ?? undefined}
          >
            {errorMessage}
          </div>
        )}
        <div style={FIELD_ROW}>
          <div>
            <div style={LABEL}>Resolution</div>
            <select
              name="resolution"
              value={values.resolution}
              onChange={setField('resolution')}
              style={INPUT}
              required
              data-testid="warranty-claim-resolution-select"
            >
              <option value="">Select…</option>
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={LABEL}>Resolved at</div>
            <input
              type="date"
              name="resolved_at"
              value={values.resolved_at}
              onChange={setField('resolved_at')}
              style={INPUT}
              data-testid="warranty-claim-resolved-at"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={LABEL}>Resolution evidence (Drive file ID)</div>
            <input
              name="resolution_evidence_drive_id"
              value={values.resolution_evidence_drive_id}
              onChange={setField('resolution_evidence_drive_id')}
              style={INPUT}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <a
            href={letterHref}
            target="_blank"
            rel="noreferrer"
            style={BUTTON_SECONDARY}
            data-testid="warranty-claim-letter-link"
          >
            Download warranty letter
          </a>
          <button
            type="submit"
            disabled={submitting}
            style={submitting ? BUTTON_DISABLED : BUTTON}
            data-testid="warranty-claim-resolution-submit"
          >
            {submitting ? 'Saving…' : 'Mark resolved'}
          </button>
        </div>
      </form>

      {claim.resolution && (
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: '#f0fdfa', border: '1px solid #0f766e22',
        }} data-testid="warranty-claim-existing-resolution">
          <div style={LABEL}>Existing resolution</div>
          <div style={VALUE}>
            {RESOLUTION_LABEL[claim.resolution] ?? claim.resolution}
            {claim.resolved_at ? ` · ${claim.resolved_at}` : ''}
          </div>
          {claim.resolution_evidence_drive_id && (
            <div style={{ ...MONO, marginTop: 2 }}>{claim.resolution_evidence_drive_id}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function buildResolutionPayload(values: ResolutionValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    resolution: values.resolution,
    resolved_at: (values.resolved_at || todayIso()),
  };
  if (values.resolution_evidence_drive_id.trim()) {
    payload.resolution_evidence_drive_id = values.resolution_evidence_drive_id.trim();
  }
  return payload;
}

export default function WarrantyClaimDetail({
  claim,
  onResolved,
}: {
  claim: WarrantyClaimRow;
  onResolved?: (claimId: string) => void;
}) {
  const initial = useMemo<ResolutionValues>(() => ({
    resolution: claim.resolution ?? '',
    resolution_evidence_drive_id: claim.resolution_evidence_drive_id ?? '',
    resolved_at: claim.resolved_at ? claim.resolved_at.slice(0, 10) : '',
  }), [claim]);

  const [values, setValues] = useState<ResolutionValues>(initial);
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
        body: JSON.stringify(buildResolutionPayload(values)),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status !== 200 || !body.ok) {
        setErrorMessage(typeof body.error === 'string' ? body.error : 'Failed to mark resolved');
        setErrorCode(typeof body.code === 'string' ? body.code : null);
        return;
      }
      onResolved?.(claim.claim_id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setErrorCode(null);
    } finally {
      setSubmitting(false);
    }
  };

  const letterHref = `/api/closeout/warranties/${encodeURIComponent(claim.warranty_id)}/warranty-letter`;

  return (
    <DetailView
      claim={claim}
      values={values}
      submitting={submitting}
      errorMessage={errorMessage}
      errorCode={errorCode}
      onChange={setValues}
      onSubmit={handleSubmit}
      letterHref={letterHref}
    />
  );
}
