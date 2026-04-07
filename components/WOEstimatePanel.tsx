'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { estimateDriveTime } from '@/lib/labor';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  amount: string;
}

interface LaborLine {
  description: string;
  hours: string;
  rate: string;
  amount: string;
}

interface WOEstimateData {
  aluminum: LineItem[];
  glass: LineItem[];
  misc: {
    caulking: string;
    tapeGasketsBlks: string;
    fasteners: string;
    shims: string;
    flashing: string;
    shopDrawings: string;
    travel: string;
    totalFreight: string;
  };
  miscExtra: LineItem[];
  other: {
    equipmentRental: string;
    misc: string;
    travel: string;
    freight: string;
  };
  otherExtra: LineItem[];
  labor: LaborLine[];
  driveTime: {
    trips: string;
    hoursPerTrip: string;
    rate: string;
  };
  markup: {
    overheadOverride: string;
    profitPct: string;
  };
  taxRate: string;
}

interface WorkOrder {
  id: string;
  name: string;
  island: string;
  systemType?: string;
  description?: string;
  contact?: string;
  address?: string;
}

interface WOEstimatePanelProps {
  wo: WorkOrder;
  onClose: () => void;
  onGenerateQuote: (woId: string, estimateTotals: EstimateTotals) => void;
}

export interface EstimateTotals {
  materialsTotal: number;
  laborSubtotal: number;
  overhead: number;
  profit: number;
  taxAmt: number;
  grandTotal: number;
  profitPct: number;
  taxRate: number;
}

// ─── GET rates by island ──────────────────────────────────────────────────────

const GET_RATES: Record<string, number> = {
  Oahu: 4.712,
  Maui: 4.17,
  Kauai: 4.5,
  Hawaii: 4.44,
};

function getGetRate(island: string): number {
  return GET_RATES[island] ?? 4.17;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';

const INP: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid rgba(20,184,166,0.3)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT,
  color: '#0f172a',
  background: 'rgba(240,253,244,0.7)',
  outline: 'none',
  boxSizing: 'border-box',
};

const SEC: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#64748b',
  borderBottom: '1px solid #f1f5f9',
  paddingBottom: 6,
  marginBottom: 10,
  marginTop: 2,
  display: 'block',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDollar(s: string): number {
  const n = parseFloat(s.replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sumItems(items: LineItem[]): number {
  return items.reduce((a, i) => a + parseDollar(i.amount), 0);
}

// ─── Default state factory ────────────────────────────────────────────────────

function defaultData(wo: WorkOrder): WOEstimateData {
  const driveEst = estimateDriveTime(wo.address || '', wo.island || 'Maui');
  return {
    aluminum: [{ description: '', amount: '' }],
    glass: [{ description: '', amount: '' }],
    misc: { caulking: '', tapeGasketsBlks: '', fasteners: '', shims: '', flashing: '', shopDrawings: '', travel: '', totalFreight: '' },
    miscExtra: [],
    other: { equipmentRental: '', misc: '', travel: '', freight: '' },
    otherExtra: [],
    labor: [
      { description: 'Fab Labor', hours: '', rate: '117', amount: '' },
      { description: 'Field Labor', hours: '', rate: '117', amount: '' },
    ],
    driveTime: {
      trips: '2',
      hoursPerTrip: String(driveEst.roundTripHours),
      rate: '117',
    },
    markup: { overheadOverride: '', profitPct: '10' },
    taxRate: String(getGetRate(wo.island)),
  };
}

// ─── Compact input components ─────────────────────────────────────────────────

function AmtInput({ value, onChange, placeholder = '0.00', width = 110 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={e => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => setFocused(false)}
      style={{
        width,
        padding: '5px 8px',
        border: focused ? '1px solid #14b8a6' : '1px solid rgba(20,184,166,0.3)',
        borderRadius: 7,
        fontSize: 12,
        fontFamily: FONT,
        fontVariantNumeric: 'tabular-nums',
        color: '#0f172a',
        background: focused ? '#f0fdf4' : 'rgba(240,253,244,0.7)',
        outline: 'none',
        textAlign: 'right',
        boxSizing: 'border-box',
      }}
    />
  );
}

function SmallNum({ value, onChange, placeholder, width = 44 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; width?: number;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={e => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => setFocused(false)}
      style={{
        width,
        padding: '4px 6px',
        border: focused ? '1px solid #14b8a6' : '1px solid rgba(20,184,166,0.3)',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: FONT,
        fontVariantNumeric: 'tabular-nums',
        color: '#0f172a',
        background: focused ? '#f0fdf4' : 'rgba(240,253,244,0.7)',
        outline: 'none',
        textAlign: 'right',
        boxSizing: 'border-box',
      }}
    />
  );
}

function DescInput({ value, onChange, placeholder = 'Description…' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        flex: 1,
        border: 'none',
        borderBottom: focused ? '1.5px solid #14b8a6' : '1px solid #e2e8f0',
        fontSize: 12,
        fontFamily: FONT,
        background: 'transparent',
        outline: 'none',
        color: '#0f172a',
        padding: '3px 0',
        minWidth: 0,
      }}
    />
  );
}

