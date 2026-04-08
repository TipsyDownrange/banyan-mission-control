'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LaborStep = {
  id: string;
  description: string;
  hours: string;
  rate: string;
  amountOverride: string;
};

type MaterialLine = {
  id: string;
  description: string;
  qty: string;
  unit: string;
  unitCost: string;
  totalOverride: string;
  unitType?: 'SF' | 'LF' | 'EA' | 'Tube';
  width: string;
  height: string;
  length: string;
};

type AdditionalCost = {
  id: string;
  description: string;
  amount: string;
};

type DriveTimeState = {
  trips: string;
  hoursPerTrip: string;
  rate: string;
  totalOverride: string;
  hoursManual: boolean;
};

type Markup = {
  overheadPct: string;
  profitPct: string;
  getRate: string;
};

type WOData = {
  woNumber: string;
  name: string;
  address: string;
  island: string;
  contact: string;
  description: string;
  assignedTo: string;
};

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

// ─── Drive time lookup ────────────────────────────────────────────────────────

function lookupDriveHours(address: string): number {
  if (!address) return 1;
  const a = address.toLowerCase();
  if (a.includes('hana')) return 4;
  if (a.includes('kapalua')) return 2;
  if (a.includes('lahaina') || a.includes('kaanapali') || a.includes('ka\'anapali')) return 1.5;
  if (a.includes('upcountry') || a.includes('up country')) return 1.5;
  if (a.includes('kihei') || a.includes('wailea') || a.includes('makena')) return 1;
  if (a.includes('haiku') || a.includes('ha\'iku') || a.includes('paia') || a.includes('pa\'ia')) return 1;
  if (a.includes('kula') || a.includes('makawao') || a.includes('pukalani')) return 1;
  if (a.includes('wailuku')) return 0.5;
  if (a.includes('kahului')) return 0.5;
  return 1;
}

function driveAreaLabel(address: string): string {
  if (!address) return 'Unknown area';
  const a = address.toLowerCase();
  if (a.includes('hana')) return 'Hana';
  if (a.includes('kapalua')) return 'Kapalua';
  if (a.includes('lahaina') || a.includes('kaanapali')) return 'Lahaina / Ka\'anapali';
  if (a.includes('upcountry')) return 'Upcountry';
  if (a.includes('kihei')) return 'Kihei';
  if (a.includes('wailea')) return 'Wailea';
  if (a.includes('haiku') || a.includes('ha\'iku')) return 'Ha\'iku';
  if (a.includes('paia') || a.includes('pa\'ia')) return 'Pā\'ia';
  if (a.includes('kula')) return 'Kula';
  if (a.includes('makawao')) return 'Makawao';
  if (a.includes('pukalani')) return 'Pukalani';
  if (a.includes('wailuku')) return 'Wailuku';
  if (a.includes('kahului')) return 'Kahului';
  return 'Maui';
}

// ─── Unit type auto-detection ────────────────────────────────────────────────

function detectUnitType(desc: string): 'SF' | 'LF' | 'EA' | 'Tube' {
  const d = desc.toLowerCase();
  if (['glass', 'mirror', 'igu', 'laminated', 'tempered', 'panel'].some(k => d.includes(k))) return 'SF';
  if (['caulking', 'sealant', 'backer rod', 'tape', 'weatherseal'].some(k => d.includes(k))) return 'LF';
  if (['closer', 'handle', 'hardware', 'lock', 'hinge'].some(k => d.includes(k))) return 'EA';
  if (['tube', 'cartridge'].some(k => d.includes(k))) return 'Tube';
  return 'EA';
}

// ─── ID factory ───────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return `id-${++_id}-${Math.random().toString(36).slice(2, 6)}`; }

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';

const GREEN_INPUT: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid rgba(20,184,166,0.35)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT,
  fontVariantNumeric: 'tabular-nums',
  color: '#0f172a',
  background: 'rgba(240,253,244,0.75)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

const ORANGE_DISPLAY: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid rgba(245,158,11,0.3)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT,
  fontVariantNumeric: 'tabular-nums',
  color: '#92400e',
  background: 'rgba(255,251,235,0.8)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
  textAlign: 'right' as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s?.replace(/[$,]/g, '') ?? '');
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GreenInput({
  value, onChange, placeholder, type = 'text', step, min, style,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; step?: string; min?: string; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      inputMode={type === 'number' ? 'decimal' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      onFocus={e => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => setFocused(false)}
      style={{
        ...GREEN_INPUT,
        border: focused ? '1px solid #14b8a6' : '1px solid rgba(20,184,166,0.35)',
        background: focused ? '#f0fdf4' : 'rgba(240,253,244,0.75)',
        ...style,
      }}
    />
  );
}

function OrangeDisplay({ value, isManual, onClick }: { value: string; isManual?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...ORANGE_DISPLAY,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
      }}
    >
      {isManual && (
        <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>
          MANUAL
        </span>
      )}
      <span>{value}</span>
    </div>
  );
}

function SectionToggle({
  label, color = '#0f766e', open, onToggle, accent,
}: {
  label: string; color?: string; open: boolean; onToggle: () => void; accent?: string;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 6px',
        borderBottom: `1px solid ${color}22`,
      }}
    >
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent || `linear-gradient(180deg, ${color}, ${color}99)`, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, flex: 1, textAlign: 'left', fontFamily: FONT }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color, opacity: 0.5 }}>{open ? '▾' : '▸'}</span>
    </button>
  );
}

function SummaryRow({ label, value, sub = false }: { label: string; value: number; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: sub ? '4px 0' : '6px 0', fontSize: sub ? 12 : 13, color: sub ? '#64748b' : '#0f172a', fontFamily: FONT }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: sub ? 500 : 700 }}>{fmt(value)}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

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

// ─── Version Badge ─────────────────────────────────────────────────────────────

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

// ─── Save Config Modal ────────────────────────────────────────────────────────

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
          {isSaveAs ? 'Creates a separate configuration from the current state.' : 'Saves all quote data. Future edits will create new versions.'}
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

