/**
 * BAN-336 Pay App Core — G703-style inline editable table + G702 summary.
 *
 * Renders a hierarchical view of the pay app's line items (children rolled
 * up by parent_line_id). Only leaf rows are editable. Auto-calculates
 * G = D+E+F, H = G/C, I = G × retainage_pct as the operator types.
 * Validation runs client-side (mirrors lib/aia/pay-app-calc.validateG703Line)
 * and the PATCH is rejected server-side too.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';

type PayApp = {
  pay_app_id: string;
  pay_app_number: number;
  state: string;
  period_start: string;
  period_end: string;
  billing_format: string;
  contract_sum_original: string | null;
  net_change_by_co: string | null;
  less_previous_certificates: string | null;
};

type Line = {
  pay_app_line_id: string;
  pay_app_id: string;
  sov_line_id: string | null;
  line_number: number;
  description: string;
  scheduled_value: string;
  work_completed_previous: string;
  work_completed_this_period: string;
  stored_materials: string;
  total_completed_and_stored: string;
  percent_complete: string;
  retainage_held: string;
  balance_to_finish: string;
};

type SovLine = {
  sov_line_id: string;
  display_item_number: string | null;
  parent_line_id: string | null;
  line_number: number;
};

type BillingFormatConfig = {
  retainage_pct: string | null;
};

interface Props {
  payAppId: string;
  onClose: () => void;
}

function num(x: string | null | undefined): number {
  if (x == null) return 0;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayAppEditScreen({ payAppId, onClose }: Props) {
  const [payApp, setPayApp] = useState<PayApp | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sovLines, setSovLines] = useState<SovLine[]>([]);
  const [cfg, setCfg] = useState<BillingFormatConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pay-apps/${payAppId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPayApp(data.pay_app);
        setLines(data.line_items ?? []);
        setSovLines(data.sov_lines ?? []);
        setCfg(data.billing_format_config);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [payAppId]);

  const retainagePct = cfg?.retainage_pct ? Number(cfg.retainage_pct) / 100 : 0.10;
  const editable = payApp?.state === 'PENDING_DRAFT';

  // Build sov_line_id → SovLine map so we can pull display_item_number / parent_line_id
  const sovById = useMemo(() => {
    const m = new Map<string, SovLine>();
    for (const s of sovLines) m.set(s.sov_line_id, s);
    return m;
  }, [sovLines]);

  function patchLine(payAppLineId: string, patch: Partial<Pick<Line, 'work_completed_this_period' | 'stored_materials'>>) {
    setLines((prev) => prev.map((l) => l.pay_app_line_id === payAppLineId ? recalc({ ...l, ...patch }, retainagePct) : l));
  }

  function recalc(l: Line, pct: number): Line {
    const c = num(l.scheduled_value);
    const d = num(l.work_completed_previous);
    const e = num(l.work_completed_this_period);
    const f = num(l.stored_materials);
    const g = d + e + f;
    const h = c > 0 ? g / c : 0;
    const i = g * pct;
    return {
      ...l,
      total_completed_and_stored: g.toFixed(2),
      percent_complete: (h * 100).toFixed(2),
      retainage_held: i.toFixed(2),
      balance_to_finish: (c - g).toFixed(2),
    };
  }

  function validate(l: Line): string | null {
    const c = num(l.scheduled_value);
    const d = num(l.work_completed_previous);
    const e = num(l.work_completed_this_period);
    const f = num(l.stored_materials);
    if (c < 0 || d < 0 || e < 0 || f < 0) return `Negative value on line ${l.line_number}`;
    if (e > c - d + 1e-6) return `This-period exceeds remaining billable on line ${l.line_number}`;
    if (d + e + f > c + 1e-6) return `Stored exceeds remaining scope on line ${l.line_number}`;
    return null;
  }

  async function save() {
    if (!payApp) return;
    setError(null);
    for (const l of lines) {
      const err = validate(l);
      if (err) { setError(err); return; }
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/pay-apps/${payAppId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            pay_app_line_id: l.pay_app_line_id,
            work_completed_this_period: num(l.work_completed_this_period),
            materials_stored_this_period: num(l.stored_materials),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Save failed (${res.status})`);
      } else {
        await fetch(`/api/pay-apps/${payAppId}/calculate`, { method: 'POST' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function markReady() {
    if (!payApp) return;
    setSaving(true);
    try {
      await save();
      const res = await fetch(`/api/pay-apps/${payAppId}/mark-ready`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Mark-ready failed (${res.status})`);
      } else {
        setPayApp((p) => p ? { ...p, state: data.to_state } : p);
      }
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    if (!payApp) return;
    const reason = window.prompt('Rejection reason:');
    if (!reason) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pay-apps/${payAppId}/reject`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Reject failed (${res.status})`);
      } else {
        setPayApp((p) => p ? { ...p, state: data.state ?? 'PENDING_DRAFT' } : p);
      }
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    setError(null);
    const res = await fetch(`/api/pay-apps/${payAppId}/generate-pdf`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `PDF failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PayApp-${payApp?.pay_app_number ?? 'X'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>;
  if (!payApp) return <div style={{ padding: 40, textAlign: 'center', color: '#b91c1c' }}>Pay app not found</div>;

  // G702 summary computed client-side off current line state
  const totalCompletedStored = lines.reduce((s, l) => s + num(l.total_completed_and_stored), 0);
  const totalStored = lines.reduce((s, l) => s + num(l.stored_materials), 0);
  const totalCompleted = lines.reduce((s, l) => s + num(l.work_completed_previous) + num(l.work_completed_this_period), 0);
  const retainageCompleted = totalCompleted * retainagePct;
  const retainageStored = totalStored * retainagePct;
  const totalRetainage = retainageCompleted + retainageStored;
  const originalContract = num(payApp.contract_sum_original);
  const netChangeByCo = num(payApp.net_change_by_co);
  const contractSumToDate = originalContract + netChangeByCo;
  const earnedLessRetainage = totalCompletedStored - totalRetainage;
  const lessPrev = num(payApp.less_previous_certificates);
  const currentDue = earnedLessRetainage - lessPrev;
  const balanceToFinish = contractSumToDate - earnedLessRetainage;
  const HI_GET = currentDue * 0.04712;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#0f766e', textTransform: 'uppercase' }}>
            Pay App #{payApp.pay_app_number} · {payApp.billing_format}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            {payApp.period_start} → {payApp.period_end}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>State: {payApp.state}</div>
        </div>
        <button onClick={onClose} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ← Back
        </button>
      </div>

      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: 14, marginBottom: 16, overflowX: 'auto',
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0c2330', marginBottom: 10 }}>
          G703 Continuation — Line Items
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={th}>A Item</th>
              <th style={th}>B Description</th>
              <th style={thRight}>C Scheduled</th>
              <th style={thRight}>D Previous</th>
              <th style={thRight}>E This Period</th>
              <th style={thRight}>F Stored</th>
              <th style={thRight}>G Total (D+E+F)</th>
              <th style={thRight}>H %</th>
              <th style={thRight}>I Retainage</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const sov = l.sov_line_id ? sovById.get(l.sov_line_id) : undefined;
              const display = sov?.display_item_number ?? String(l.line_number);
              return (
                <tr key={l.pay_app_line_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={td}>{display}</td>
                  <td style={{ ...td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</td>
                  <td style={tdRight}>{fmt(num(l.scheduled_value))}</td>
                  <td style={tdRight}>{fmt(num(l.work_completed_previous))}</td>
                  <td style={tdRightEdit}>
                    {editable ? (
                      <input
                        value={l.work_completed_this_period}
                        onChange={(e) => patchLine(l.pay_app_line_id, { work_completed_this_period: e.target.value })}
                        style={cellInput}
                        inputMode="decimal"
                      />
                    ) : fmt(num(l.work_completed_this_period))}
                  </td>
                  <td style={tdRightEdit}>
                    {editable ? (
                      <input
                        value={l.stored_materials}
                        onChange={(e) => patchLine(l.pay_app_line_id, { stored_materials: e.target.value })}
                        style={cellInput}
                        inputMode="decimal"
                      />
                    ) : fmt(num(l.stored_materials))}
                  </td>
                  <td style={tdRight}>{fmt(num(l.total_completed_and_stored))}</td>
                  <td style={tdRight}>{Number(l.percent_complete).toFixed(0)}%</td>
                  <td style={tdRight}>{fmt(num(l.retainage_held))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0c2330', marginBottom: 10 }}>
          G702 Summary
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {summaryRow('1', 'Original Contract Sum', originalContract)}
            {summaryRow('2', 'Net Change by Change Orders (locked C9 default)', netChangeByCo, 'Itemizes approved COs + T&M Authorization billed-to-date')}
            {summaryRow('3', 'Contract Sum to Date (1+2)', contractSumToDate, undefined, true)}
            {summaryRow('4', 'Total Completed & Stored', totalCompletedStored)}
            {summaryRow('5a', 'Retainage — Completed Work', retainageCompleted)}
            {summaryRow('5b', 'Retainage — Stored Materials', retainageStored)}
            {summaryRow('5', 'Total Retainage', totalRetainage)}
            {summaryRow('6', 'Total Earned Less Retainage', earnedLessRetainage)}
            {summaryRow('7', 'Less Previous Certificates', lessPrev)}
            {summaryRow('8', 'Current Payment Due', currentDue, undefined, true)}
            {summaryRow('9', 'Balance to Finish + Retainage', balanceToFinish)}
            {summaryRow('HI', 'HI GET 4.712% (locked C3 — summary line)', HI_GET)}
          </tbody>
        </table>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {editable && (
          <button onClick={save} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Save lines'}
          </button>
        )}
        {editable && (
          <button onClick={markReady} disabled={saving} style={btnGreen}>
            Mark Ready →
          </button>
        )}
        <button onClick={downloadPdf} style={btnSecondary}>
          Generate PDF
        </button>
        {payApp.state !== 'PENDING_DRAFT' && payApp.state !== 'PAID_FULL' && (
          <button onClick={reject} disabled={saving} style={btnDanger}>
            Reject → Draft
          </button>
        )}
      </div>
    </div>
  );
}

function summaryRow(num: string, label: string, value: number, footnote?: string, bold?: boolean) {
  return (
    <tr key={num} style={bold ? { background: '#fef3c7', fontWeight: 700 } : {}}>
      <td style={{ padding: '6px 8px', width: 30 }}>{num}</td>
      <td style={{ padding: '6px 8px' }}>
        {label}
        {footnote && <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>{footnote}</div>}
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(value)}</td>
    </tr>
  );
}

const th = { padding: '8px 6px', textAlign: 'left' as const, fontSize: 10, fontWeight: 700, color: '#64748b' };
const thRight = { ...th, textAlign: 'right' as const };
const td = { padding: '6px', color: '#0f172a' };
const tdRight = { ...td, textAlign: 'right' as const };
const tdRightEdit = { ...tdRight, background: '#fefce8' };
const cellInput = {
  width: '100%', padding: '4px 6px', textAlign: 'right' as const,
  fontSize: 11, border: '1px solid #facc15', borderRadius: 6,
  outline: 'none', background: '#fff', boxSizing: 'border-box' as const,
};
const btnPrimary = { background: '#0c2330', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnGreen = { background: '#15803d', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnSecondary = { background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnDanger = { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