// ─── Row: description + amount ────────────────────────────────────────────────

function LineRow({ desc, amount, onDesc, onAmt, onRemove, showRemove }: {
  desc: string; amount: string;
  onDesc: (v: string) => void; onAmt: (v: string) => void;
  onRemove?: () => void; showRemove?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <DescInput value={desc} onChange={onDesc} />
      <AmtInput value={amount} onChange={onAmt} />
      {showRemove && (
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
      )}
    </div>
  );
}

// ─── Fixed label + amount ────────────────────────────────────────────────────

function FixedRow({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ flex: 1, fontSize: 12, color: '#374151', fontFamily: FONT }}>{label}</span>
      <AmtInput value={value} onChange={onChange} />
    </div>
  );
}

// ─── Subtotal display ────────────────────────────────────────────────────────

function SubtotalBar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', marginTop: 6, marginBottom: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>${fmt(value)}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WOEstimatePanel({ wo, onClose, onGenerateQuote }: WOEstimatePanelProps) {
  const [data, setData] = useState<WOEstimateData>(() => defaultData(wo));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load existing estimate ────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        // Use WO id as Bid_Version_ID (prefixed for uniqueness)
        const res = await fetch(`/api/service/estimate?wo=${encodeURIComponent(wo.id)}`);
        const json = await res.json();
        if (json.data) {
          const loaded = { ...defaultData(wo), ...json.data };
          if (!loaded.miscExtra) loaded.miscExtra = [];
          if (!loaded.otherExtra) loaded.otherExtra = [];
          if (!loaded.driveTime) loaded.driveTime = defaultData(wo).driveTime;
          setData(loaded);
          if (json.updatedAt) setLastSaved(json.updatedAt);
        } else {
          // Try to pre-populate Field Labor from Step Library
          try {
            const stRes = await fetch('/api/step-templates');
            const stJson = await stRes.json();
            if (stJson.templates && wo.systemType) {
              const systemTypes = wo.systemType.split(',').map((s: string) => s.trim()).filter(Boolean);
              let totalHours = 0;
              for (const st of systemTypes) {
                const key = Object.keys(stJson.templates).find(k => k.toLowerCase() === st.toLowerCase());
                if (key) {
                  totalHours += stJson.templates[key].reduce((sum: number, s: { default_hours: number }) => sum + s.default_hours, 0);
                }
              }
              if (totalHours > 0) {
                setData(prev => ({
                  ...prev,
                  labor: prev.labor.map(l =>
                    l.description === 'Field Labor'
                      ? { ...l, hours: totalHours.toFixed(2) }
                      : l
                  ),
                }));
              }
            }
          } catch {
            // Step library optional
          }
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [wo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-save (debounced) ────────────────────────────────────────────────

  const scheduleAutoSave = useCallback((nextData: WOEstimateData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      setSaveError('');
      try {
        const res = await fetch('/api/service/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ woId: wo.id, data: nextData }),
        });
        if (!res.ok) throw new Error('Save failed');
        setLastSaved(new Date().toISOString());
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [wo.id]);

  function update(fn: (d: WOEstimateData) => WOEstimateData) {
    setData(prev => {
      const next = fn(prev);
      scheduleAutoSave(next);
      return next;
    });
  }

  // ─── Labor helpers ────────────────────────────────────────────────────────

  function laborAmount(line: LaborLine): number {
    const h = parseFloat(line.hours) || 0;
    const r = parseFloat(line.rate) || 0;
    return line.amount ? parseDollar(line.amount) : h * r;
  }

  // ─── Derived totals ───────────────────────────────────────────────────────

  const metalSubtotal = sumItems(data.aluminum);
  const glassSubtotal = sumItems(data.glass);
  const miscSubtotal = Object.values(data.misc).reduce((a, v) => a + parseDollar(v), 0)
    + sumItems(data.miscExtra ?? []);
  const otherSubtotal = Object.values(data.other).reduce((a, v) => a + parseDollar(v), 0)
    + sumItems(data.otherExtra ?? []);
  const materialsTotal = metalSubtotal + glassSubtotal + miscSubtotal + otherSubtotal;

  const driveTimeTrips = parseFloat(data.driveTime?.trips) || 0;
  const driveTimeHoursPerTrip = parseFloat(data.driveTime?.hoursPerTrip) || 0;
  const driveTimeHours = driveTimeTrips * driveTimeHoursPerTrip;
  const driveTimeRate = parseFloat(data.driveTime?.rate) || 117;
  const driveTimeAmt = driveTimeHours * driveTimeRate;

  const laborSubtotal = data.labor.reduce((a, l) => a + laborAmount(l), 0) + driveTimeAmt;

  // X modifier (what-if negotiation tool — local state only, not saved)
  const [xAmount, setXAmount] = useState('');
  const xVal = parseDollar(xAmount);

  const overhead = data.markup.overheadOverride
    ? parseDollar(data.markup.overheadOverride)
    : laborSubtotal; // Kula Glass standard: overhead = labor

  const profitPct = parseFloat(data.markup.profitPct) / 100 || 0;
  const totalCostsBeforeProfit = materialsTotal + laborSubtotal + overhead;
  const profit = totalCostsBeforeProfit * profitPct;
  const totalCosts = totalCostsBeforeProfit + profit;

  const taxRate = parseFloat(data.taxRate) / 100 || 0;
  const taxAmt = totalCosts * taxRate;
  const grandTotal = totalCosts + taxAmt;

  const grossCost = materialsTotal + laborSubtotal;
  const currentMarkupPct = grossCost > 0 ? ((overhead + profit) / grossCost) * 100 : 0;
  const newProfit = profit + xVal;
  const newTotalCostsBeforeProfit2 = materialsTotal + laborSubtotal + overhead;
  const newTotalCosts2 = newTotalCostsBeforeProfit2 + newProfit;
  const newTaxAmt2 = newTotalCosts2 * taxRate;
  const newGrandTotal2 = newTotalCosts2 + newTaxAmt2;
  const newMarkupPct = grossCost > 0 ? ((overhead + newProfit) / grossCost) * 100 : 0;

  const estimateTotals: EstimateTotals = {
    materialsTotal,
    laborSubtotal,
    overhead,
    profit,
    taxAmt,
    grandTotal,
    profitPct: parseFloat(data.markup.profitPct) || 10,
    taxRate: parseFloat(data.taxRate) || getGetRate(wo.island),
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 500, backdropFilter: 'blur(2px)' }} />
        <div style={{ position: 'fixed', inset: '5vh 5vw', zIndex: 501, background: 'white', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 24px 80px rgba(15,23,42,0.2)' }}>
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading estimate…</div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 500, backdropFilter: 'blur(2px)' }} />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        inset: '3vh 3vw',
        zIndex: 501,
        background: '#f8fafc',
        borderRadius: 20,
        boxShadow: '0 24px 80px rgba(15,23,42,0.22)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px 12px',
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'white', letterSpacing: '-0.01em' }}>
              Simple Estimate
            </div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.8)', marginTop: 2 }}>
              {wo.name} · {wo.island}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {saving && (
              <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.8)', fontWeight: 600 }}>Saving…</span>
            )}
            {!saving && lastSaved && (
              <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700, background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(52,211,153,0.2)' }}>✓ Saved</span>
            )}
            {saveError && (
              <span style={{ fontSize: 10, color: '#fca5a5', fontWeight: 600 }}>⚠ {saveError}</span>
            )}
            <button
              onClick={onClose}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
            >×</button>
          </div>
        </div>

        {/* Body — two columns */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1000, margin: '0 auto' }}>

            {/* ── LEFT COLUMN: Materials ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Aluminum */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Aluminum</span>
                {data.aluminum.map((item, i) => (
                  <LineRow key={i} desc={item.description} amount={item.amount}
                    onDesc={v => update(d => ({ ...d, aluminum: d.aluminum.map((x, j) => j === i ? { ...x, description: v } : x) }))}
                    onAmt={v => update(d => ({ ...d, aluminum: d.aluminum.map((x, j) => j === i ? { ...x, amount: v } : x) }))}
                    showRemove={data.aluminum.length > 1}
                    onRemove={() => update(d => ({ ...d, aluminum: d.aluminum.filter((_, j) => j !== i) }))}
                  />
                ))}
                <button onClick={() => update(d => ({ ...d, aluminum: [...d.aluminum, { description: '', amount: '' }] }))} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}>+ add line</button>
                <SubtotalBar label="Metal Subtotal" value={metalSubtotal} />
              </div>

              {/* Glass */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Glass</span>
                {data.glass.map((item, i) => (
                  <LineRow key={i} desc={item.description} amount={item.amount}
                    onDesc={v => update(d => ({ ...d, glass: d.glass.map((x, j) => j === i ? { ...x, description: v } : x) }))}
                    onAmt={v => update(d => ({ ...d, glass: d.glass.map((x, j) => j === i ? { ...x, amount: v } : x) }))}
                    showRemove={data.glass.length > 1}
                    onRemove={() => update(d => ({ ...d, glass: d.glass.filter((_, j) => j !== i) }))}
                  />
                ))}
                <button onClick={() => update(d => ({ ...d, glass: [...d.glass, { description: '', amount: '' }] }))} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}>+ add line</button>
                <SubtotalBar label="Glass Subtotal" value={glassSubtotal} />
              </div>

              {/* Misc Materials */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Misc Materials</span>
                {([
                  ['caulking', 'Caulking'],
                  ['tapeGasketsBlks', 'Tape / Gaskets / Blks'],
                  ['fasteners', 'Fasteners'],
                  ['shims', 'Shims'],
                  ['flashing', 'Flashing'],
                  ['shopDrawings', 'Shop Drawings'],
                  ['travel', 'Travel'],
                  ['totalFreight', 'Freight'],
                ] as [keyof WOEstimateData['misc'], string][]).map(([key, label]) => (
                  <FixedRow key={key} label={label} value={data.misc[key]}
                    onChange={v => update(d => ({ ...d, misc: { ...d.misc, [key]: v } }))} />
                ))}
                {(data.miscExtra ?? []).map((item, i) => (
                  <LineRow key={i} desc={item.description} amount={item.amount}
                    onDesc={v => update(d => ({ ...d, miscExtra: (d.miscExtra ?? []).map((x, j) => j === i ? { ...x, description: v } : x) }))}
                    onAmt={v => update(d => ({ ...d, miscExtra: (d.miscExtra ?? []).map((x, j) => j === i ? { ...x, amount: v } : x) }))}
                    showRemove
                    onRemove={() => update(d => ({ ...d, miscExtra: (d.miscExtra ?? []).filter((_, j) => j !== i) }))}
                  />
                ))}
                <button onClick={() => update(d => ({ ...d, miscExtra: [...(d.miscExtra ?? []), { description: '', amount: '' }] }))} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}>+ add misc item</button>
                <SubtotalBar label="Misc Subtotal" value={miscSubtotal} />
              </div>

              {/* Other Costs */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Other Costs</span>
                {([
                  ['equipmentRental', 'Equipment Rental'],
                  ['misc', 'Misc'],
                  ['travel', 'Travel'],
                  ['freight', 'Freight'],
                ] as [keyof WOEstimateData['other'], string][]).map(([key, label]) => (
                  <FixedRow key={key} label={label} value={data.other[key]}
                    onChange={v => update(d => ({ ...d, other: { ...d.other, [key]: v } }))} />
                ))}
                {(data.otherExtra ?? []).map((item, i) => (
                  <LineRow key={i} desc={item.description} amount={item.amount}
                    onDesc={v => update(d => ({ ...d, otherExtra: (d.otherExtra ?? []).map((x, j) => j === i ? { ...x, description: v } : x) }))}
                    onAmt={v => update(d => ({ ...d, otherExtra: (d.otherExtra ?? []).map((x, j) => j === i ? { ...x, amount: v } : x) }))}
                    showRemove
                    onRemove={() => update(d => ({ ...d, otherExtra: (d.otherExtra ?? []).filter((_, j) => j !== i) }))}
                  />
                ))}
                <button onClick={() => update(d => ({ ...d, otherExtra: [...(d.otherExtra ?? []), { description: '', amount: '' }] }))} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}>+ add cost item</button>
                <SubtotalBar label="Other Subtotal" value={otherSubtotal} />
              </div>

            </div>

            {/* ── RIGHT COLUMN: Labor + Markup + Totals ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Labor */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Labor</span>
                {data.labor.map((line, i) => (
                  <div key={i} style={{ marginBottom: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <DescInput value={line.description} onChange={v => update(d => ({ ...d, labor: d.labor.map((l, j) => j === i ? { ...l, description: v } : l) }))} placeholder="Labor description…" />
                      {data.labor.length > 1 && (
                        <button onClick={() => update(d => ({ ...d, labor: d.labor.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <SmallNum
                        value={line.hours}
                        onChange={v => update(d => ({ ...d, labor: d.labor.map((l, j) => j === i ? { ...l, hours: v, amount: '' } : l) }))}
                        placeholder="hrs"
                        width={52}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>hrs @</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>$</span>
                      <SmallNum
                        value={line.rate}
                        onChange={v => update(d => ({ ...d, labor: d.labor.map((l, j) => j === i ? { ...l, rate: v, amount: '' } : l) }))}
                        width={52}
                      />
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>/hr</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
                        ${fmt(laborAmount(line))}
                      </span>
                    </div>
                  </div>
                ))}
                <button onClick={() => update(d => ({ ...d, labor: [...d.labor, { description: '', hours: '', rate: '117', amount: '' }] }))} style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}>+ add labor line</button>

                {/* Drive Time */}
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(20,184,166,0.05)', borderRadius: 8, border: '1px solid rgba(20,184,166,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 6 }}>Drive Time</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <SmallNum
                      value={data.driveTime?.trips || '2'}
                      onChange={v => update(d => ({ ...d, driveTime: { ...(d.driveTime || { hoursPerTrip: '0', rate: '117' }), trips: v } }))}
                      placeholder="2"
                      width={40}
                    />
                    <span style={{ fontSize: 11, color: '#64748b' }}>trips ×</span>
                    <SmallNum
                      value={data.driveTime?.hoursPerTrip || '0'}
                      onChange={v => update(d => ({ ...d, driveTime: { ...(d.driveTime || { trips: '2', rate: '117' }), hoursPerTrip: v } }))}
                      placeholder="hrs"
                      width={48}
                    />
                    <span style={{ fontSize: 11, color: '#64748b' }}>h/trip @</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>$</span>
                    <SmallNum
                      value={data.driveTime?.rate || '117'}
                      onChange={v => update(d => ({ ...d, driveTime: { ...(d.driveTime || { trips: '2', hoursPerTrip: '0' }), rate: v } }))}
                      width={52}
                    />
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>/hr</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>${fmt(driveTimeAmt)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                    {driveTimeTrips} trips × {driveTimeHoursPerTrip}h = {fmt(driveTimeHours)}h total drive
                  </div>
                </div>

                <SubtotalBar label="Labor Subtotal" value={laborSubtotal} />
              </div>

              {/* Markup */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Markup</span>

                {/* Overhead */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Overhead {!data.markup.overheadOverride && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>(= labor)</span>}</span>
                    {data.markup.overheadOverride && (
                      <button onClick={() => update(d => ({ ...d, markup: { ...d.markup, overheadOverride: '' } }))} style={{ fontSize: 10, color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↺ auto</button>
                    )}
                  </div>
                  <AmtInput
                    value={data.markup.overheadOverride}
                    onChange={v => update(d => ({ ...d, markup: { ...d.markup, overheadOverride: v } }))}
                    placeholder={fmt(laborSubtotal)}
                    width="100%"
                  />
                </div>

                {/* Profit */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Profit %</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SmallNum value={data.markup.profitPct} onChange={v => update(d => ({ ...d, markup: { ...d.markup, profitPct: v } }))} width={60} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>% → <span style={{ fontWeight: 700, color: '#0f766e' }}>${fmt(profit)}</span></span>
                  </div>
                </div>

                {/* GET */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    GET Rate — {wo.island}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SmallNum value={data.taxRate} onChange={v => update(d => ({ ...d, taxRate: v }))} width={60} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>% → <span style={{ fontWeight: 700, color: '#0f766e' }}>${fmt(taxAmt)}</span></span>
                  </div>
                </div>
              </div>

              {/* Totals summary */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14 }}>
                <span style={SEC}>Summary</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Materials', value: materialsTotal },
                    { label: 'Labor', value: laborSubtotal },
                    { label: 'Overhead', value: overhead },
                    { label: `Profit (${data.markup.profitPct}%)`, value: profit },
                    { label: `GET (${data.taxRate}%)`, value: taxAmt },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: FONT }}>
                      <span style={{ color: '#64748b' }}>{label}</span>
                      <span style={{ fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>${fmt(value)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', fontFamily: FONT }}>Grand Total</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', fontFamily: FONT, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>${fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Markup info pill */}
              <div style={{ padding: '10px 14px', background: 'rgba(15,118,110,0.06)', border: '1px solid rgba(15,118,110,0.15)', borderRadius: 10, fontSize: 11, color: '#0f766e' }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Overhead = Labor (Kula Glass standard)</div>
                <div style={{ color: '#475569' }}>Customer quote will hide overhead &amp; profit breakdown. Quote total = ${fmt(grandTotal)}</div>
              </div>

              {/* X Modifier / What-If */}
              <div style={{ background: 'white', borderRadius: 12, border: '1px solid rgba(20,184,166,0.25)', padding: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 10 }}>🧠 What-If / Negotiation Tool</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#475569', fontFamily: FONT }}>Current Mark-Up = (OH + Profit) / Gross Cost</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>{currentMarkupPct.toFixed(2)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 12, color: '#475569', fontFamily: FONT, flexShrink: 0 }}>If profit adjusted by X =</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AmtInput value={xAmount} onChange={setXAmount} placeholder="-2000" width={120} />
                      {xAmount && (
                        <button onClick={() => setXAmount('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>×</button>
                      )}
                    </div>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(20,184,166,0.2)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>New Mark-Up %</div>
                      <div style={{ fontSize: 18, fontWeight: 900, fontFamily: FONT, color: xVal < 0 ? '#dc2626' : xVal > 0 ? '#16a34a' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {newMarkupPct.toFixed(2)}%
                        {xVal !== 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, color: xVal < 0 ? '#dc2626' : '#16a34a' }}>
                            ({xVal > 0 ? '+' : ''}{(newMarkupPct - currentMarkupPct).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>New Total</div>
                      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: FONT, color: xVal < 0 ? '#dc2626' : xVal > 0 ? '#16a34a' : '#0f172a', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                        ${fmt(newGrandTotal2)}
                        {xVal !== 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 6, color: xVal < 0 ? '#dc2626' : '#16a34a' }}>
                            ({xVal > 0 ? '+' : ''}${fmt(newGrandTotal2 - grandTotal)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer: Generate Quote button */}
        <div style={{
          flexShrink: 0,
          padding: '12px 20px',
          background: 'white',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            Estimate total: <strong style={{ color: '#0f172a' }}>${fmt(grandTotal)}</strong>
            <span style={{ marginLeft: 12, fontSize: 11, color: '#94a3b8' }}>
              (Materials ${fmt(materialsTotal)} + Labor ${fmt(laborSubtotal)} + OH ${fmt(overhead)} + Profit ${fmt(profit)} + GET ${fmt(taxAmt)})
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Close
            </button>
            <button
              onClick={() => window.print()}
              style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#0f172a', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              🖨 Print
            </button>
            <button
              onClick={() => {
                // Save first, then open quote
                if (saveTimer.current) clearTimeout(saveTimer.current);
                fetch('/api/service/estimate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ woId: wo.id, data }),
                }).finally(() => {
                  onGenerateQuote(wo.id, estimateTotals);
                });
              }}
              style={{
                padding: '9px 22px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#0f766e,#14b8a6)',
                color: 'white',
                border: 'none',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(15,118,110,0.3)',
              }}
            >
              Generate Quote →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
