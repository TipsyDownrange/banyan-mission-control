/**
 * BAN-338 Pay Apps v2c — GC Required Docs Checklist setup/edit form.
 *
 * Per-engagement sticky config. Loads via /api/gc-required-docs/by-kid/[kid]
 * and PATCHes the same. INFORMATIONAL ONLY — the checklist surfacing in
 * the pay-app create flow renders status but never blocks submission.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

interface Checklist {
  checklist_id?: string;
  identified_phase?: string | null;
  requires_conditional_progress_waiver_from_kula?: boolean;
  requires_unconditional_progress_waiver_from_kula?: boolean;
  requires_conditional_final_waiver_from_kula?: boolean;
  requires_unconditional_final_waiver_from_kula?: boolean;
  requires_external_waivers_from_manufacturers?: boolean;
  requires_joint_check_agreement?: boolean;
  requires_certificate_of_vendor_compliance?: boolean;
  requires_glaziers_union_lien_clearance?: boolean;
  requires_certified_payroll?: boolean;
  requires_safety_documentation?: boolean;
}

export default function GCRequiredDocsChecklist({ kID }: { kID: string }) {
  const [data, setData] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    if (!kID) return;
    setLoading(true);
    fetch(`/api/gc-required-docs/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((payload) => {
        setData(payload.checklist ?? {});
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [kID]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function setField<K extends keyof Checklist>(key: K, value: Checklist[K]) {
    setData((prev) => ({ ...(prev ?? {}), [key]: value }));
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    const res = await fetch(`/api/gc-required-docs/by-kid/${encodeURIComponent(kID)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) refresh();
  }

  if (loading) return <div style={{ padding: 16, fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>Loading checklist…</div>;
  if (error) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 12 }}>
        Could not load GC required docs: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div style={{
      background: 'white', borderRadius: 14, border: '1px solid var(--color-surface-border)', padding: 18,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-ink-primary)' }}>GC-Required Docs Checklist</div>
        <div style={{ fontSize: 10, color: 'var(--bos-color-ink-tertiary)' }}>INFORMATIONAL ONLY — does not block submission</div>
      </div>
      <div>
        <label style={labelStyle}>Identified phase</label>
        <select
          value={data.identified_phase ?? ''}
          onChange={(e) => setField('identified_phase', e.target.value || null)}
          style={selectStyle}
        >
          <option value="">— select —</option>
          <option value="ESTIMATING_SCOPE_REVIEW">Estimating scope review</option>
          <option value="POST_HANDOFF_REVIEW">Post-handoff review</option>
          <option value="MID_PROJECT_AMENDMENT">Mid-project amendment</option>
        </select>
      </div>

      <FieldGroup title="Waivers required from Kula">
        <Toggle label="Conditional progress" checked={!!data.requires_conditional_progress_waiver_from_kula} onChange={(v) => setField('requires_conditional_progress_waiver_from_kula', v)} />
        <Toggle label="Unconditional progress" checked={!!data.requires_unconditional_progress_waiver_from_kula} onChange={(v) => setField('requires_unconditional_progress_waiver_from_kula', v)} />
        <Toggle label="Conditional final" checked={!!data.requires_conditional_final_waiver_from_kula} onChange={(v) => setField('requires_conditional_final_waiver_from_kula', v)} />
        <Toggle label="Unconditional final" checked={!!data.requires_unconditional_final_waiver_from_kula} onChange={(v) => setField('requires_unconditional_final_waiver_from_kula', v)} />
      </FieldGroup>

      <FieldGroup title="Other requirements">
        <Toggle label="External waivers from manufacturers" checked={!!data.requires_external_waivers_from_manufacturers} onChange={(v) => setField('requires_external_waivers_from_manufacturers', v)} />
        <Toggle label="Joint check agreement" checked={!!data.requires_joint_check_agreement} onChange={(v) => setField('requires_joint_check_agreement', v)} />
        <Toggle label="Certificate of vendor compliance" checked={!!data.requires_certificate_of_vendor_compliance} onChange={(v) => setField('requires_certificate_of_vendor_compliance', v)} />
        <Toggle label="Glaziers union lien clearance" checked={!!data.requires_glaziers_union_lien_clearance} onChange={(v) => setField('requires_glaziers_union_lien_clearance', v)} />
        <Toggle label="Certified payroll" checked={!!data.requires_certified_payroll} onChange={(v) => setField('requires_certified_payroll', v)} />
        <Toggle label="Safety documentation" checked={!!data.requires_safety_documentation} onChange={(v) => setField('requires_safety_documentation', v)} />
      </FieldGroup>

      <button
        onClick={save}
        disabled={saving}
        style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: '#0c2330', color: 'white', border: 'none', cursor: 'pointer', alignSelf: 'flex-start',
        }}
      >
        {saving ? 'Saving…' : 'Save Checklist'}
      </button>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{children}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: 8,
      background: 'var(--color-surface)', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4,
};
const selectStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12,
};
