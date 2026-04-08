'use client';
import { useState, useEffect, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QuoteConfig = {
  config_id: string;
  job_id: string;
  config_name: string;
  version: string;
  status: string;
  created_at: string;
  created_by: string;
  total_amount: string;
  labor_json: string;
  materials_json: string;
  markup_pct: string;
  get_rate: string;
  overhead_method: string;
  breakdown_type: string;
  notes: string;
  quote_pdf_url: string;
  versions?: QuoteConfig[];
  versionCount?: number;
};

type BreakdownType = 'lump_sum' | 'per_floor' | 'per_sqft' | 'per_elevation' | 'per_unit';

type WORecord = {
  woNumber?: string;
  name?: string;
  address?: string;
  island?: string;
  contact?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  customerName?: string;
  description?: string;
  systemType?: string;
  email?: string;
  phone?: string;
};

type EstimateData = {
  aluminum?: Array<{ description?: string; amount: string }>;
  glass?: Array<{ description?: string; amount: string }>;
  misc?: Record<string, string>;
  miscExtra?: Array<{ description?: string; amount: string }>;
  other?: Record<string, string>;
  otherExtra?: Array<{ description?: string; amount: string }>;
  xModifier?: string;
  labor?: Array<{
    description: string;
    hours: string;
    rate: string;
    amount?: string;
    install_step_id?: string;
    custom?: boolean;
  }>;
  driveTime?: { trips: string; hoursPerTrip: string; rate: string };
  markup?: { overheadOverride?: string; profitPct?: string };
  taxRate?: string;
  locked_at?: string;
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDollar(s: string | number | undefined | null): number {
  const n = parseFloat(String(s || '').replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function parseNum(s: string | number | undefined | null): number {
  const n = parseFloat(String(s ?? '').replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ─── Calculation from estimate JSON ──────────────────────────────────────────

function calcTotals(est: EstimateData) {
  const metalTotal = (est.aluminum || []).reduce((a, i) => a + parseDollar(i.amount), 0);
  const glassTotal = (est.glass || []).reduce((a, i) => a + parseDollar(i.amount), 0);
  const miscTotal =
    Object.values(est.misc || {}).reduce((a, v) => a + parseDollar(v), 0) +
    (est.miscExtra || []).reduce((a, i) => a + parseDollar(i.amount), 0);
  const otherTotal =
    Object.values(est.other || {}).reduce((a, v) => a + parseDollar(v), 0) +
    (est.otherExtra || []).reduce((a, i) => a + parseDollar(i.amount), 0);
  // X modifier is a PROFIT adjustment (what-if negotiation tool), NOT a materials adjustment
  const xMod = parseDollar(est.xModifier || '0');
  const materialsTotal = metalTotal + glassTotal + miscTotal + otherTotal;

  const laborLines = (est.labor || []).map(l => ({
    description: l.description,
    hours: parseFloat(l.hours) || 0,
    rate: parseFloat(l.rate) || 0,
    amount: l.amount
      ? parseDollar(l.amount)
      : (parseFloat(l.hours) || 0) * (parseFloat(l.rate) || 0),
    install_step_id: l.install_step_id,
    custom: l.custom,
  }));
  const laborTotal = laborLines.reduce((a, l) => a + l.amount, 0);

  const driveTrips = parseFloat(est.driveTime?.trips ?? '0') || 0;
  const driveHoursPerTrip = parseFloat(est.driveTime?.hoursPerTrip ?? '0') || 0;
  const driveRate = parseFloat(est.driveTime?.rate ?? '117') || 117;
  const driveTotal = driveTrips * driveHoursPerTrip * driveRate;

  const subtotal = materialsTotal + laborTotal + driveTotal;

  const overheadAmt = est.markup?.overheadOverride
    ? parseDollar(est.markup.overheadOverride)
    : laborTotal;

  const profitPct = parseFloat(est.markup?.profitPct ?? '10') || 10;
  const baseProfitAmt = (subtotal + overheadAmt) * (profitPct / 100);
  const profitAmt = baseProfitAmt + xMod; // X modifier adjusts profit (negotiation tool)

  const totalBeforeTax = subtotal + overheadAmt + profitAmt;

  const getRate = parseFloat(est.taxRate ?? '4.712') || 4.712;
  const getAmt = totalBeforeTax * (getRate / 100);

  const grandTotal = totalBeforeTax + getAmt;

  return {
    metalTotal, glassTotal, miscTotal, otherTotal, xMod, materialsTotal,
    laborLines, laborTotal,
    driveTrips, driveHoursPerTrip, driveRate, driveTotal,
    subtotal, overheadAmt, profitPct, profitAmt,
    totalBeforeTax, getRate, getAmt, grandTotal,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: '#0f172a', color: 'white', borderRadius: 12, padding: '10px 20px',
      fontSize: 13, fontWeight: 700, fontFamily: FONT, zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
    }}>
      ✓ {message}
    </div>
  );
}

function VersionBadge({ version }: { version: string | number }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999,
      background: 'rgba(99,102,241,0.12)', color: '#6366f1',
      border: '1px solid rgba(99,102,241,0.25)', fontFamily: FONT, letterSpacing: '0.05em',
    }}>
      v{version}
    </span>
  );
}

function SectionHeader({ label, color = '#0f766e', accent }: { label: string; color?: string; accent?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0 6px', borderBottom: `1px solid ${color}22`,
    }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent || color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, flex: 1, fontFamily: FONT }}>
        {label}
      </span>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500, fontFamily: FONT }}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />;
}

