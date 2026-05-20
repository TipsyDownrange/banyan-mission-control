'use client';
/**
 * BAN-342 PM-V1.0-C — Verbal Agreement Log surface.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import VerbalAgreementCreateWizard from './VerbalAgreementCreateWizard';

type VerbalAgreementRow = {
  verbal_agreement_id: string;
  occurred_at: string;
  subject: string;
  external_party_org: string;
  external_party_contact_name: string | null;
  agreement_type: string;
  cost_impact_estimate: string | null;
  schedule_impact_days: number | null;
  agreement_summary: string;
  audio_recording_drive_id: string | null;
  photo_documentation_drive_ids: string[];
  written_followup_email_drive_id: string | null;
  followup_email_sent: boolean;
  formal_documentation_generated: boolean;
  formal_documentation_ref: string | null;
  formal_documentation_type: string | null;
  status: string;
};

type ApiResponse = {
  kIDFound: boolean;
  items: VerbalAgreementRow[];
  summary: {
    total: number;
    by_status: Record<string, number>;
    followup_sent: number;
    formalized: number;
  };
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  LOGGED: { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-disabled)' },
  FOLLOWED_UP: { bg: '#eff6ff', color: '#1d4ed8' },
  FORMALIZED: { bg: 'var(--color-teal-50)', color: 'var(--bos-color-brand-primary-deep)' },
  DISPUTED: { bg: 'var(--color-red-50)', color: 'var(--color-red-700)' },
  RESOLVED: { bg: 'var(--color-surface)', color: 'var(--bos-color-ink-tertiary)' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.LOGGED;
  return <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, background: s.bg, color: s.color, border: `1px solid ${s.color}22`, whiteSpace: 'nowrap' }}>{status.replace(/_/g, ' ')}</span>;
}

function DocChip({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  const color = active ? 'var(--bos-color-brand-primary-deep)' : 'var(--bos-color-ink-tertiary)';
  return (
    <button
      type="button"
      disabled={!active}
      title={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: active ? `${color}12` : '#f1f5f9', color, border: `1px solid ${color}22`, cursor: active ? 'pointer' : 'default' }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value: string | null): string {
  if (!value) return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function VerbalAgreementsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [followupOnly, setFollowupOnly] = useState(false);
  const [formalizedOnly, setFormalizedOnly] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/verbal-agreements/by-kid/${encodeURIComponent(kID)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kID]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const items = data?.items ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (status !== 'ALL' && it.status !== status) return false;
      if (type !== 'ALL' && it.agreement_type !== type) return false;
      if (followupOnly && !it.followup_email_sent) return false;
      if (formalizedOnly && !it.formal_documentation_generated) return false;
      if (q) {
        const hay = `${it.subject} ${it.external_party_org} ${it.external_party_contact_name ?? ''} ${it.agreement_summary}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, status, type, followupOnly, formalizedOnly]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>Loading verbal agreements...</div>;
  }
  if (err) {
    return <div style={{ padding: 24, color: 'var(--color-red-700)', background: 'var(--color-red-50)', borderRadius: 12, border: '1px solid #fecaca' }}>Failed to load verbal agreements: {err}</div>;
  }
  if (!data?.kIDFound) {
    return <div style={{ padding: 24, color: 'var(--bos-color-ink-disabled)', background: 'var(--color-surface)', borderRadius: 12, border: '1px solid var(--color-surface-border)' }}>Verbal Agreement Log requires this project to be migrated to Postgres.</div>;
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Total', data.summary.total],
          ['Followed Up', data.summary.followup_sent],
          ['Formalized', data.summary.formalized],
          ['Disputed', data.summary.by_status.DISPUTED ?? 0],
        ].map(([label, value]) => (
          <div key={label} style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--color-ink-primary)', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subject, party, summary..." style={toolbarInputStyle} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={toolbarSelectStyle}>
          <option value="ALL">All statuses</option>
          {['LOGGED', 'FOLLOWED_UP', 'FORMALIZED', 'DISPUTED', 'RESOLVED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={toolbarSelectStyle}>
          <option value="ALL">All types</option>
          {['SCOPE_CHANGE', 'SCHEDULE_AGREEMENT', 'T_M_AUTHORIZATION', 'DESIGN_CLARIFICATION', 'PAYMENT_TERM', 'DELIVERY_COMMITMENT', 'OTHER'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <label style={toggleStyle}><input type="checkbox" checked={followupOnly} onChange={(e) => setFollowupOnly(e.target.checked)} /> Follow-up sent</label>
        <label style={toggleStyle}><input type="checkbox" checked={formalizedOnly} onChange={(e) => setFormalizedOnly(e.target.checked)} /> Formalized</label>
        <button type="button" onClick={() => setShowWizard(true)} style={{ marginLeft: 'auto', padding: '8px 12px', borderRadius: 10, border: 'none', background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>+ New Agreement</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12 }}>No verbal agreements match the current filters.</div>
        ) : filtered.map((it) => (
          <div key={it.verbal_agreement_id} style={{ background: 'white', border: '1px solid var(--color-surface-border)', borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px minmax(160px, 1.4fr) minmax(140px, 1fr) 130px 90px 90px', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', fontWeight: 700 }}>{formatDate(it.occurred_at)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-ink-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.subject}</div>
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.agreement_summary}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-ink-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.external_party_org}</div>
                <div style={{ fontSize: 11, color: 'var(--bos-color-ink-tertiary)' }}>{it.external_party_contact_name || '-'}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-ink-tertiary)' }}>{it.agreement_type.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--color-ink-primary)' }}>{formatCurrency(it.cost_impact_estimate)}</div>
              <StatusPill status={it.status} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <DocChip icon="Email" label="Follow-up email" active={Boolean(it.written_followup_email_drive_id)} />
              <DocChip icon="Audio" label="Recording" active={Boolean(it.audio_recording_drive_id)} />
              <DocChip icon="Photos" label="Photos" active={(it.photo_documentation_drive_ids ?? []).length > 0} />
              <DocChip icon="Doc" label="Formalized doc" active={Boolean(it.formal_documentation_ref)} />
              <DocChip icon="+" label="Add evidence" active />
            </div>
          </div>
        ))}
      </div>

      {showWizard && (
        <VerbalAgreementCreateWizard
          kID={kID}
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            setShowWizard(false);
            fetchList();
          }}
        />
      )}
    </div>
  );
}

const toolbarInputStyle: React.CSSProperties = { flex: '1 1 260px', padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 13, outline: 'none', background: 'white' };
const toolbarSelectStyle: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--color-surface-border)', fontSize: 12, background: 'white' };
const toggleStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 9px', borderRadius: 10, border: '1px solid var(--color-surface-border)', background: 'white', fontSize: 12, color: 'var(--bos-color-ink-tertiary)', fontWeight: 700 };
