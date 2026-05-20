'use client';
/**
 * BAN-340 PM-V1.0-A — Create-submittal wizard.
 *
 * Per PM Trunk v1.0 §5: PM supplies the CSI coordinate fields, and the
 * submittal_number is auto-assembled server-side from those plus the
 * project kID. Client-side validation mirrors the server / DB CHECK
 * constraints so the user can correct format errors before submitting.
 */

import { useMemo, useState } from 'react';
import {
  CSI_SPEC_SECTION_RE,
  CSI_SUBSECTION_RE,
  CSI_SUB_SUBSECTION_RE,
} from '@/lib/pm/submittals/csi';

const COMMON_DIVISIONS: Array<{ code: string; label: string }> = [
  { code: '03', label: '03 — Concrete' },
  { code: '04', label: '04 — Masonry' },
  { code: '05', label: '05 — Metals' },
  { code: '06', label: '06 — Wood, Plastics, Composites' },
  { code: '07', label: '07 — Thermal & Moisture Protection' },
  { code: '08', label: '08 — Openings (Doors, Windows, Glass)' },
  { code: '09', label: '09 — Finishes' },
  { code: '10', label: '10 — Specialties' },
  { code: '11', label: '11 — Equipment' },
  { code: '14', label: '14 — Conveying Equipment' },
  { code: '21', label: '21 — Fire Suppression' },
  { code: '22', label: '22 — Plumbing' },
  { code: '23', label: '23 — HVAC' },
  { code: '26', label: '26 — Electrical' },
];

export default function SubmittalCreateWizard({ kID, onClose, onCreated }: {
  kID: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [csiDivision, setCsiDivision] = useState('08');
  const [csiSpec, setCsiSpec] = useState('');
  const [csiSub, setCsiSub] = useState('');
  const [csiSubSub, setCsiSubSub] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'ACTION' | 'PHYSICAL' | 'CLOSEOUT'>('ACTION');
  const [requirementsText, setRequirementsText] = useState('');
  const [requiredQuantity, setRequiredQuantity] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [specDocRef, setSpecDocRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!CSI_SPEC_SECTION_RE.test(csiSpec)) errs.csi_spec_section = 'Must be 5-digit (08410) or 6-digit (084113)';
    if (!CSI_SUBSECTION_RE.test(csiSub)) errs.csi_subsection = 'Must be N.N (e.g. 1.3)';
    if (!CSI_SUB_SUBSECTION_RE.test(csiSubSub)) errs.csi_sub_subsection = 'Must be A-Z or 1-9';
    return errs;
  }, [csiSpec, csiSub, csiSubSub]);

  const previewNumber = useMemo(() => {
    if (Object.keys(validationErrors).length > 0) return null;
    return `${kID}-SUB-${csiSpec}-${csiSub}-${csiSubSub}`;
  }, [validationErrors, kID, csiSpec, csiSub, csiSubSub]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (Object.keys(validationErrors).length > 0) {
      setErr('Fix CSI validation errors before submitting');
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/submittals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagement_kid: kID,
          csi_division: csiDivision || null,
          csi_spec_section: csiSpec,
          csi_subsection: csiSub,
          csi_sub_subsection: csiSubSub,
          description: description || null,
          submittal_type: type,
          requirements_text: requirementsText || null,
          required_quantity: requiredQuantity ? Number(requiredQuantity) : null,
          required_by_date: requiredByDate || null,
          spec_document_ref: specDocRef || null,
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
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-ink-primary)', margin: '4px 0 0' }}>New Submittal</h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: 'var(--bos-color-ink-tertiary)', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>CSI Division</span>
            <select value={csiDivision} onChange={(e) => setCsiDivision(e.target.value)} style={inputStyle}>
              {COMMON_DIVISIONS.map((d) => (<option key={d.code} value={d.code}>{d.label}</option>))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} style={inputStyle}>
              <option value="ACTION">Action (review &amp; approval)</option>
              <option value="PHYSICAL">Physical (sample / mock-up)</option>
              <option value="CLOSEOUT">Closeout (warranty / O&amp;M)</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spec Section</span>
            <input value={csiSpec} onChange={(e) => setCsiSpec(e.target.value)} placeholder="08410" style={{ ...inputStyle, borderColor: validationErrors.csi_spec_section ? '#fecaca' : 'var(--color-surface-border)' }} />
            {validationErrors.csi_spec_section && <span style={errStyle}>{validationErrors.csi_spec_section}</span>}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subsection</span>
            <input value={csiSub} onChange={(e) => setCsiSub(e.target.value)} placeholder="1.3" style={{ ...inputStyle, borderColor: validationErrors.csi_subsection ? '#fecaca' : 'var(--color-surface-border)' }} />
            {validationErrors.csi_subsection && <span style={errStyle}>{validationErrors.csi_subsection}</span>}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sub-subsection</span>
            <input value={csiSubSub} onChange={(e) => setCsiSubSub(e.target.value.toUpperCase())} placeholder="A" style={{ ...inputStyle, borderColor: validationErrors.csi_sub_subsection ? '#fecaca' : 'var(--color-surface-border)' }} maxLength={1} />
            {validationErrors.csi_sub_subsection && <span style={errStyle}>{validationErrors.csi_sub_subsection}</span>}
          </label>
        </div>

        {previewNumber && (
          <div style={{ background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', borderRadius: 10, padding: '8px 12px', fontFamily: 'monospace', fontSize: 13, color: 'var(--bos-color-brand-primary-deep)', fontWeight: 700, marginBottom: 12 }}>
            {previewNumber}
          </div>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Storefront door hardware schedule" style={inputStyle} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Requirements (optional)</span>
          <textarea value={requirementsText} onChange={(e) => setRequirementsText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Required Quantity</span>
            <input value={requiredQuantity} onChange={(e) => setRequiredQuantity(e.target.value.replace(/[^0-9]/g, ''))} placeholder="(optional)" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Required By Date</span>
            <input type="date" value={requiredByDate} onChange={(e) => setRequiredByDate(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spec Drive file ID (optional)</span>
          <input value={specDocRef} onChange={(e) => setSpecDocRef(e.target.value)} placeholder="1AbCdEfG..." style={inputStyle} />
        </label>

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
          <button type="submit" disabled={busy || Object.keys(validationErrors).length > 0}
            style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: busy ? 'var(--bos-color-ink-tertiary)' : 'var(--bos-color-brand-primary-deep)', color: 'white', fontWeight: 800, fontSize: 12, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? 'Creating…' : 'Create Submittal'}
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

const errStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-red-700)', fontWeight: 700,
};