function SummaryRow({ label, value, sub = false, highlight = false }: { label: string; value: number; sub?: boolean; highlight?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: sub ? '3px 0' : '6px 0',
      fontSize: sub ? 12 : 13,
      color: highlight ? '#0f766e' : sub ? '#64748b' : '#0f172a',
      fontFamily: FONT,
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: sub ? 500 : 700 }}>{fmt(value)}</span>
    </div>
  );
}

// ─── Save Config Modal ────────────────────────────────────────────────────────

const GREEN_INPUT: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid rgba(20,184,166,0.35)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT,
  color: '#0f172a',
  background: 'rgba(240,253,244,0.75)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

function SaveConfigModal({
  onSave, onClose, initialName = '', isSaveAs = false,
}: {
  onSave: (name: string, breakdown: BreakdownType, notes: string) => void;
  onClose: () => void;
  initialName?: string;
  isSaveAs?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [breakdown, setBreakdown] = useState<BreakdownType>('lump_sum');
  const [notes, setNotes] = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: 28, width: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', fontFamily: FONT,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
          {isSaveAs ? 'Save as New Configuration' : 'Save Configuration'}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>
          {isSaveAs ? 'Creates a separate configuration from the current state.' : 'Saves this estimate snapshot as a named version.'}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Configuration Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Base Bid — Arcadia glass"
            style={{ ...GREEN_INPUT, fontSize: 14 }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Breakdown Type</label>
          <select
            value={breakdown}
            onChange={e => setBreakdown(e.target.value as BreakdownType)}
            style={{ ...GREEN_INPUT, cursor: 'pointer', WebkitAppearance: 'none' }}
          >
            <option value="lump_sum">Lump Sum (single total)</option>
            <option value="per_floor">Per Floor</option>
            <option value="per_sqft">Per Square Foot</option>
            <option value="per_elevation">Per Elevation</option>
            <option value="per_unit">Per Unit</option>
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="What makes this config unique?"
            style={{ ...GREEN_INPUT, resize: 'none', lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={() => { if (name.trim()) onSave(name.trim(), breakdown, notes); }}
            disabled={!name.trim()}
            style={{
              flex: 2, padding: '11px', borderRadius: 12, border: 'none',
              background: name.trim() ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
              color: name.trim() ? 'white' : '#94a3b8', fontSize: 13, fontWeight: 700,
              cursor: name.trim() ? 'pointer' : 'default',
              boxShadow: name.trim() ? '0 4px 16px rgba(15,118,110,0.3)' : 'none',
            }}
          >
            💾 Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Compare Modal ────────────────────────────────────────────────────────────

function CompareModal({ configs, onClose }: { configs: QuoteConfig[]; onClose: () => void }) {
  const [leftId, setLeftId] = useState(configs[0]?.config_id || '');
  const [rightId, setRightId] = useState(configs[1]?.config_id || '');

  const left = configs.find(c => c.config_id === leftId);
  const right = configs.find(c => c.config_id === rightId);

  const isDiff = (a: string | number, b: string | number) => String(a) !== String(b);

  const CompareCell = ({ label, leftVal, rightVal }: { label: string; leftVal: string; rightVal: string }) => {
    const diff = isDiff(leftVal, rightVal);
    return (
      <div style={{ display: 'contents' }}>
        <div style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #f1f5f9' }}>{label}</div>
        <div style={{ padding: '8px 10px', fontSize: 13, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid #f1f5f9', background: diff ? 'rgba(234,179,8,0.08)' : undefined, fontWeight: diff ? 700 : 400 }}>{leftVal}</div>
        <div style={{ padding: '8px 10px', fontSize: 13, fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid #f1f5f9', background: diff ? 'rgba(234,179,8,0.08)' : undefined, fontWeight: diff ? 700 : 400 }}>{rightVal}</div>
      </div>
    );
  };

  const leftTotal = left ? parseNum(left.total_amount) : 0;
  const rightTotal = right ? parseNum(right.total_amount) : 0;
  const diff = leftTotal - rightTotal;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 28, width: '100%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', fontFamily: FONT }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Compare Configurations</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Config A</label>
            <select value={leftId} onChange={e => setLeftId(e.target.value)} style={{ ...GREEN_INPUT, cursor: 'pointer' }}>
              {configs.map(c => <option key={c.config_id} value={c.config_id}>{c.config_name} (v{c.version})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Config B</label>
            <select value={rightId} onChange={e => setRightId(e.target.value)} style={{ ...GREEN_INPUT, cursor: 'pointer' }}>
              {configs.map(c => <option key={c.config_id} value={c.config_id}>{c.config_name} (v{c.version})</option>)}
            </select>
          </div>
        </div>

        {left && right && diff !== 0 && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', fontSize: 12, color: '#92400e', fontWeight: 700, marginBottom: 16 }}>
            {diff > 0
              ? `Config A is ${fmt(Math.abs(diff))} more expensive.`
              : `Config B is ${fmt(Math.abs(diff))} more expensive.`}
          </div>
        )}

        {left && right && (
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '2px solid #e2e8f0' }}>Field</div>
            <div style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, fontSize: 11, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>
              {left.config_name} <VersionBadge version={left.version} />
            </div>
            <div style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, fontSize: 11, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>
              {right.config_name} <VersionBadge version={right.version} />
            </div>
            <CompareCell label="Grand Total" leftVal={fmt(parseNum(left.total_amount))} rightVal={fmt(parseNum(right.total_amount))} />
            <CompareCell label="Markup %" leftVal={left.markup_pct + '%'} rightVal={right.markup_pct + '%'} />
            <CompareCell label="GET Rate" leftVal={left.get_rate + '%'} rightVal={right.get_rate + '%'} />
            <CompareCell label="Breakdown" leftVal={left.breakdown_type} rightVal={right.breakdown_type} />
            <CompareCell label="Date" leftVal={fmtDate(left.created_at)} rightVal={fmtDate(right.created_at)} />
            {(left.notes || right.notes) ? <CompareCell label="Notes" leftVal={left.notes || '—'} rightVal={right.notes || '—'} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface EstimatePreFill {
  materialsTotal: number;
  laborSubtotal: number;
  overhead: number;
  profit: number;
  taxAmt: number;
  grandTotal: number;
  profitPct: number;
}

export default function QuoteBuilder({
  woNumber,
  onClose,
}: {
  woNumber: string;
  onClose: () => void;
  estimatePreFill?: EstimatePreFill; // kept for API compatibility, unused in preview mode
}) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [wo, setWo] = useState<WORecord | null>(null);
  const [est, setEst] = useState<EstimateData | null>(null);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Configs
  const [configs, setConfigs] = useState<QuoteConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Customer info (from WO, read-only)
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // ─── Load WO + estimate ──────────────────────────────────────────────────

  useEffect(() => {
    let done = false;
    const fetchWo = fetch(`/api/service/quote?wo=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setWo(d.wo);
        // Resolve customer name / email
        const name =
          d.wo?.customerName ||
          d.wo?.contactName ||
          (d.wo?.contact ? d.wo.contact.split(/\d/)[0].trim().replace(/[^a-zA-Z\s]/g, '').trim() : '') ||
          '';
        const email = d.wo?.contactEmail || d.wo?.email || '';
        setCustomerName(name);
        setCustomerEmail(email);
      });

    const fetchEst = fetch(`/api/service/estimate?wo=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => { if (d.data) setEst(d.data); })
      .catch(() => {});

    const fetchConfigs = fetch(`/api/quote-configs?job_id=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => { setConfigs(d.configs || []); })
      .catch(() => {});

    Promise.all([fetchWo, fetchEst, fetchConfigs])
      .catch(e => setError(String(e)))
      .finally(() => { if (!done) setLoading(false); });

    return () => { done = true; };
  }, [woNumber]);

  // ─── Derived totals ──────────────────────────────────────────────────────

  const totals = est ? calcTotals(est) : null;

  // ─── Config helpers ──────────────────────────────────────────────────────

  const activeConf = configs.find(c => c.config_id === activeConfigId);

  async function reloadConfigs() {
    const r = await fetch(`/api/quote-configs?job_id=${encodeURIComponent(woNumber)}`);
    const d = await r.json();
    setConfigs(d.configs || []);
  }

  async function handleSaveNew(configName: string, breakdown: BreakdownType, notes: string) {
    if (!totals) return;
    setConfigSaving(true);
    setShowSaveModal(false);
    setShowSaveAsModal(false);
    try {
      const res = await fetch('/api/quote-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: woNumber,
          config_name: configName,
          total_amount: String(totals.grandTotal.toFixed(2)),
          labor_json: JSON.stringify(est?.labor || []),
          materials_json: JSON.stringify({ estimate: est }),
          markup_pct: String(totals.profitPct),
          get_rate: String(totals.getRate),
          overhead_method: 'labor_equal',
          breakdown_type: breakdown,
          notes,
          created_by: 'mission-control',
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setActiveConfigId(data.config_id);
      setToast(`Configuration saved as v1`);
      await reloadConfigs();
    } catch (e) { setError(String(e)); }
    finally { setConfigSaving(false); }
  }

  async function handleDuplicate() {
    if (!totals) return;
    const newName = `${activeConf?.config_name || 'Config'} (copy)`;
    setConfigSaving(true);
    try {
      const res = await fetch('/api/quote-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: woNumber,
          config_name: newName,
          total_amount: String(totals.grandTotal.toFixed(2)),
          labor_json: JSON.stringify(est?.labor || []),
          materials_json: JSON.stringify({ estimate: est }),
          markup_pct: String(totals.profitPct),
          get_rate: String(totals.getRate),
          overhead_method: 'labor_equal',
          breakdown_type: 'lump_sum',
          notes: 'Duplicated',
          created_by: 'mission-control',
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setToast(`Duplicated as "${newName}"`);
      await reloadConfigs();
    } catch (e) { setError(String(e)); }
    finally { setConfigSaving(false); }
  }

  // ─── Generate quote (builds payload from estimate data) ──────────────────

  async function generateQuote() {
    if (!totals || !wo) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/service/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woNumber,
          customerName,
          customerEmail,
          customerPhone: wo.contactPhone || wo.phone || '',
          customerAddress: wo.address,
          projectDescription: wo.name,
          siteAddress: wo.address,
          island: wo.island,
          scopeNarrative: wo.description || wo.name,
          jobType: wo.systemType || '',
          laborSteps: totals.laborLines.map(l => ({
            description: l.description,
            hours: l.hours,
            rate: l.rate,
            amount: l.amount,
          })),
          driveTimeCost: totals.driveTotal,
          driveTimeTrips: totals.driveTrips,
          driveTimeHoursPerTrip: totals.driveHoursPerTrip,
          driveTimeRate: totals.driveRate,
          materialsTotal: totals.materialsTotal,
          additionalCosts: [],
          additionalTotal: 0,
          laborSubtotal: totals.laborTotal,
          subtotal: totals.subtotal,
          overheadPct: totals.laborTotal > 0 && totals.subtotal > 0
            ? Math.round((totals.overheadAmt / totals.subtotal) * 100)
            : 0,
          overheadAmt: totals.overheadAmt,
          profitPct: totals.profitPct,
          profitAmt: totals.profitAmt,
          totalBeforeTax: totals.totalBeforeTax,
          getRate: totals.getRate,
          getAmt: totals.getAmt,
          grandTotal: totals.grandTotal,
          breakdownType: 'lump_sum',
          installationIncluded: true,
          crewCount: 1,
          hourlyRate: 117,
          equipmentCharges: 0,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setQuote(data.quote); }
    } catch (e) { setError(String(e)); }
    setGenerating(false);
  }

  // ─── Download PDF ──────────────────────────────────────────────────────────

  async function handleDownload() {
    if (!quote) { await generateQuote(); return; }
    setDownloading(true);
    try {
      const res = await fetch('/api/service/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote, sendEmail: false }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Proposal-WO-${woNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError('PDF failed: ' + e); }
    setDownloading(false);
  }

  // ─── Email ────────────────────────────────────────────────────────────────

  async function handleEmail() {
    if (!customerEmail) { setError('No customer email on file'); return; }
    if (!quote) {
      await generateQuote();
      return;
    }
    setEmailing(true);
    try {
      const res = await fetch('/api/service/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote, sendEmail: true }),
      });
      const data = await res.json();
      if (data.success) {
        setToast(`Sent to ${customerEmail}`);
      } else {
        setError('Email failed: ' + data.error);
      }
    } catch (e) { setError('Email failed: ' + e); }
    setEmailing(false);
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading WO {woNumber}…</div>
    </div>
  );

  // ─── Preview ──────────────────────────────────────────────────────────────

  const t = totals;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', fontFamily: FONT }}>

      {/* Modals */}
      {showSaveModal && (
        <SaveConfigModal onSave={handleSaveNew} onClose={() => setShowSaveModal(false)} />
      )}
      {showSaveAsModal && (
        <SaveConfigModal
          onSave={handleSaveNew}
          onClose={() => setShowSaveAsModal(false)}
          initialName={activeConf ? `${activeConf.config_name} (alt)` : ''}
          isSaveAs
        />
      )}
      {showCompare && configs.length >= 2 && (
        <CompareModal configs={configs} onClose={() => setShowCompare(false)} />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Service Quote</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
            WO-{woNumber}{wo?.name ? ` — ${wo.name.substring(0, 45)}` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 18, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ×
        </button>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c' }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 14 }}>×</button>
          </div>
        )}

        {/* ── Accepted badge ─────────────────────────────────────────────── */}
        {est?.locked_at && (
          <div style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.25)', fontSize: 12, color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            ✅ Estimate accepted {fmtDate(est.locked_at)} — this is the accepted quote
          </div>
        )}

        {/* ── No estimate warning ─────────────────────────────────────────── */}
        {!est && (
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            ⚠️ No estimate found for WO-{woNumber}. Go back to the estimate form to build pricing first.
          </div>
        )}

        {/* ── Customer Section ────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
          <SectionHeader label="Customer" color="#0369a1" />
          <div style={{ paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ReadField label="Customer Name" value={customerName} />
            <ReadField label="Phone" value={wo?.contactPhone || wo?.phone || wo?.contact?.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/)?.[1] || ''} />
            <ReadField label="Email" value={customerEmail} />
            <ReadField label="Island" value={wo?.island || ''} />
            <div style={{ gridColumn: '1 / -1' }}>
              <ReadField label="Address" value={wo?.address || ''} />
            </div>
          </div>
        </div>

        {/* ── Scope of Work ────────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
          <SectionHeader label="Scope of Work" color="#0f766e" />
          <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {wo?.systemType && (
              <ReadField label="System Type" value={wo.systemType} />
            )}
            {(wo?.description || wo?.name) && (
              <ReadField label="Description" value={wo.description || wo.name || ''} />
            )}

            {/* Scope description only — no labor step breakdown (internal detail) */}
          </div>
        </div>

        {/* ── Pricing Summary ──────────────────────────────────────────────── */}
        {t && (
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
            <SectionHeader label="Pricing Summary" color="#0f172a" />
            <div style={{ paddingTop: 12 }}>

              {/* Customer-facing: Materials + Labor + Tax = Total */}
              <SummaryRow label="Materials" value={t.materialsTotal} />
              <SummaryRow label="Labor" value={t.laborTotal + t.driveTotal + t.overheadAmt + t.profitAmt} />
              <Divider />
              <SummaryRow label="Subtotal" value={t.materialsTotal + t.laborTotal + t.driveTotal + t.overheadAmt + t.profitAmt} />
              <SummaryRow label={`General Excise Tax (${t.getRate}%)`} value={t.getAmt} sub />
              <Divider />

              {/* Grand total */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderRadius: 10, background: '#0f172a', marginTop: 6,
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>Grand Total</span>
                <span style={{ fontSize: 22, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>{fmt(t.grandTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px 0', fontSize: 12, fontWeight: 700, color: '#0f766e', fontFamily: FONT }}>
                <span>50% Deposit Required</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(t.grandTotal * 0.5)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Configurations Panel (collapsible) ──────────────────────────── */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <button
            onClick={() => setShowConfigPanel(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: showConfigPanel ? '1px solid #f1f5f9' : 'none',
            }}
          >
            <div style={{ width: 3, height: 14, borderRadius: 2, background: '#6366f1', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6366f1', flex: 1, textAlign: 'left', fontFamily: FONT }}>
              Saved Configurations {configs.length > 0 && `(${configs.length})`}
            </span>
            <span style={{ fontSize: 14, color: '#6366f1', opacity: 0.5 }}>{showConfigPanel ? '▾' : '▸'}</span>
          </button>

          {showConfigPanel && (
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowSaveModal(true)}
                  disabled={configSaving || !t}
                  style={{
                    padding: '6px 14px', borderRadius: 9, border: 'none',
                    background: t ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                    color: t ? 'white' : '#94a3b8', fontSize: 12, fontWeight: 700,
                    cursor: t ? 'pointer' : 'default',
                    boxShadow: t ? '0 2px 8px rgba(15,118,110,0.25)' : 'none',
                  }}
                >
                  {configSaving ? 'Saving…' : '💾 Save Config'}
                </button>
                {activeConfigId && (
                  <button
                    onClick={() => setShowSaveAsModal(true)}
                    style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(238,242,255,0.7)', color: '#4338ca', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Save As New
                  </button>
                )}
                {activeConfigId && (
                  <button
                    onClick={handleDuplicate}
                    style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(8,145,178,0.3)', background: 'rgba(224,242,254,0.7)', color: '#0369a1', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ⎘ Duplicate
                  </button>
                )}
                {configs.length >= 2 && (
                  <button
                    onClick={() => setShowCompare(true)}
                    style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(109,40,217,0.3)', background: 'rgba(237,233,254,0.7)', color: '#6d28d9', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    ⇄ Compare
                  </button>
                )}
              </div>

              {/* Config list */}
              {configsLoading && (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>Loading configurations…</div>
              )}
              {!configsLoading && configs.length === 0 && (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No saved configurations yet. Save one to track quote versions during negotiations.</div>
              )}
              {configs.map(c => {
                const isActive = c.config_id === activeConfigId;
                const versions = c.versions || [];
                return (
                  <div
                    key={c.config_id}
                    style={{
                      padding: '10px 14px', borderRadius: 10,
                      border: isActive ? '1px solid rgba(99,102,241,0.4)' : '1px solid #e2e8f0',
                      background: isActive ? 'rgba(238,242,255,0.5)' : '#fafafa',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', flex: 1 }}>{c.config_name}</span>
                      <VersionBadge version={c.version} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseNum(c.total_amount))}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                      {fmtDate(c.created_at)} · {c.breakdown_type?.replace('_', ' ') || 'lump sum'}
                      {c.notes ? ` · ${c.notes}` : ''}
                    </div>
                    {/* Version history */}
                    {versions.length > 1 && (
                      <button
                        onClick={() => setShowVersionHistory(v => !v)}
                        style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, marginTop: 4, padding: 0, textDecoration: 'underline' }}
                      >
                        {versions.length} versions
                      </button>
                    )}
                    {showVersionHistory && versions.length > 1 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {[...versions].sort((a, b) => parseInt(b.version) - parseInt(a.version)).map((v, idx) => (
                          <div key={v.version} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: idx < versions.length - 1 ? '1px solid #f8fafc' : undefined }}>
                            <VersionBadge version={v.version} />
                            <span style={{ fontSize: 11, color: '#0f172a', fontWeight: parseInt(v.version) === parseInt(c.version) ? 800 : 400, flex: 1, fontVariantNumeric: 'tabular-nums' }}>
                              {fmt(parseNum(v.total_amount))}
                            </span>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmtDate(v.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        onClick={() => setActiveConfigId(isActive ? null : c.config_id)}
                        style={{
                          padding: '4px 10px', borderRadius: 7, border: 'none',
                          background: isActive ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)',
                          color: '#6366f1', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {isActive ? '✓ Active' : 'Mark Active'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── Actions Bar (footer) ──────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px', borderTop: '1px solid #f1f5f9',
        display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap',
      }}>
        {/* Back to Estimate */}
        <button
          onClick={onClose}
          style={{
            flex: 1, minWidth: 120, padding: '11px', borderRadius: 12,
            border: '1px solid #e2e8f0', background: 'white', color: '#64748b',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT,
          }}
        >
          ← Back to Estimate
        </button>

        {/* Download PDF */}
        <button
          onClick={handleDownload}
          disabled={downloading || generating || !t}
          style={{
            flex: 2, minWidth: 140, padding: '11px', borderRadius: 12, border: 'none',
            background: !t ? '#e2e8f0' : downloading || generating ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)',
            color: !t || downloading || generating ? '#94a3b8' : 'white',
            fontSize: 13, fontWeight: 700,
            cursor: !t || downloading || generating ? 'default' : 'pointer',
            boxShadow: t && !downloading && !generating ? '0 4px 16px rgba(15,118,110,0.3)' : 'none',
            fontFamily: FONT,
          }}
        >
          {generating ? 'Building…' : downloading ? 'Downloading…' : '⬇ Download PDF'}
        </button>

        {/* Email to Customer */}
        <button
          onClick={handleEmail}
          disabled={emailing || generating || !customerEmail || !t}
          title={!customerEmail ? 'No customer email on file' : undefined}
          style={{
            flex: 2, minWidth: 140, padding: '11px', borderRadius: 12, border: 'none',
            background: !t || !customerEmail || emailing || generating ? '#e2e8f0' : '#4338ca',
            color: !t || !customerEmail || emailing || generating ? '#94a3b8' : 'white',
            fontSize: 13, fontWeight: 700,
            cursor: !t || !customerEmail || emailing || generating ? 'default' : 'pointer',
            fontFamily: FONT,
          }}
        >
          {emailing ? 'Sending…' : generating ? 'Building…' : '📧 Email to Customer'}
        </button>

        {/* Save Configuration */}
        <button
          onClick={() => { setShowConfigPanel(true); setShowSaveModal(true); }}
          disabled={!t}
          style={{
            padding: '11px 16px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)',
            background: t ? 'rgba(238,242,255,0.7)' : '#e2e8f0',
            color: t ? '#4338ca' : '#94a3b8',
            fontSize: 13, fontWeight: 700,
            cursor: t ? 'pointer' : 'default',
            fontFamily: FONT,
          }}
        >
          💾
        </button>
      </div>
    </div>
  );
}
