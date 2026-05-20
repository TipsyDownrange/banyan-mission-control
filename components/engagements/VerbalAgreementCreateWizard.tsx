'use client';
/**
 * BAN-342 PM-V1.0-C — Create Verbal Agreement wizard.
 */

import { useState } from 'react';

const AGREEMENT_TYPES = [
  ['SCOPE_CHANGE', 'Scope change'],
  ['SCHEDULE_AGREEMENT', 'Schedule agreement'],
  ['T_M_AUTHORIZATION', 'T&M authorization'],
  ['DESIGN_CLARIFICATION', 'Design clarification'],
  ['PAYMENT_TERM', 'Payment term'],
  ['DELIVERY_COMMITMENT', 'Delivery commitment'],
  ['OTHER', 'Other'],
] as const;

const SUBJECT_MAX = 200;

export default function VerbalAgreementCreateWizard({ kID, onClose, onCreated }: {
  kID: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [externalPartyOrg, setExternalPartyOrg] = useState('');
  const [agreementSummary, setAgreementSummary] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [agreementType, setAgreementType] = useState('OTHER');
  const [showOptional, setShowOptional] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [costImpactEstimate, setCostImpactEstimate] = useState('');
  const [scheduleImpactDays, setScheduleImpactDays] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subjectInvalid = subject.length > SUBJECT_MAX;
  const canSubmit = subject.trim().length > 0
    && !subjectInvalid
    && externalPartyOrg.trim().length > 0
    && agreementSummary.trim().length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!canSubmit) {
      setErr('Subject, external party, and agreement summary are required.');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/verbal-agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_kid: kID,
          subject: subject.trim(),
          external_party_org: externalPartyOrg.trim(),
          agreement_summary: agreementSummary.trim(),
          occurred_at: occurredAt || null,
          agreement_type: agreementType,
          external_party_contact_name: contactName || null,
          external_party_contact_role: contactRole || null,
          external_party_contact_email: contactEmail || null,
          external_party_contact_phone: contactPhone || null,
          cost_impact_estimate: costImpactEstimate ? Number(costImpactEstimate) : null,
          schedule_impact_days: scheduleImpactDays ? Number(scheduleImpactDays) : null,
          context_or_circumstances: context || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
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
        style={{ background: 'white', borderRadius: 14, padding: 24, maxWidth: 700, width: '92%', margin: '40px 0', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--bos-color-brand-primary-deep)', textTransform: 'uppercase' }}>{kID}</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-ink-primary)', margin: '4px 0 0' }}>New Verbal Agreement</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--bos-color-ink-tertiary)', cursor: 'pointer' }}>x</button>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>Subject <span style={{ color: subjectInvalid ? '#b91c1c' : 'var(--bos-color-ink-tertiary)', marginLeft: 6 }}>{subject.length}/{SUBJECT_MAX}</span></span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...inputStyle, borderColor: subjectInvalid ? '#fecaca' : 'var(--color-surface-border)' }} maxLength={SUBJECT_MAX + 20} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={fieldStyle}>
            <span style={labelStyle}>External Party</span>
            <input value={externalPartyOrg} onChange={(e) => setExternalPartyOrg(e.target.value)} placeholder="GC or architect firm" style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={labelStyle}>Agreement Type</span>
            <select value={agreementType} onChange={(e) => setAgreementType(e.target.value)} style={inputStyle}>
              {AGREEMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>Agreement Summary</span>
          <textarea value={agreementSummary} onChange={(e) => setAgreementSummary(e.target.value)} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>

        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          style={{ marginBottom: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-surface-border)', background: '#f8fafc', color: '#475569', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
        >
          {showOptional ? 'Hide optional fields' : 'Optional fields'}
        </button>

        {showOptional && (
          <div style={{ border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: 12, marginBottom: 12, background: '#f8fafc' }}>
            <label style={fieldStyle}>
              <span style={labelStyle}>Occurred At</span>
              <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} style={inputStyle} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={fieldStyle}><span style={labelStyle}>Contact Name</span><input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} /></label>
              <label style={fieldStyle}><span style={labelStyle}>Contact Role</span><input value={contactRole} onChange={(e) => setContactRole(e.target.value)} style={inputStyle} /></label>
              <label style={fieldStyle}><span style={labelStyle}>Contact Email</span><input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} /></label>
              <label style={fieldStyle}><span style={labelStyle}>Contact Phone</span><input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={inputStyle} /></label>
              <label style={fieldStyle}><span style={labelStyle}>Cost Impact Estimate</span><input value={costImpactEstimate} onChange={(e) => setCostImpactEstimate(e.target.value.replace(/[^0-9.]/g, ''))} style={inputStyle} /></label>
              <label style={fieldStyle}><span style={labelStyle}>Schedule Impact Days</span><input value={scheduleImpactDays} onChange={(e) => setScheduleImpactDays(e.target.value.replace(/[^0-9-]/g, ''))} style={inputStyle} /></label>
            </div>
            <label style={fieldStyle}>
              <span style={labelStyle}>Context</span>
              <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
          </div>
        )}

        {err && <div style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={secondaryButtonStyle}>Cancel</button>
          <button type="submit" disabled={busy || !canSubmit} style={{ ...primaryButtonStyle, background: (busy || !canSubmit) ? 'var(--bos-color-ink-tertiary)' : 'var(--bos-color-brand-primary-deep)' }}>
            {busy ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 };
const inputStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' };
const secondaryButtonStyle: React.CSSProperties = { padding: '8px 16px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const primaryButtonStyle: React.CSSProperties = { padding: '8px 18px', borderRadius: 10, border: 'none', color: 'white', fontWeight: 800, fontSize: 12, cursor: 'pointer' };
