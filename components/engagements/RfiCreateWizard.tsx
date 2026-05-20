'use client';
/**
 * BAN-341 PM-V1.0-B — Create-RFI wizard.
 *
 * Per PM Trunk v1.0 §6.2: required fields are subject (max 120),
 * question, submitted_to. Optional: reason_for_rfi, cost/schedule impact
 * estimate, required_response_by_date. The rfi_number is auto-assembled
 * server-side from the project kID and a per-project sequence.
 */

import { useState } from 'react';

const REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '(no reason)' },
  { value: 'SCOPE_CLARIFICATION', label: 'Scope clarification' },
  { value: 'DRAWING_CONFLICT', label: 'Drawing conflict' },
  { value: 'SPEC_AMBIGUITY', label: 'Spec ambiguity' },
  { value: 'FIELD_CONDITION', label: 'Field condition' },
  { value: 'DESIGN_INTENT', label: 'Design intent' },
  { value: 'OTHER', label: 'Other' },
];

const SUBJECT_MAX = 120;

export default function RfiCreateWizard({ kID, onClose, onCreated }: {
  kID: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [submittedTo, setSubmittedTo] = useState<'GC' | 'ARCHITECT' | 'ENGINEER' | 'OWNER'>('GC');
  const [reason, setReason] = useState('');
  const [requiredResponseBy, setRequiredResponseBy] = useState('');
  const [impactAnticipated, setImpactAnticipated] = useState(false);
  const [costImpactEstimate, setCostImpactEstimate] = useState('');
  const [scheduleImpactDays, setScheduleImpactDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subjectInvalid = subject.length > SUBJECT_MAX;
  const canSubmit = subject.trim().length > 0
    && !subjectInvalid
    && question.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!canSubmit) {
      setErr('Subject and question are required (subject ≤ 120 chars)');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/rfis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_kid: kID,
          subject: subject.trim(),
          question: question.trim(),
          submitted_to: submittedTo,
          reason_for_rfi: reason || null,
          required_response_by_date: requiredResponseBy || null,
          cost_or_schedule_impact_anticipated: impactAnticipated,
          cost_impact_estimate: costImpactEstimate ? Number(costImpactEstimate) : null,
          schedule_impact_days: scheduleImpactDays ? Number(scheduleImpactDays) : null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto' }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 14, padding: 24, maxWidth: 640, width: '92%', margin: '40px 0', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase' }}>{kID}</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-ink-primary)', margin: '4px 0 0' }}>New RFI</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--bos-color-ink-tertiary)', cursor: 'pointer' }}>×</button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          <span style={labelStyle}>
            Subject <span style={{ color: subjectInvalid ? 'var(--color-red-700)' : 'var(--bos-color-ink-tertiary)', marginLeft: 6, fontWeight: 600 }}>
              {subject.length}/{SUBJECT_MAX}
            </span>
          </span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Conflict between A3.2 and S2.1 storefront opening"
            style={{ ...inputStyle, borderColor: subjectInvalid ? '#fecaca' : 'var(--color-surface-border)' }}
            maxLength={SUBJECT_MAX + 20}
          />
          {subjectInvalid && <span style={errStyle}>Subject must be {SUBJECT_MAX} characters or fewer</span>}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          <span style={labelStyle}>Question</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="The opening dimensions on A3.2 differ from S2.1. Please confirm which is governing for shop drawings."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Submitted To</span>
            <select value={submittedTo} onChange={(e) => setSubmittedTo(e.target.value as typeof submittedTo)} style={inputStyle}>
              <option value="GC">GC</option>
              <option value="ARCHITECT">Architect</option>
              <option value="ENGINEER">Engineer</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Reason for RFI</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
              {REASON_OPTIONS.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
            </select>
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          <span style={labelStyle}>Required Response By</span>
          <input type="date" value={requiredResponseBy} onChange={(e) => setRequiredResponseBy(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--bos-color-ink-tertiary)', fontWeight: 700 }}>
          <input type="checkbox" checked={impactAnticipated} onChange={(e) => setImpactAnticipated(e.target.checked)} />
          Cost or schedule impact anticipated
        </label>

        {impactAnticipated && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={labelStyle}>Cost Impact Estimate ($)</span>
              <input
                value={costImpactEstimate}
                onChange={(e) => setCostImpactEstimate(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="(optional)"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={labelStyle}>Schedule Impact (days)</span>
              <input
                value={scheduleImpactDays}
                onChange={(e) => setScheduleImpactDays(e.target.value.replace(/[^0-9-]/g, ''))}
                placeholder="(optional)"
                style={inputStyle}
              />
            </label>
          </div>
        )}

        {err && (
          <div style={{ color: 'var(--color-red-700)', background: 'var(--color-red-50)', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', color: 'var(--bos-color-ink-tertiary)', fontWeight: 700, fontSize: 12, cursor: busy ? 'default' : 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !canSubmit}
            style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: (busy || !canSubmit) ? 'var(--bos-color-ink-tertiary)' : 'var(--bos-color-brand-primary-deep)', color: 'white', fontWeight: 800, fontSize: 12, cursor: (busy || !canSubmit) ? 'default' : 'pointer' }}>
            {busy ? 'Creating…' : 'Create RFI'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-surface-border)',
  fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

const errStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-red-700)', fontWeight: 700,
};