function CompareModal({
  configs, onClose,
}: {
  configs: QuoteConfig[];
  onClose: () => void;
}) {
  const [leftId, setLeftId] = useState(configs[0]?.config_id || '');
  const [rightId, setRightId] = useState(configs[1]?.config_id || '');

  const left = configs.find(c => c.config_id === leftId);
  const right = configs.find(c => c.config_id === rightId);

  function parseLaborTotal(config: QuoteConfig): number {
    try {
      const steps = JSON.parse(config.labor_json || '[]') as Array<{ amount?: number; hours?: number; rate?: number }>;
      return steps.reduce((sum, s) => sum + (s.amount || (s.hours || 0) * (s.rate || 0)), 0);
    } catch { return 0; }
  }

  function parseMatTotal(config: QuoteConfig): number {
    try {
      const mats = JSON.parse(config.materials_json || '{}');
      const allLines: Array<{ totalOverride?: string; qty?: string; unitCost?: string }> = [
        ...(mats.mainMaterials || []),
        ...(mats.consumables || []),
        ...(mats.freight || []),
      ];
      return allLines.reduce((sum, m) => {
        if (m.totalOverride) return sum + parseNum(m.totalOverride);
        return sum + parseNum(m.qty || '0') * parseNum(m.unitCost || '0');
      }, 0);
    } catch { return 0; }
  }

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

        {/* Config selectors */}
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

        {/* Difference summary */}
        {left && right && diff !== 0 && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', fontSize: 12, color: '#92400e', fontWeight: 700, marginBottom: 16 }}>
            {diff > 0
              ? `Config A is ${fmt(Math.abs(diff))} more expensive${parseLaborTotal(left) > parseLaborTotal(right) ? ` and uses ${Math.round((parseLaborTotal(left) - parseLaborTotal(right)) / 120)} more labor hours` : ''}.`
              : `Config B is ${fmt(Math.abs(diff))} more expensive${parseLaborTotal(right) > parseLaborTotal(left) ? ` and uses ${Math.round((parseLaborTotal(right) - parseLaborTotal(left)) / 120)} more labor hours` : ''}.`
            }
          </div>
        )}

        {/* Comparison grid */}
        {left && right && (
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '2px solid #e2e8f0' }}>Field</div>
            <div style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, fontSize: 11, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>
              {left.config_name} <VersionBadge version={left.version} />
            </div>
            <div style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, fontSize: 11, color: '#0f172a', borderBottom: '2px solid #e2e8f0' }}>
              {right.config_name} <VersionBadge version={right.version} />
            </div>

            <CompareCell label="Grand Total" leftVal={fmt(parseNum(left.total_amount))} rightVal={fmt(parseNum(right.total_amount))} />
            <CompareCell label="Labor Total" leftVal={fmt(parseLaborTotal(left))} rightVal={fmt(parseLaborTotal(right))} />
            <CompareCell label="Materials Total" leftVal={fmt(parseMatTotal(left))} rightVal={fmt(parseMatTotal(right))} />
            <CompareCell label="Markup %" leftVal={left.markup_pct + '%'} rightVal={right.markup_pct + '%'} />
            <CompareCell label="GET Rate" leftVal={left.get_rate + '%'} rightVal={right.get_rate + '%'} />
            <CompareCell label="Breakdown" leftVal={left.breakdown_type} rightVal={right.breakdown_type} />
            <CompareCell label="Date" leftVal={fmtDate(left.created_at)} rightVal={fmtDate(right.created_at)} />
            {left.notes || right.notes ? <CompareCell label="Notes" leftVal={left.notes} rightVal={right.notes} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Unsaved Warning Modal ────────────────────────────────────────────────────

function UnsavedWarning({ onSave, onDiscard, onCancel }: { onSave: () => void; onDiscard: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 20, padding: 28, width: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.18)', fontFamily: FONT }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Unsaved Changes</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>You have unsaved changes. What would you like to do?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onSave} style={{ padding: '11px', borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>💾 Save First</button>
          <button onClick={onDiscard} style={{ padding: '11px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(254,242,242,0.8)', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Discard Changes</button>
          <button onClick={onCancel} style={{ padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultLaborSteps(): LaborStep[] {
  return [
    { id: uid(), description: 'Measurement / Site Visit', hours: '1', rate: '120', amountOverride: '' },
    { id: uid(), description: 'Installation', hours: '4', rate: '120', amountOverride: '' },
  ];
}

function defaultDriveTime(address: string): DriveTimeState {
  return {
    trips: '2',
    hoursPerTrip: String(lookupDriveHours(address)),
    rate: '120',
    totalOverride: '',
    hoursManual: false,
  };
}

function defaultMarkup(): Markup {
  return { overheadPct: '0', profitPct: '10', getRate: '4.5' };
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

export default function QuoteBuilder({ woNumber, onClose, estimatePreFill }: { woNumber: string; onClose: () => void; estimatePreFill?: EstimatePreFill }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [wo, setWo] = useState<WOData | null>(null);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  // Work breakdown baseline
  const [wbBaselineHours, setWbBaselineHours] = useState<number | null>(null);
  const [wbLaborLines, setWbLaborLines] = useState<{ category: string; hours: number }[]>([]);

  // Section open/close
  const [openSections, setOpenSections] = useState({
    customer: true, scope: true, labor: true,
    driveTime: true, materials: true, additional: true, summary: true,
  });
  function toggleSection(k: keyof typeof openSections) {
    setOpenSections(p => ({ ...p, [k]: !p[k] }));
  }

  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Scope
  const [jobType, setJobType] = useState('');
  const [scopeNarrative, setScopeNarrative] = useState('');

  // Labor
  const [laborSteps, setLaborSteps] = useState<LaborStep[]>(defaultLaborSteps);

  // Drive time
  const [driveTime, setDriveTime] = useState<DriveTimeState>({
    trips: '2', hoursPerTrip: '1', rate: '120', totalOverride: '', hoursManual: false,
  });

  // Materials
  const [mainMaterials, setMainMaterials] = useState<MaterialLine[]>([
    { id: uid(), description: '', qty: '1', unit: 'ea', unitCost: '', totalOverride: '', width: '', height: '', length: '' },
  ]);
  const [consumables, setConsumables] = useState<MaterialLine[]>([]);
  const [freight, setFreight] = useState<MaterialLine[]>([]);

  // Additional costs
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([
    { id: uid(), description: 'Equipment / Lift Rental', amount: '' },
    { id: uid(), description: 'Disposal / Cleanup', amount: '' },
  ]);

  // Markup
  const [markup, setMarkup] = useState<Markup>(defaultMarkup);

  // File attachments
  const quoteFileInputRef = useRef<HTMLInputElement>(null);
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [quoteFileDragging, setQuoteFileDragging] = useState(false);

  // Auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // ─── Config / Version State ────────────────────────────────────────────────

  const [configs, setConfigs] = useState<QuoteConfig[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number>(1);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [breakdownType, setBreakdownType] = useState<BreakdownType>('lump_sum');
  const [sqft, setSqft] = useState('');
  const [floorCount, setFloorCount] = useState('');
  const [elevationCount, setElevationCount] = useState('');
  const [unitCount, setUnitCount] = useState('');

  // UI modals
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const pendingLoadConfig = useRef<QuoteConfig | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // ─── Load WO ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/service/quote?wo=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setWo(d.wo);
        setJobTypes(d.jobTypes || []);
        // Scope: use description, fallback to name
        if (d.wo?.description) setScopeNarrative(d.wo.description);
        else if (d.wo?.name) setScopeNarrative(d.wo.name);
        // Customer info: dedicated fields first, then parse contact string
        if (d.wo?.contactEmail) setCustomerEmail(d.wo.contactEmail);
        if (d.wo?.contactPhone) setCustomerPhone(d.wo.contactPhone);
        const contact = d.wo?.contact || '';
        if (!d.wo?.contactPhone) {
          const phoneMatch = contact.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
          if (phoneMatch) setCustomerPhone(phoneMatch[1]);
        }
        // Customer name: prefer dedicated field, then parse from contact, then from WO name
        if (d.wo?.customerName) {
          setCustomerName(d.wo.customerName);
        } else {
          const namepart = contact.split(/\d/)[0].trim().replace(/[^a-zA-Z\s]/g, '').trim();
          if (namepart) setCustomerName(namepart);
        }
        // System type / job type from WO
        if (d.wo?.systemType) setJobType(d.wo.systemType);
        const addr = d.wo?.address || '';
        setDriveTime(defaultDriveTime(addr));
        if (d.defaults?.hourlyRate) {
          const rate = String(d.defaults.hourlyRate);
          setLaborSteps(prev => prev.map(s => ({ ...s, rate })));
          setDriveTime(prev => ({ ...prev, rate }));
        }
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [woNumber]);

  // Pre-fill from estimate data when provided (prop-based fallback)
  useEffect(() => {
    if (!estimatePreFill || loading) return;
    if (estimatePreFill.materialsTotal > 0) {
      setMainMaterials([{ id: uid(), description: 'Materials (from estimate)', qty: '1', unit: 'ea', unitCost: String(Math.round(estimatePreFill.materialsTotal * 100) / 100), totalOverride: '', width: '', height: '', length: '' }]);
    }
    if (estimatePreFill.laborSubtotal > 0) {
      const rate = 117;
      const hours = Math.round(estimatePreFill.laborSubtotal / rate * 10) / 10;
      setLaborSteps([{ id: uid(), description: 'Labor (from estimate)', hours: String(hours), rate: String(rate), amountOverride: '' }]);
    }
    if (estimatePreFill.profitPct) {
      setMarkup(prev => ({ ...prev, profitPct: String(estimatePreFill.profitPct) }));
    }
  }, [estimatePreFill, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from saved estimate in API (reliable: reads persisted data)
  const [estimatePrefillBanner, setEstimatePrefillBanner] = useState(false);
  useEffect(() => {
    if (loading || !woNumber) return;
    fetch(`/api/service/estimate?wo=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.data) return;
        const est = d.data;
        // Calculate totals from estimate data
        function parseDollar(s: string): number {
          const n = parseFloat(String(s || '').replace(/[$,]/g, ''));
          return isNaN(n) ? 0 : n;
        }
        function sumItems(items: Array<{amount: string}>): number {
          return (items || []).reduce((a, i) => a + parseDollar(i.amount), 0);
        }
        const metalSubtotal = sumItems(est.aluminum || []);
        const glassSubtotal = sumItems(est.glass || []);
        const miscSubtotal = Object.values(est.misc || {}).reduce((a: number, v) => a + parseDollar(v as string), 0)
          + sumItems(est.miscExtra || []);
        const otherSubtotal = Object.values(est.other || {}).reduce((a: number, v) => a + parseDollar(v as string), 0)
          + sumItems(est.otherExtra || []);
        const materialsTotal = metalSubtotal + glassSubtotal + miscSubtotal + otherSubtotal;

        const driveTrips = parseFloat(est.driveTime?.trips) || 0;
        const driveHoursPerTrip = parseFloat(est.driveTime?.hoursPerTrip) || 0;
        const driveRate = parseFloat(est.driveTime?.rate) || 117;
        const driveTimeAmt = driveTrips * driveHoursPerTrip * driveRate;

        type LaborLine = { hours: string; rate: string; amount: string };
        const laborSubtotal = (est.labor || []).reduce((a: number, l: LaborLine) => {
          const h = parseFloat(l.hours) || 0;
          const r = parseFloat(l.rate) || 0;
          return a + (l.amount ? parseDollar(l.amount) : h * r);
        }, 0) + driveTimeAmt;

        const profitPct = parseFloat(est.markup?.profitPct) || 10;
        const getRate = parseFloat(est.taxRate) || 4.17;

        let changed = false;

        // Set materials as a single line if estimate has materials
        if (materialsTotal > 0) {
          setMainMaterials([{
            id: uid(),
            description: 'Materials per estimate',
            qty: '1',
            unit: 'ea',
            unitCost: String(Math.round(materialsTotal * 100) / 100),
            totalOverride: '',
            width: '', height: '', length: '',
          }]);
          changed = true;
        }

        // Set labor hours derived from estimate
        if (laborSubtotal > 0) {
          const rate = 117;
          const hours = Math.round(laborSubtotal / rate * 10) / 10;
          setLaborSteps([{ id: uid(), description: 'Labor per estimate', hours: String(hours), rate: String(rate), amountOverride: '' }]);
          changed = true;
        }

        // Set drive time from estimate
        if (driveTrips > 0 || driveHoursPerTrip > 0) {
          setDriveTime(prev => ({
            ...prev,
            trips: String(driveTrips || 2),
            hoursPerTrip: String(driveHoursPerTrip || prev.hoursPerTrip),
            rate: String(driveRate),
          }));
          changed = true;
        }

        // Set markup from estimate
        if (profitPct) {
          setMarkup(prev => ({ ...prev, profitPct: String(profitPct), getRate: String(getRate) }));
          changed = true;
        }

        if (changed) setEstimatePrefillBanner(true);
      })
      .catch(() => {}); // silent — estimate is optional
  }, [loading, woNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load work breakdown baseline on mount ───────────────────────────────

  useEffect(() => {
    if (!woNumber) return;
    fetch(`/api/work-breakdown/${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => {
        const steps: Array<{ allotted_hours: number; category?: string }> = d.steps || [];
        if (steps.length === 0) return;
        const total = steps.reduce((sum: number, s) => sum + (s.allotted_hours || 0), 0);
        setWbBaselineHours(total);
        // Group by category
        const catMap: Record<string, number> = {};
        for (const s of steps) {
          const cat = s.category || 'Installation';
          catMap[cat] = (catMap[cat] || 0) + (s.allotted_hours || 0);
        }
        const lines = Object.entries(catMap).map(([category, hours]) => ({ category, hours }));
        setWbLaborLines(lines);
        // Pre-fill labor steps from work breakdown if no config is loaded yet
        if (total > 0) {
          const rate = '120';
          const newSteps: LaborStep[] = lines.map(l => ({
            id: uid(),
            description: `${l.category} (From Step Library)`,
            hours: String(l.hours),
            rate,
            amountOverride: '',
          }));
          setLaborSteps(newSteps);
        }
      })
      .catch(() => {}); // silently fail — labor works manually if no breakdown
  }, [woNumber]);

  // ─── Load configs for this job ─────────────────────────────────────────────

  useEffect(() => {
    if (!woNumber) return;
    setConfigsLoading(true);
    fetch(`/api/quote-configs?job_id=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => { setConfigs(d.configs || []); })
      .catch(() => { /* silent */ })
      .finally(() => setConfigsLoading(false));
  }, [woNumber]);

  // ─── Mark dirty on any change ──────────────────────────────────────────────

  const markDirty = useCallback(() => setHasUnsaved(true), []);

  // ─── Derived calculations ──────────────────────────────────────────────────

  function laborStepAmount(s: LaborStep): number {
    if (s.amountOverride) return parseNum(s.amountOverride);
    return parseNum(s.hours) * parseNum(s.rate);
  }

  function materialLineTotal(m: MaterialLine): number {
    if (m.totalOverride) return parseNum(m.totalOverride);
    const ut = m.unitType || detectUnitType(m.description);
    if (ut === 'SF') {
      const sf = (parseNum(m.width) * parseNum(m.height) / 144) * parseNum(m.qty);
      return sf * parseNum(m.unitCost);
    }
    if (ut === 'LF') {
      const lf = parseNum(m.length || '0') * parseNum(m.qty);
      return lf * parseNum(m.unitCost);
    }
    return parseNum(m.qty) * parseNum(m.unitCost);
  }

  const laborSubtotal = laborSteps.reduce((a, s) => a + laborStepAmount(s), 0);
  const driveTotal = (() => {
    if (driveTime.totalOverride) return parseNum(driveTime.totalOverride);
    return parseNum(driveTime.trips) * parseNum(driveTime.hoursPerTrip) * parseNum(driveTime.rate);
  })();
  const mainMatTotal = mainMaterials.reduce((a, m) => a + materialLineTotal(m), 0);
  const consumablesTotal = consumables.reduce((a, m) => a + materialLineTotal(m), 0);
  const freightTotal = freight.reduce((a, m) => a + materialLineTotal(m), 0);
  const materialsSubtotal = mainMatTotal + consumablesTotal + freightTotal;
  const additionalTotal = additionalCosts.reduce((a, c) => a + parseNum(c.amount), 0);
  const subtotal = materialsSubtotal + laborSubtotal + driveTotal + additionalTotal;
  const overheadAmt = subtotal * (parseNum(markup.overheadPct) / 100);
  const profitAmt = (subtotal + overheadAmt) * (parseNum(markup.profitPct) / 100);
  const totalBeforeTax = subtotal + overheadAmt + profitAmt;
  const getAmt = totalBeforeTax * (parseNum(markup.getRate) / 100);
  const grandTotal = totalBeforeTax + getAmt;
  const deposit = grandTotal * 0.5;

  // ─── Breakdown display ─────────────────────────────────────────────────────

  function breakdownDisplay(): string {
    if (breakdownType === 'lump_sum') return fmt(grandTotal);
    if (breakdownType === 'per_sqft' && parseNum(sqft) > 0) return fmt(grandTotal / parseNum(sqft)) + '/SF';
    if (breakdownType === 'per_floor' && parseNum(floorCount) > 0) return fmt(grandTotal / parseNum(floorCount)) + '/floor';
    if (breakdownType === 'per_elevation' && parseNum(elevationCount) > 0) return fmt(grandTotal / parseNum(elevationCount)) + '/elevation';
    if (breakdownType === 'per_unit' && parseNum(unitCount) > 0) return fmt(grandTotal / parseNum(unitCount)) + '/unit';
    return fmt(grandTotal);
  }

  // ─── Auto-save (debounced) ─────────────────────────────────────────────────

  const scheduleAutoSave = useCallback(() => {
    markDirty();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch('/api/service/quote/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            woNumber, laborSteps, driveTime, mainMaterials, consumables,
            freight, additionalCosts, markup, customerName, customerEmail,
            customerPhone, scopeNarrative, jobType,
          }),
        });
        setLastSaved(new Date().toISOString());
      } catch { /* silent */ } finally { setSaving(false); }
    }, 1500);
  }, [woNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Load a config into state ──────────────────────────────────────────────

  function applyConfig(config: QuoteConfig) {
    try {
      const labor = JSON.parse(config.labor_json || '[]') as LaborStep[];
      const mats = JSON.parse(config.materials_json || '{}');
      if (Array.isArray(labor) && labor.length > 0) setLaborSteps(labor.map(s => ({ ...s, id: s.id || uid() })));
      if (mats.mainMaterials) setMainMaterials(mats.mainMaterials.map((m: MaterialLine) => ({ ...m, id: m.id || uid() })));
      if (mats.consumables) setConsumables(mats.consumables.map((m: MaterialLine) => ({ ...m, id: m.id || uid() })));
      if (mats.freight) setFreight(mats.freight.map((m: MaterialLine) => ({ ...m, id: m.id || uid() })));
      if (mats.driveTime) setDriveTime(mats.driveTime);
      if (mats.additionalCosts) setAdditionalCosts(mats.additionalCosts.map((c: AdditionalCost) => ({ ...c, id: c.id || uid() })));
      if (mats.markup) setMarkup(mats.markup);
      if (mats.customerName !== undefined) setCustomerName(mats.customerName);
      if (mats.customerEmail !== undefined) setCustomerEmail(mats.customerEmail);
      if (mats.customerPhone !== undefined) setCustomerPhone(mats.customerPhone);
      if (mats.scopeNarrative !== undefined) setScopeNarrative(mats.scopeNarrative);
      if (mats.jobType !== undefined) setJobType(mats.jobType);
      if (mats.sqft !== undefined) setSqft(mats.sqft);
      if (mats.floorCount !== undefined) setFloorCount(mats.floorCount);
      if (mats.elevationCount !== undefined) setElevationCount(mats.elevationCount);
      if (mats.unitCount !== undefined) setUnitCount(mats.unitCount);
      setBreakdownType((config.breakdown_type as BreakdownType) || 'lump_sum');
      setActiveConfigId(config.config_id);
      setActiveVersion(parseInt(config.version) || 1);
      setHasUnsaved(false);
    } catch (e) {
      setError('Failed to load configuration: ' + String(e));
    }
  }

  // ─── Request load (with unsaved check) ────────────────────────────────────

  function requestLoadConfig(config: QuoteConfig) {
    if (hasUnsaved) {
      pendingLoadConfig.current = config;
      setShowUnsavedWarning(true);
    } else {
      applyConfig(config);
    }
  }

  // ─── Build config payload ──────────────────────────────────────────────────

  function buildConfigPayload(configName: string, breakdown: BreakdownType, notes: string) {
    return {
      job_id: woNumber,
      config_name: configName,
      total_amount: String(grandTotal.toFixed(2)),
      labor_json: JSON.stringify(laborSteps),
      materials_json: JSON.stringify({
        mainMaterials, consumables, freight, driveTime, additionalCosts, markup,
        customerName, customerEmail, customerPhone, scopeNarrative, jobType,
        sqft, floorCount, elevationCount, unitCount,
      }),
      markup_pct: markup.profitPct,
      get_rate: markup.getRate,
      overhead_method: markup.overheadPct ? `overhead_${markup.overheadPct}pct` : 'none',
      breakdown_type: breakdown,
      notes,
      created_by: 'mission-control',
    };
  }

  // ─── Save as new config ────────────────────────────────────────────────────

  async function handleSaveNew(configName: string, breakdown: BreakdownType, notes: string) {
    setConfigSaving(true);
    setShowSaveModal(false);
    try {
      const res = await fetch('/api/quote-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildConfigPayload(configName, breakdown, notes)),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setActiveConfigId(data.config_id);
      setActiveVersion(1);
      setHasUnsaved(false);
      setToast(`Configuration saved as v1`);
      // Reload configs
      const r2 = await fetch(`/api/quote-configs?job_id=${encodeURIComponent(woNumber)}`);
      const d2 = await r2.json();
      setConfigs(d2.configs || []);
    } catch (e) { setError(String(e)); }
    finally { setConfigSaving(false); }
  }

  // ─── Save as new version of active config ─────────────────────────────────

  async function handleSaveVersion() {
    if (!activeConfigId) { setShowSaveModal(true); return; }
    setConfigSaving(true);
    try {
      const activeConf = configs.find(c => c.config_id === activeConfigId);
      const res = await fetch('/api/quote-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: activeConfigId,
          ...buildConfigPayload(activeConf?.config_name || 'Config', breakdownType, ''),
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setActiveVersion(data.version);
      setHasUnsaved(false);
      setToast(`Saved as v${data.version}`);
      const r2 = await fetch(`/api/quote-configs?job_id=${encodeURIComponent(woNumber)}`);
      const d2 = await r2.json();
      setConfigs(d2.configs || []);
    } catch (e) { setError(String(e)); }
    finally { setConfigSaving(false); }
  }

  // ─── Duplicate config ──────────────────────────────────────────────────────

  async function handleDuplicate() {
    const activeConf = configs.find(c => c.config_id === activeConfigId);
    const newName = `${activeConf?.config_name || 'Config'} (copy)`;
    setConfigSaving(true);
    try {
      const res = await fetch('/api/quote-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildConfigPayload(newName, breakdownType, 'Duplicated')),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setToast(`Duplicated as "${newName}"`);
      const r2 = await fetch(`/api/quote-configs?job_id=${encodeURIComponent(woNumber)}`);
      const d2 = await r2.json();
      setConfigs(d2.configs || []);
    } catch (e) { setError(String(e)); }
    finally { setConfigSaving(false); }
  }

  // ─── Labor helpers ─────────────────────────────────────────────────────────

  function addLaborStep(preset?: Partial<LaborStep>) {
    setLaborSteps(prev => [...prev, {
      id: uid(), description: preset?.description || '', hours: '2', rate: '120', amountOverride: '', ...preset,
    }]);
    markDirty();
  }

  function updateLaborStep(id: string, patch: Partial<LaborStep>) {
    setLaborSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    scheduleAutoSave();
  }

  function removeLaborStep(id: string) {
    setLaborSteps(prev => prev.filter(s => s.id !== id));
    scheduleAutoSave();
  }

  // ─── Material helpers ──────────────────────────────────────────────────────

  function newMaterialLine(): MaterialLine {
    return { id: uid(), description: '', qty: '1', unit: 'ea', unitCost: '', totalOverride: '', width: '', height: '', length: '' };
  }

  function updateMaterial(setter: React.Dispatch<React.SetStateAction<MaterialLine[]>>, id: string, patch: Partial<MaterialLine>) {
    setter(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    scheduleAutoSave();
  }

  function removeMaterial(setter: React.Dispatch<React.SetStateAction<MaterialLine[]>>, id: string) {
    setter(prev => prev.filter(m => m.id !== id));
    scheduleAutoSave();
  }

  // ─── Generate quote ────────────────────────────────────────────────────────

  async function generateQuote() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/service/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woNumber,
          customerName, customerEmail, customerPhone,
          customerAddress: wo?.address,
          projectDescription: wo?.name,
          siteAddress: wo?.address,
          island: wo?.island,
          scopeNarrative,
          jobType,
          laborSteps: laborSteps.map(s => ({
            description: s.description,
            hours: parseNum(s.hours),
            rate: parseNum(s.rate),
            amount: laborStepAmount(s),
          })),
          driveTimeCost: driveTotal,
          driveTimeTrips: parseNum(driveTime.trips),
          driveTimeHoursPerTrip: parseNum(driveTime.hoursPerTrip),
          driveTimeRate: parseNum(driveTime.rate),
          materialsTotal: materialsSubtotal,
          additionalCosts: additionalCosts.filter(c => c.amount),
          additionalTotal,
          laborSubtotal,
          subtotal,
          overheadPct: parseNum(markup.overheadPct),
          overheadAmt,
          profitPct: parseNum(markup.profitPct),
          profitAmt,
          totalBeforeTax,
          getRate: parseNum(markup.getRate),
          getAmt,
          grandTotal,
          breakdownType,
          installationIncluded: true,
          crewCount: 1,
          hourlyRate: 120,
          equipmentCharges: additionalCosts.find(c => c.description.toLowerCase().includes('equipment'))?.amount || 0,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setQuote(data.quote); }
    } catch (e) { setError(String(e)); }
    setGenerating(false);
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const row: React.CSSProperties = { display: 'grid', gap: 8, marginBottom: 8 };
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3, display: 'block', fontFamily: FONT };

  // ─── Active config info ────────────────────────────────────────────────────

  const activeConf = configs.find(c => c.config_id === activeConfigId);
  const activeVersions = activeConf?.versions || [];

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading WO {woNumber}…</div>
    </div>
  );

  // ─── Quote Preview ─────────────────────────────────────────────────────────

  if (quote) return (
    <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Quote Ready</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>WO {woNumber}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setQuote(null)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>← Edit</button>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✕ Close</button>
          <button disabled={downloading} onClick={async () => {
            setDownloading(true);
            try {
              const res = await fetch('/api/service/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote, sendEmail: false }) });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `Proposal-WO-${woNumber}.pdf`; a.click();
              URL.revokeObjectURL(url);
            } catch (e) { alert('PDF failed: ' + e); }
            setDownloading(false);
          }} style={{ padding: '8px 16px', borderRadius: 10, background: downloading ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: downloading ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: downloading ? 'default' : 'pointer' }}>
            {downloading ? 'Generating…' : '⬇ Download PDF'}
          </button>
          <button disabled={emailing || !customerEmail} onClick={async () => {
            if (!customerEmail) { alert('No customer email'); return; }
            setEmailing(true);
            try {
              const res = await fetch('/api/service/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote, sendEmail: true }) });
              const data = await res.json();
              if (data.success) alert('Sent to ' + customerEmail); else alert('Failed: ' + data.error);
            } catch (e) { alert('Email failed: ' + e); }
            setEmailing(false);
          }} style={{ padding: '8px 16px', borderRadius: 10, background: emailing || !customerEmail ? '#e2e8f0' : '#4338ca', color: emailing || !customerEmail ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: emailing || !customerEmail ? 'default' : 'pointer' }}>
            {emailing ? 'Sending…' : '✉ Email Customer'}
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 12, borderBottom: '1px solid #0f766e22', paddingBottom: 6 }}>Pricing Summary</div>
        <SummaryRow label="Subtotal" value={subtotal} />
        {overheadAmt > 0 && <SummaryRow label={`Overhead (${markup.overheadPct}%)`} value={overheadAmt} sub />}
        {profitAmt > 0 && <SummaryRow label={`Profit (${markup.profitPct}%)`} value={profitAmt} sub />}
        <Divider />
        <SummaryRow label="Total Before Tax" value={totalBeforeTax} />
        <SummaryRow label={`GET (${markup.getRate}%)`} value={getAmt} sub />
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 18, fontWeight: 900, color: '#0f172a', fontFamily: FONT }}>
          <span>GRAND TOTAL</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal)}</span>
        </div>
        {breakdownType !== 'lump_sum' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 13, color: '#6366f1', fontWeight: 700, fontFamily: FONT }}>
            <span>Breakdown ({breakdownType.replace('_', ' ')})</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{breakdownDisplay()}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 13, color: '#0f766e', fontWeight: 700, fontFamily: FONT }}>
          <span>50% Deposit Required</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(deposit)}</span>
        </div>
      </div>

      <div style={{ background: '#f0fdfa', borderRadius: 12, border: '1px solid rgba(15,118,110,0.15)', padding: '14px 18px', fontSize: 12, color: '#0f766e', fontWeight: 600 }}>
        ✓ Quote ready — download PDF or email directly to customer using the buttons above.
      </div>
    </div>
  );

  // ─── Builder Form ──────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', fontFamily: FONT }}>

      {/* Modals */}
      {showSaveModal && (
        <SaveConfigModal
          onSave={handleSaveNew}
          onClose={() => setShowSaveModal(false)}
        />
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
      {showUnsavedWarning && (
        <UnsavedWarning
          onSave={() => {
            setShowUnsavedWarning(false);
            setShowSaveModal(true);
          }}
          onDiscard={() => {
            setShowUnsavedWarning(false);
            if (pendingLoadConfig.current) {
              applyConfig(pendingLoadConfig.current);
              pendingLoadConfig.current = null;
            }
          }}
          onCancel={() => {
            setShowUnsavedWarning(false);
            pendingLoadConfig.current = null;
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}

      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Service Quote</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>WO {woNumber} — {wo?.name?.substring(0, 45)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Saving…</span>}
          {!saving && lastSaved && <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>✓ Saved</span>}
          {hasUnsaved && activeConfigId && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>
              UNSAVED
            </span>
          )}
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      {/* ── CONFIGURATIONS BAR ─────────────────────────────────────────────── */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#fafafa', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>

          {/* Config selector dropdown */}
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <select
              value={activeConfigId || ''}
              onChange={e => {
                const conf = configs.find(c => c.config_id === e.target.value);
                if (conf) requestLoadConfig(conf);
              }}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 12, fontFamily: FONT,
                border: activeConfigId ? '1px solid rgba(99,102,241,0.4)' : '1px solid #e2e8f0',
                background: activeConfigId ? 'rgba(238,242,255,0.7)' : 'white',
                color: activeConfigId ? '#4338ca' : '#64748b',
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">
                {configsLoading ? 'Loading configs…' : configs.length === 0 ? 'No saved configs' : '— Load a configuration —'}
              </option>
              {configs.map(c => (
                <option key={c.config_id} value={c.config_id}>
                  {c.config_name} (v{c.version}) — {fmt(parseNum(c.total_amount))} · {fmtDate(c.created_at)}
                </option>
              ))}
            </select>
          </div>

          {/* Active config badge + version info */}
          {activeConf && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <VersionBadge version={activeVersion} />
              {activeVersions.length > 1 && (
                <button
                  onClick={() => setShowVersionHistory(v => !v)}
                  style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}
                >
                  {activeVersions.length} versions
                </button>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Save / Save Version */}
            {activeConfigId ? (
              <button
                onClick={handleSaveVersion}
                disabled={configSaving}
                style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none',
                  background: hasUnsaved ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                  color: hasUnsaved ? 'white' : '#94a3b8',
                  fontSize: 11, fontWeight: 700, cursor: hasUnsaved ? 'pointer' : 'default',
                  boxShadow: hasUnsaved ? '0 2px 8px rgba(15,118,110,0.25)' : 'none',
                }}
              >
                {configSaving ? 'Saving…' : '💾 Save'}
              </button>
            ) : (
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={configSaving}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,118,110,0.25)' }}
              >
                💾 Save Config
              </button>
            )}

            {/* Save As New */}
            {activeConfigId && (
              <button
                onClick={() => setShowSaveAsModal(true)}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(238,242,255,0.7)', color: '#4338ca', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                + Save As
              </button>
            )}

            {/* Duplicate */}
            {activeConfigId && (
              <button
                onClick={handleDuplicate}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(8,145,178,0.3)', background: 'rgba(224,242,254,0.7)', color: '#0369a1', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                title="Duplicate this config"
              >
                ⎘ Duplicate
              </button>
            )}

            {/* Compare */}
            {configs.length >= 2 && (
              <button
                onClick={() => setShowCompare(true)}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(109,40,217,0.3)', background: 'rgba(237,233,254,0.7)', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                ⇄ Compare
              </button>
            )}
          </div>
        </div>

        {/* Version history timeline */}
        {showVersionHistory && activeVersions.length > 1 && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'white', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6366f1', marginBottom: 8 }}>Version History</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...activeVersions].sort((a, b) => parseInt(b.version) - parseInt(a.version)).map((v, idx) => (
                <div key={v.version} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: idx < activeVersions.length - 1 ? '1px solid #f1f5f9' : undefined }}>
                  <VersionBadge version={v.version} />
                  <span style={{ fontSize: 11, color: '#0f172a', fontWeight: parseInt(v.version) === activeVersion ? 800 : 400 }}>
                    {fmt(parseNum(v.total_amount))}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmtDate(v.created_at)}</span>
                  {parseInt(v.version) === activeVersion && (
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: '#ecfdf5', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}>CURRENT</span>
                  )}
                  {parseInt(v.version) !== activeVersion && (
                    <button
                      onClick={() => { applyConfig(v); setShowVersionHistory(false); }}
                      style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c' }}>{error}</div>}

        {/* Pre-filled from estimate banner */}
        {estimatePrefillBanner && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.3)', fontSize: 12, color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✅ Pre-filled from Simple Estimate</span>
            <button onClick={() => setEstimatePrefillBanner(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 14 }}>×</button>
          </div>
        )}

        {/* Address + drive area banner */}
        {wo?.address && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(238,242,255,0.6)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 12, color: '#4338ca', fontWeight: 600 }}>
            📍 {wo.address} — <span style={{ opacity: 0.7 }}>{driveAreaLabel(wo.address)} · ~{lookupDriveHours(wo.address)}h/trip</span>
          </div>
        )}

        {/* ── CUSTOMER ─────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Customer Info" color="#0369a1" open={openSections.customer} onToggle={() => toggleSection('customer')} />
          {openSections.customer && (
            <div style={{ paddingTop: 10 }}>
              <div style={{ ...row, gridTemplateColumns: '1fr 1fr' }}>
                <div><label style={label}>Name</label><GreenInput value={customerName} onChange={v => { setCustomerName(v); markDirty(); }} placeholder="Customer / company" /></div>
                <div><label style={label}>Phone</label><GreenInput value={customerPhone} onChange={v => { setCustomerPhone(v); markDirty(); }} placeholder="808-XXX-XXXX" /></div>
              </div>
              <div><label style={label}>Email</label><GreenInput value={customerEmail} onChange={v => { setCustomerEmail(v); markDirty(); }} placeholder="customer@email.com" /></div>
            </div>
          )}
        </div>

        {/* ── SCOPE ────────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Scope of Work" color="#0f766e" open={openSections.scope} onToggle={() => toggleSection('scope')} />
          {openSections.scope && (
            <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={label}>Job Type</label>
                <select value={jobType} onChange={e => { setJobType(e.target.value); markDirty(); }} style={{ ...GREEN_INPUT, cursor: 'pointer', WebkitAppearance: 'none' }}>
                  <option value="">Select job type…</option>
                  {jobTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Scope Description</label>
                <textarea value={scopeNarrative} onChange={e => { setScopeNarrative(e.target.value); markDirty(); }} rows={3}
                  style={{ ...GREEN_INPUT, resize: 'none', lineHeight: '1.5' }} placeholder="Describe the full scope of work…" />
              </div>
            </div>
          )}
        </div>

        {/* ── JOB FILES ─────────────────────────────────────────────── */}
        <div>
          <input
            ref={quoteFileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files || []);
              setQuoteFiles(prev => [...prev, ...files]);
              e.target.value = '';
            }}
          />
          <div
            onDragOver={e => { e.preventDefault(); setQuoteFileDragging(true); }}
            onDragLeave={() => setQuoteFileDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setQuoteFileDragging(false);
              const files = Array.from(e.dataTransfer.files);
              setQuoteFiles(prev => [...prev, ...files]);
            }}
            onClick={() => quoteFileInputRef.current?.click()}
            style={{
              border: `2px dashed ${quoteFileDragging ? '#14b8a6' : '#cbd5e1'}`,
              borderRadius: 10,
              padding: '12px 16px',
              cursor: 'pointer',
              background: quoteFileDragging ? 'rgba(240,253,250,0.8)' : '#f8fafc',
              transition: 'border-color 0.15s, background 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>📎</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: quoteFileDragging ? '#0f766e' : '#64748b', fontFamily: FONT }}>
                Attach job files — photos, vendor quotes, plans
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, fontFamily: FONT }}>Drop files here or click to browse</div>
            </div>
            {quoteFiles.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: 'rgba(15,118,110,0.08)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(15,118,110,0.15)', flexShrink: 0 }}>
                {quoteFiles.length} file{quoteFiles.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {quoteFiles.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {quoteFiles.map((file, i) => {
                const isPDF = file.type === 'application/pdf';
                const isImage = file.type.startsWith('image/');
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'white', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 13 }}>{isPDF ? '📄' : isImage ? '🖼' : '📎'}</span>
                    <span style={{ flex: 1, fontSize: 12, color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{file.name}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(file.size / 1024).toFixed(0)} KB</span>
                    {isPDF && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#0369a1', background: '#eff6ff', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(3,105,161,0.2)', flexShrink: 0 }}>Analyze Quote</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setQuoteFiles(prev => prev.filter((_, j) => j !== i)); }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── LABOR ────────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Labor Steps" color="#4338ca" open={openSections.labor} onToggle={() => toggleSection('labor')} />
          {openSections.labor && (
            <div style={{ paddingTop: 10 }}>
              {wbBaselineHours !== null && wbBaselineHours > 0 && (
                <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(240,253,250,0.9)', border: '1px solid rgba(15,118,110,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                      📚 From Step Library
                    </div>
                    <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>
                      {wbBaselineHours.toFixed(1)}h baseline — {wbLaborLines.map(l => `${l.hours.toFixed(1)}h ${l.category}`).join(', ')}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Pre-filled from work breakdown. Adjust hours as needed.</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.2)', whiteSpace: 'nowrap' as const }}>
                    {fmt(wbBaselineHours * 120)} baseline
                  </span>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 28px', gap: 6, marginBottom: 4, padding: '0 2px' }}>
                {['Description', 'Hours', 'Rate/hr', 'Amount', ''].map(h => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</div>
                ))}
              </div>

              {laborSteps.map(step => {
                const autoAmt = parseNum(step.hours) * parseNum(step.rate);
                return (
                  <div key={step.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <GreenInput value={step.description} onChange={v => updateLaborStep(step.id, { description: v })} placeholder="Step description" />
                    <GreenInput value={step.hours} onChange={v => updateLaborStep(step.id, { hours: v, amountOverride: '' })} placeholder="hrs" type="number" step="0.5" min="0" style={{ textAlign: 'right' }} />
                    <GreenInput value={step.rate} onChange={v => updateLaborStep(step.id, { rate: v, amountOverride: '' })} placeholder="120" type="number" step="1" min="0" style={{ textAlign: 'right' }} />
                    <input
                      type="number" step="0.01" min="0"
                      value={step.amountOverride || fmtNum(autoAmt)}
                      onChange={e => updateLaborStep(step.id, { amountOverride: e.target.value })}
                      title={step.amountOverride ? 'MANUAL — click to reset' : 'Auto-calculated'}
                      style={{ ...ORANGE_DISPLAY, border: step.amountOverride ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(245,158,11,0.3)', background: step.amountOverride ? 'rgba(255,251,235,1)' : 'rgba(255,251,235,0.8)', cursor: 'text', textAlign: 'right' }}
                    />
                    <button onClick={() => removeLaborStep(step.id)} disabled={laborSteps.length <= 1}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: laborSteps.length <= 1 ? 'default' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: laborSteps.length <= 1 ? 0.3 : 1 }}>×</button>
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '6px 0 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Labor Subtotal</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#4338ca', fontVariantNumeric: 'tabular-nums' }}>{fmt(laborSubtotal)}</span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: '+ Spotting / Staging', desc: 'Spotting / Material Staging', hours: '1' },
                  { label: '+ Punch List / Return', desc: 'Punch List / Return Visit', hours: '2' },
                  { label: '+ Custom Step', desc: '', hours: '1' },
                ].map(preset => (
                  <button key={preset.label} onClick={() => addLaborStep({ description: preset.desc, hours: preset.hours, rate: '120' })}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(67,56,202,0.3)', background: 'rgba(238,242,255,0.7)', color: '#4338ca', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── DRIVE TIME ───────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Drive Time" color="#0891b2" open={openSections.driveTime} onToggle={() => toggleSection('driveTime')} />
          {openSections.driveTime && (
            <div style={{ paddingTop: 10 }}>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', fontSize: 11, color: '#0369a1', marginBottom: 10 }}>
                📍 Auto-calculated from shop (Kahului) to <strong>{wo?.address ? driveAreaLabel(wo.address) : 'job site'}</strong>
                {!driveTime.hoursManual && wo?.address && <> · {lookupDriveHours(wo.address)}h/trip estimated</>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div><label style={label}>Round Trips</label><GreenInput value={driveTime.trips} onChange={v => { setDriveTime(p => ({ ...p, trips: v, totalOverride: '' })); scheduleAutoSave(); }} type="number" min="1" step="1" style={{ textAlign: 'right' }} /></div>
                <div><label style={label}>Hrs / Trip</label><GreenInput value={driveTime.hoursPerTrip} onChange={v => { setDriveTime(p => ({ ...p, hoursPerTrip: v, hoursManual: true, totalOverride: '' })); scheduleAutoSave(); }} type="number" min="0" step="0.5" style={{ textAlign: 'right' }} /></div>
                <div><label style={label}>Rate / hr ($)</label><GreenInput value={driveTime.rate} onChange={v => { setDriveTime(p => ({ ...p, rate: v, totalOverride: '' })); scheduleAutoSave(); }} type="number" min="0" step="1" style={{ textAlign: 'right' }} /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>Total Drive Cost (override)</label>
                  <input type="number" step="0.01" min="0"
                    value={driveTime.totalOverride || fmtNum(parseNum(driveTime.trips) * parseNum(driveTime.hoursPerTrip) * parseNum(driveTime.rate))}
                    onChange={e => { setDriveTime(p => ({ ...p, totalOverride: e.target.value })); scheduleAutoSave(); }}
                    style={{ ...ORANGE_DISPLAY, border: driveTime.totalOverride ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(245,158,11,0.3)', cursor: 'text' }}
                  />
                </div>
                {driveTime.totalOverride && (
                  <button onClick={() => setDriveTime(p => ({ ...p, totalOverride: '' }))}
                    style={{ marginTop: 18, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(255,251,235,0.8)', color: '#d97706', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ↺ Reset
                  </button>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#0891b2', fontWeight: 700 }}>
                Drive time line item: {driveTime.trips} trips × {driveTime.hoursPerTrip}h × {fmt(parseNum(driveTime.rate))}/hr = <strong>{fmt(driveTotal)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* ── MATERIALS ────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Materials" color="#92400e" open={openSections.materials} onToggle={() => toggleSection('materials')} />
          {openSections.materials && (
            <div style={{ paddingTop: 10 }}>
              {[
                { title: 'Main Materials', subtitle: 'Glass, frames, hardware', items: mainMaterials, setter: setMainMaterials },
                { title: 'Consumables', subtitle: 'Caulking, tape, gaskets, fasteners, shims', items: consumables, setter: setConsumables },
                { title: 'Freight / Shipping', subtitle: 'Materials shipping costs', items: freight, setter: setFreight },
              ].map(({ title, subtitle, items, setter }) => (
                <div key={title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ textTransform: 'uppercase' }}>{title}</span>
                    <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>— {subtitle}</span>
                  </div>
                  {items.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 60px 80px 90px 28px', gap: 5, marginBottom: 3, padding: '0 2px' }}>
                      {['Description', 'Qty', 'Type', 'Unit $', 'Total', ''].map(h => (
                        <div key={h} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</div>
                      ))}
                    </div>
                  )}
                  {items.map(m => {
                    const effectiveUnitType = m.unitType || detectUnitType(m.description);
                    const autoTotal = materialLineTotal(m);
                    return (
                      <div key={m.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 60px 80px 90px 28px', gap: 5, alignItems: 'center' }}>
                          <GreenInput value={m.description} onChange={v => updateMaterial(setter, m.id, { description: v })} placeholder="Description" />
                          <GreenInput value={m.qty} onChange={v => updateMaterial(setter, m.id, { qty: v, totalOverride: '' })} type="number" min="0" step="1" style={{ textAlign: 'right' }} />
                          <select value={effectiveUnitType} onChange={e => updateMaterial(setter, m.id, { unitType: e.target.value as MaterialLine['unitType'], totalOverride: '' })}
                            style={{ ...GREEN_INPUT, cursor: 'pointer', textAlign: 'center', fontSize: 11, padding: '6px 4px' }}>
                            {(['SF', 'LF', 'EA', 'Tube'] as const).map(ut => <option key={ut} value={ut}>{ut}</option>)}
                          </select>
                          <GreenInput value={m.unitCost} onChange={v => updateMaterial(setter, m.id, { unitCost: v, totalOverride: '' })} placeholder="0.00" type="number" step="0.01" min="0" style={{ textAlign: 'right' }} />
                          <input type="number" step="0.01" min="0"
                            value={m.totalOverride || fmtNum(autoTotal)}
                            onChange={e => updateMaterial(setter, m.id, { totalOverride: e.target.value })}
                            style={{ ...ORANGE_DISPLAY, border: m.totalOverride ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(245,158,11,0.3)', cursor: 'text' }}
                          />
                          <button onClick={() => removeMaterial(setter, m.id)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        </div>
                        {effectiveUnitType === 'SF' && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', paddingLeft: 2 }}>
                            <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>W×H (in):</span>
                            <GreenInput value={m.width || ''} onChange={v => updateMaterial(setter, m.id, { width: v, totalOverride: '' })} placeholder="W" type="number" step="0.125" min="0" style={{ width: 64, textAlign: 'right' }} />
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>×</span>
                            <GreenInput value={m.height || ''} onChange={v => updateMaterial(setter, m.id, { height: v, totalOverride: '' })} placeholder="H" type="number" step="0.125" min="0" style={{ width: 64, textAlign: 'right' }} />
                            {(m.width && m.height) && (
                              <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>
                                = {((parseNum(m.width) * parseNum(m.height) / 144) * parseNum(m.qty || '1')).toFixed(2)} SF
                              </span>
                            )}
                          </div>
                        )}
                        {effectiveUnitType === 'LF' && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', paddingLeft: 2 }}>
                            <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>Length (ft):</span>
                            <GreenInput value={m.length || ''} onChange={v => updateMaterial(setter, m.id, { length: v, totalOverride: '' })} placeholder="ft" type="number" step="0.5" min="0" style={{ width: 80, textAlign: 'right' }} />
                            {m.length && (
                              <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>
                                × {m.qty || '1'} = {(parseNum(m.length) * parseNum(m.qty || '1')).toFixed(1)} LF
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => { setter(prev => [...prev, newMaterialLine()]); scheduleAutoSave(); }}
                    style={{ fontSize: 11, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '2px 0' }}>
                    + Add {title.toLowerCase()} line
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials Subtotal</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#92400e', fontVariantNumeric: 'tabular-nums' }}>{fmt(materialsSubtotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── ADDITIONAL COSTS ─────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Additional Costs" color="#6d28d9" open={openSections.additional} onToggle={() => toggleSection('additional')} />
          {openSections.additional && (
            <div style={{ paddingTop: 10 }}>
              {additionalCosts.map(c => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <GreenInput value={c.description} onChange={v => { setAdditionalCosts(prev => prev.map(x => x.id === c.id ? { ...x, description: v } : x)); scheduleAutoSave(); }} placeholder="Description" />
                  <GreenInput value={c.amount} onChange={v => { setAdditionalCosts(prev => prev.map(x => x.id === c.id ? { ...x, amount: v } : x)); scheduleAutoSave(); }} placeholder="0.00" type="number" step="0.01" min="0" style={{ textAlign: 'right' }} />
                  <button onClick={() => { setAdditionalCosts(prev => prev.filter(x => x.id !== c.id)); scheduleAutoSave(); }}
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {['Permits', 'After-hours Premium', 'Other'].map(preset => (
                  <button key={preset} onClick={() => { setAdditionalCosts(prev => [...prev, { id: uid(), description: preset, amount: '' }]); scheduleAutoSave(); }}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(109,40,217,0.25)', background: 'rgba(237,233,254,0.6)', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    + {preset}
                  </button>
                ))}
                <button onClick={() => { setAdditionalCosts(prev => [...prev, { id: uid(), description: '', amount: '' }]); scheduleAutoSave(); }}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(109,40,217,0.25)', background: 'rgba(237,233,254,0.6)', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  + Custom
                </button>
              </div>
              {additionalTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 4, borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Additional Subtotal</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#6d28d9', fontVariantNumeric: 'tabular-nums' }}>{fmt(additionalTotal)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SUMMARY ──────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Pricing Summary" color="#0f172a" open={openSections.summary} onToggle={() => toggleSection('summary')} />
          {openSections.summary && (
            <div style={{ paddingTop: 12 }}>
              {/* Markup controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div>
                  <label style={label}>Overhead (%)</label>
                  <GreenInput value={markup.overheadPct} onChange={v => { setMarkup(p => ({ ...p, overheadPct: v })); scheduleAutoSave(); }} type="number" min="0" step="1" placeholder="0" style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label style={label}>Profit (%)</label>
                  <GreenInput value={markup.profitPct} onChange={v => { setMarkup(p => ({ ...p, profitPct: v })); scheduleAutoSave(); }} type="number" min="0" step="0.5" placeholder="10" style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label style={label}>GET Rate (%)</label>
                  <GreenInput value={markup.getRate} onChange={v => { setMarkup(p => ({ ...p, getRate: v })); scheduleAutoSave(); }} type="number" min="0" step="0.01" placeholder="4.5" style={{ textAlign: 'right' }} />
                </div>
              </div>

              {/* Breakdown type + divisor inputs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div>
                  <label style={label}>Breakdown Type</label>
                  <select value={breakdownType} onChange={e => { setBreakdownType(e.target.value as BreakdownType); markDirty(); }}
                    style={{ ...GREEN_INPUT, cursor: 'pointer', WebkitAppearance: 'none' }}>
                    <option value="lump_sum">Lump Sum</option>
                    <option value="per_floor">Per Floor</option>
                    <option value="per_sqft">Per Sq Ft</option>
                    <option value="per_elevation">Per Elevation</option>
                    <option value="per_unit">Per Unit</option>
                  </select>
                </div>
                {breakdownType === 'per_sqft' && (
                  <div><label style={label}>Total Sq Ft</label><GreenInput value={sqft} onChange={v => { setSqft(v); markDirty(); }} type="number" min="1" placeholder="e.g. 5000" style={{ textAlign: 'right' }} /></div>
                )}
                {breakdownType === 'per_floor' && (
                  <div><label style={label}>Floor Count</label><GreenInput value={floorCount} onChange={v => { setFloorCount(v); markDirty(); }} type="number" min="1" placeholder="e.g. 4" style={{ textAlign: 'right' }} /></div>
                )}
                {breakdownType === 'per_elevation' && (
                  <div><label style={label}>Elevations</label><GreenInput value={elevationCount} onChange={v => { setElevationCount(v); markDirty(); }} type="number" min="1" placeholder="e.g. 4" style={{ textAlign: 'right' }} /></div>
                )}
                {breakdownType === 'per_unit' && (
                  <div><label style={label}>Unit Count</label><GreenInput value={unitCount} onChange={v => { setUnitCount(v); markDirty(); }} type="number" min="1" placeholder="e.g. 24" style={{ textAlign: 'right' }} /></div>
                )}
              </div>

              {/* Summary breakdown */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                <SummaryRow label="Materials Subtotal" value={materialsSubtotal} sub />
                <SummaryRow label="Labor Subtotal" value={laborSubtotal} sub />
                <SummaryRow label="Drive Time" value={driveTotal} sub />
                <SummaryRow label="Equipment & Other" value={additionalTotal} sub />
                <Divider />
                <SummaryRow label="Subtotal" value={subtotal} />
                {parseNum(markup.overheadPct) > 0 && <SummaryRow label={`Overhead @ ${markup.overheadPct}%`} value={overheadAmt} sub />}
                {parseNum(markup.profitPct) > 0 && <SummaryRow label={`Profit @ ${markup.profitPct}%`} value={profitAmt} sub />}
                <Divider />
                <SummaryRow label="Total Before Tax" value={totalBeforeTax} />
                <SummaryRow label={`GET @ ${markup.getRate}%`} value={getAmt} sub />
                <Divider />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: '#0f172a', marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>Grand Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>{fmt(grandTotal)}</span>
                </div>
                {breakdownType !== 'lump_sum' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px 0', fontSize: 12, fontWeight: 700, color: '#6366f1', fontFamily: FONT }}>
                    <span>Breakdown ({breakdownType.replace('_', ' ')})</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{breakdownDisplay()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px 0', fontSize: 12, fontWeight: 700, color: '#0f766e', fontFamily: FONT }}>
                  <span>50% Deposit Required</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(deposit)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
          Cancel
        </button>
        <button onClick={generateQuote} disabled={generating}
          style={{ flex: 2, padding: '11px', borderRadius: 12, background: generating ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: generating ? '#94a3b8' : 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer', boxShadow: generating ? 'none' : '0 4px 16px rgba(15,118,110,0.3)', fontFamily: FONT }}>
          {generating ? 'Generating…' : `Generate Quote — ${fmt(grandTotal)}`}
        </button>
      </div>
    </div>
  );
}
