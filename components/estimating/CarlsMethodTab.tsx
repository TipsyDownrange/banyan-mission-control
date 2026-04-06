'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { BidSummary } from '@/components/estimating/EstimatingWorkspace';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  description: string;
  amount: string; // editable dollar string
}

interface LaborLine {
  byWhom: string;   // "___" / "Kula" / "Field"
  hours: string;
  rate: string;
  amount: string;
}

interface CarlsData {
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
  other: {
    equipmentRental: string;
    misc: string;
    travel: string;
    freight: string;
  };
  labor: LaborLine[];
  markup: {
    overheadOverride: string; // blank = auto (= labor subtotal)
    profitPct: string;
  };
  taxRate: string; // GET %
}

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

// ─── Default state ────────────────────────────────────────────────────────────

function defaultData(bid: BidSummary): CarlsData {
  return {
    aluminum: [{ description: '', amount: '' }],
    glass: [{ description: '', amount: '' }],
    misc: {
      caulking: '',
      tapeGasketsBlks: '',
      fasteners: '',
      shims: '',
      flashing: '',
      shopDrawings: '',
      travel: '',
      totalFreight: '',
    },
    other: {
      equipmentRental: '',
      misc: '',
      travel: '',
      freight: '',
    },
    labor: [
      { byWhom: '___', hours: '', rate: '117', amount: '' },
      { byWhom: 'Kula', hours: '', rate: '117', amount: '' },
      { byWhom: 'Field', hours: '', rate: '117', amount: '' },
    ],
    markup: {
      overheadOverride: '',
      profitPct: bid.profitPct ? (parseFloat(bid.profitPct) * 100).toFixed(1) : '10',
    },
    taxRate: bid.getRate ? (parseFloat(bid.getRate) * 100).toFixed(2) : '4.50',
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DollarInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
}

function DollarInput({ value, onChange, placeholder = '0.00', width = 120 }: DollarInputProps) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width,
        padding: '3px 6px',
        border: '1px solid rgba(21,128,61,0.35)',
        borderRadius: 4,
        fontSize: 13,
        fontFamily: '"Courier New", Courier, monospace',
        color: '#14532d',
        background: 'rgba(240,253,244,0.8)',
        outline: 'none',
        textAlign: 'right',
        boxSizing: 'border-box',
      }}
      onFocus={e => e.currentTarget.select()}
    />
  );
}

function SubtotalRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td colSpan={2} />
      <td style={{ textAlign: 'right', paddingTop: 6, paddingBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '0.05em' }}>
          {label} =
        </span>
      </td>
      <td style={{ textAlign: 'right', paddingLeft: 8, paddingTop: 6, paddingBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', fontFamily: '"Courier New", Courier, monospace' }}>
          ${fmt(value)}
        </span>
      </td>
    </tr>
  );
}

function GrandTotalRow({ label, value, color = '#0f172a', size = 14 }: {
  label: string; value: number; color?: string; size?: number;
}) {
  return (
    <tr>
      <td colSpan={2} />
      <td colSpan={2} style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '2px solid #334155',
          paddingTop: 6,
        }}>
          <span style={{ fontSize: size - 1, fontWeight: 800, color, letterSpacing: '0.04em' }}>
            {label} =
          </span>
          <span style={{ fontSize: size, fontWeight: 900, color, fontFamily: '"Courier New", Courier, monospace' }}>
            ${fmt(value)}
          </span>
        </div>
      </td>
    </tr>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={4} style={{ paddingTop: 18, paddingBottom: 4 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: '#334155',
          borderBottom: '1.5px solid #334155',
          paddingBottom: 4,
        }}>
          {children}
        </div>
      </td>
    </tr>
  );
}

function MarketCell({ market }: { market?: string }) {
  return (
    <td style={{
      width: 100,
      fontSize: 10,
      color: '#cbd5e1',
      fontStyle: 'italic',
      textAlign: 'right',
      paddingLeft: 8,
    }}>
      {market ?? '—'}
    </td>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface CarlsMethodTabProps {
  bid: BidSummary;
}

export default function CarlsMethodTab({ bid }: CarlsMethodTabProps) {
  const [data, setData] = useState<CarlsData>(() => defaultData(bid));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/estimating/carls-method?bidVersionId=${bid.bidVersionId}`);
        const json = await res.json();
        if (json.data) {
          setData({ ...defaultData(bid), ...json.data });
          if (json.updatedAt) setLastSaved(json.updatedAt);
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bid.bidVersionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Auto-save (debounced) ──────────────────────────────────────────────────

  const scheduleAutoSave = useCallback((nextData: CarlsData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch('/api/estimating/carls-method', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bidVersionId: bid.bidVersionId, data: nextData }),
        });
        setLastSaved(new Date().toISOString());
      } catch {
        // silent
      } finally {
        setSaving(false);
      }
    }, 1500);
  }, [bid.bidVersionId]);

  function update(fn: (d: CarlsData) => CarlsData) {
    setData(prev => {
      const next = fn(prev);
      scheduleAutoSave(next);
      return next;
    });
  }

  // ─── Labor auto-calc ────────────────────────────────────────────────────────

  function laborAmount(line: LaborLine): number {
    const h = parseFloat(line.hours) || 0;
    const r = parseFloat(line.rate) || 0;
    return line.amount ? parseDollar(line.amount) : h * r;
  }

  // ─── Derived totals ──────────────────────────────────────────────────────────

  const metalSubtotal = sumItems(data.aluminum);
  const glassSubtotal = sumItems(data.glass);
  const miscSubtotal = Object.values(data.misc).reduce((a, v) => a + parseDollar(v), 0);
  const otherSubtotal = Object.values(data.other).reduce((a, v) => a + parseDollar(v), 0);
  const grandTotalMaterials = metalSubtotal + glassSubtotal + miscSubtotal + otherSubtotal;

  const laborSubtotal = data.labor.reduce((a, l) => a + laborAmount(l), 0);

  const overhead = data.markup.overheadOverride
    ? parseDollar(data.markup.overheadOverride)
    : laborSubtotal;

  const profitPct = parseFloat(data.markup.profitPct) / 100 || 0;
  const totalCostsBeforeProfit = grandTotalMaterials + laborSubtotal + overhead;
  const profit = totalCostsBeforeProfit * profitPct;
  const totalCosts = totalCostsBeforeProfit + profit;

  const taxRate = parseFloat(data.taxRate) / 100 || 0;
  const taxAmt = totalCosts * taxRate;
  const grandTotal = totalCosts + taxAmt;

  // ─── PDF Export ──────────────────────────────────────────────────────────────

  function handlePrintPDF() {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #carls-print-area, #carls-print-area * { visibility: visible !important; }
        #carls-print-area { position: fixed; inset: 0; padding: 32px; background: white !important; }
        @page { margin: 0.75in; size: letter; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.head.removeChild(style), 1000);
  }

  // ─── Formatted date ──────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        Loading estimate…
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: 960 }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>Carl&apos;s Method</span>
          {saving ? (
            <span style={{ fontSize: 10, color: '#94a3b8' }}>Saving…</span>
          ) : lastSaved ? (
            <span style={{ fontSize: 10, color: '#16a34a' }}>✓ Saved</span>
          ) : null}
        </div>
        <button
          onClick={handlePrintPDF}
          style={{
            padding: '8px 18px',
            borderRadius: 999,
            background: '#0f172a',
            color: 'white',
            border: 'none',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          🖨 Export PDF
        </button>
      </div>

      {/* The Estimate Sheet */}
      <div
        id="carls-print-area"
        style={{
          background: '#fefefe',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '32px 36px',
          fontFamily: '"Times New Roman", Times, serif',
          boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
        }}
      >

        {/* Company Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', color: '#0f172a', textTransform: 'uppercase' }}>
            Kula Glass Co., Inc.
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#475569', textTransform: 'uppercase', marginTop: 2 }}>
            Estimate Form
          </div>
          <div style={{ borderBottom: '2px solid #334155', marginTop: 10 }} />
        </div>

        {/* Header Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', marginBottom: 24, fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, color: '#475569', minWidth: 90, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Job Name:</span>
            <span style={{ fontFamily: '"Courier New", Courier, monospace', color: '#0f172a', fontWeight: 700 }}>{bid.projectName || '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, color: '#475569', minWidth: 60, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Date:</span>
            <span style={{ fontFamily: '"Courier New", Courier, monospace', color: '#0f172a' }}>{bid.bidDate || today}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, color: '#475569', minWidth: 90, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Location:</span>
            <span style={{ fontFamily: '"Courier New", Courier, monospace', color: '#0f172a', fontWeight: 700 }}>{bid.island || '—'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, color: '#475569', minWidth: 60, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em' }}>Estimator:</span>
            <span style={{ fontFamily: '"Courier New", Courier, monospace', color: '#0f172a' }}>{bid.estimator || '—'}</span>
          </div>
        </div>

        {/* Column Headers */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid #334155' }}>
              <th style={{ textAlign: 'left', paddingBottom: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#475569', width: '38%' }}>
                Item Description
              </th>
              <th style={{ textAlign: 'left', paddingBottom: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#475569', width: '25%' }}>
                Notes
              </th>
              <th style={{ textAlign: 'right', paddingBottom: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#cbd5e1', width: 100 }}>
                Market
              </th>
              <th style={{ textAlign: 'right', paddingBottom: 6, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#475569', width: 130 }}>
                Cost
              </th>
            </tr>
          </thead>
          <tbody>

            {/* ── ALUMINUM ── */}
            <SectionHeader>Aluminum</SectionHeader>
            {data.aluminum.map((item, i) => (
              <tr key={i}>
                <td style={{ paddingTop: 4, paddingBottom: 4, paddingRight: 8, verticalAlign: 'middle' }}>
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => update(d => ({
                      ...d,
                      aluminum: d.aluminum.map((x, j) => j === i ? { ...x, description: e.target.value } : x),
                    }))}
                    placeholder="Description…"
                    style={{
                      width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0',
                      fontSize: 12, fontFamily: '"Courier New", Courier, monospace',
                      background: 'transparent', outline: 'none', color: '#0f172a', padding: '2px 0',
                    }}
                  />
                </td>
                <td />
                <MarketCell />
                <td style={{ textAlign: 'right', paddingTop: 4, paddingBottom: 4 }}>
                  <DollarInput
                    value={item.amount}
                    onChange={v => update(d => ({
                      ...d,
                      aluminum: d.aluminum.map((x, j) => j === i ? { ...x, amount: v } : x),
                    }))}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 4 }}>
                <button
                  onClick={() => update(d => ({ ...d, aluminum: [...d.aluminum, { description: '', amount: '' }] }))}
                  style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  + add line
                </button>
              </td>
            </tr>
            <SubtotalRow label="Metal Subtotal" value={metalSubtotal} />

            {/* ── GLASS ── */}
            <SectionHeader>Glass</SectionHeader>
            {data.glass.map((item, i) => (
              <tr key={i}>
                <td style={{ paddingTop: 4, paddingBottom: 4, paddingRight: 8, verticalAlign: 'middle' }}>
                  <input
                    type="text"
                    value={item.description}
                    onChange={e => update(d => ({
                      ...d,
                      glass: d.glass.map((x, j) => j === i ? { ...x, description: e.target.value } : x),
                    }))}
                    placeholder="Description…"
                    style={{
                      width: '100%', border: 'none', borderBottom: '1px solid #e2e8f0',
                      fontSize: 12, fontFamily: '"Courier New", Courier, monospace',
                      background: 'transparent', outline: 'none', color: '#0f172a', padding: '2px 0',
                    }}
                  />
                </td>
                <td />
                <MarketCell />
                <td style={{ textAlign: 'right', paddingTop: 4, paddingBottom: 4 }}>
                  <DollarInput
                    value={item.amount}
                    onChange={v => update(d => ({
                      ...d,
                      glass: d.glass.map((x, j) => j === i ? { ...x, amount: v } : x),
                    }))}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 4 }}>
                <button
                  onClick={() => update(d => ({ ...d, glass: [...d.glass, { description: '', amount: '' }] }))}
                  style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  + add line
                </button>
              </td>
            </tr>
            <SubtotalRow label="Glass Subtotal" value={glassSubtotal} />

            {/* ── MISC MATERIALS ── */}
            <SectionHeader>Misc Materials</SectionHeader>
            {([
              ['caulking',       'Caulking'],
              ['tapeGasketsBlks','Tape, Gaskets, Blks, etc.'],
              ['fasteners',      'Fasteners'],
              ['shims',          'Shims'],
              ['flashing',       'Flashing'],
              ['shopDrawings',   'Shop Drawings / Structural Calcs'],
              ['travel',         'Travel'],
              ['totalFreight',   'Total Freight'],
            ] as [keyof CarlsData['misc'], string][]).map(([key, label]) => (
              <tr key={key}>
                <td style={{ paddingTop: 3, paddingBottom: 3, paddingRight: 8, fontSize: 12, color: '#374151', fontFamily: '"Courier New", Courier, monospace' }}>
                  {label}
                </td>
                <td />
                <MarketCell />
                <td style={{ textAlign: 'right', paddingTop: 3, paddingBottom: 3 }}>
                  <DollarInput
                    value={data.misc[key]}
                    onChange={v => update(d => ({ ...d, misc: { ...d.misc, [key]: v } }))}
                  />
                </td>
              </tr>
            ))}
            <SubtotalRow label="Misc Subtotal" value={miscSubtotal} />

            {/* ── OTHER COST ITEMS ── */}
            <SectionHeader>Other Cost Items</SectionHeader>
            {([
              ['equipmentRental', 'Equipment Rental'],
              ['misc',            'Misc'],
              ['travel',          'Travel'],
              ['freight',         'Freight (misc)'],
            ] as [keyof CarlsData['other'], string][]).map(([key, label]) => (
              <tr key={key}>
                <td style={{ paddingTop: 3, paddingBottom: 3, paddingRight: 8, fontSize: 12, color: '#374151', fontFamily: '"Courier New", Courier, monospace' }}>
                  {label}
                </td>
                <td />
                <MarketCell />
                <td style={{ textAlign: 'right', paddingTop: 3, paddingBottom: 3 }}>
                  <DollarInput
                    value={data.other[key]}
                    onChange={v => update(d => ({ ...d, other: { ...d.other, [key]: v } }))}
                  />
                </td>
              </tr>
            ))}

            {/* Grand Total Materials */}
            <GrandTotalRow label="Grand Total Materials" value={grandTotalMaterials} color="#0f172a" />

            {/* ── LABOR ── */}
            <SectionHeader>Labor</SectionHeader>
            {data.labor.map((line, i) => (
              <tr key={i}>
                <td style={{ paddingTop: 4, paddingBottom: 4, fontFamily: '"Courier New", Courier, monospace', fontSize: 12, color: '#374151' }}>
                  Fab by{' '}
                  <input
                    type="text"
                    value={line.byWhom}
                    onChange={e => update(d => ({
                      ...d,
                      labor: d.labor.map((l, j) => j === i ? { ...l, byWhom: e.target.value } : l),
                    }))}
                    style={{
                      width: 60, border: 'none', borderBottom: '1px solid #e2e8f0',
                      fontSize: 12, fontFamily: 'inherit', background: 'transparent',
                      outline: 'none', color: '#0f172a', textAlign: 'center',
                    }}
                  />
                </td>
                <td style={{ paddingTop: 4, paddingBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: '"Courier New", Courier, monospace', color: '#374151' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.hours}
                      onChange={e => update(d => ({
                        ...d,
                        labor: d.labor.map((l, j) => j === i ? { ...l, hours: e.target.value, amount: '' } : l),
                      }))}
                      placeholder="hrs"
                      style={{
                        width: 48, padding: '3px 4px', border: '1px solid rgba(21,128,61,0.35)',
                        borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
                        color: '#14532d', background: 'rgba(240,253,244,0.8)', outline: 'none', textAlign: 'right',
                      }}
                    />
                    <span>@</span>
                    <span>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.rate}
                      onChange={e => update(d => ({
                        ...d,
                        labor: d.labor.map((l, j) => j === i ? { ...l, rate: e.target.value, amount: '' } : l),
                      }))}
                      style={{
                        width: 52, padding: '3px 4px', border: '1px solid rgba(21,128,61,0.35)',
                        borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
                        color: '#14532d', background: 'rgba(240,253,244,0.8)', outline: 'none', textAlign: 'right',
                      }}
                    />
                    <span>/hr</span>
                  </div>
                </td>
                <MarketCell />
                <td style={{ textAlign: 'right', paddingTop: 4, paddingBottom: 4 }}>
                  <DollarInput
                    value={line.amount || (line.hours && line.rate ? fmt(laborAmount(line)) : '')}
                    onChange={v => update(d => ({
                      ...d,
                      labor: d.labor.map((l, j) => j === i ? { ...l, amount: v } : l),
                    }))}
                    placeholder={line.hours && line.rate ? fmt(laborAmount(line)) : '0.00'}
                  />
                </td>
              </tr>
            ))}
            <SubtotalRow label="Subtotal Labor" value={laborSubtotal} />

            {/* ── MARKUP ── */}
            <SectionHeader>Markup</SectionHeader>
            <tr>
              <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 12, fontFamily: '"Courier New", Courier, monospace', color: '#374151' }}>
                Overhead
              </td>
              <td style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', paddingLeft: 4, verticalAlign: 'middle' }}>
                (= labor cost)
              </td>
              <MarketCell />
              <td style={{ textAlign: 'right', paddingTop: 4, paddingBottom: 4 }}>
                <DollarInput
                  value={data.markup.overheadOverride}
                  onChange={v => update(d => ({ ...d, markup: { ...d.markup, overheadOverride: v } }))}
                  placeholder={fmt(laborSubtotal)}
                />
              </td>
            </tr>
            <tr>
              <td style={{ paddingTop: 4, paddingBottom: 4, verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: '"Courier New", Courier, monospace', color: '#374151' }}>
                  Profit @
                  <input
                    type="text"
                    inputMode="decimal"
                    value={data.markup.profitPct}
                    onChange={e => update(d => ({ ...d, markup: { ...d.markup, profitPct: e.target.value } }))}
                    style={{
                      width: 44, padding: '3px 4px', border: '1px solid rgba(21,128,61,0.35)',
                      borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
                      color: '#14532d', background: 'rgba(240,253,244,0.8)', outline: 'none', textAlign: 'right',
                    }}
                  />
                  <span>%</span>
                </div>
              </td>
              <td />
              <MarketCell />
              <td style={{ textAlign: 'right', paddingTop: 4, paddingBottom: 4 }}>
                <span style={{ fontSize: 13, fontFamily: '"Courier New", Courier, monospace', color: '#14532d' }}>
                  ${fmt(profit)}
                </span>
              </td>
            </tr>

            {/* Total Costs */}
            <GrandTotalRow label="Total Costs" value={totalCosts} color="#0f172a" />

            {/* ── TAX ── */}
            <tr>
              <td style={{ paddingTop: 8, paddingBottom: 4, verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontFamily: '"Courier New", Courier, monospace', color: '#374151' }}>
                  GET Tax @
                  <input
                    type="text"
                    inputMode="decimal"
                    value={data.taxRate}
                    onChange={e => update(d => ({ ...d, taxRate: e.target.value }))}
                    style={{
                      width: 44, padding: '3px 4px', border: '1px solid rgba(21,128,61,0.35)',
                      borderRadius: 4, fontSize: 12, fontFamily: 'inherit',
                      color: '#14532d', background: 'rgba(240,253,244,0.8)', outline: 'none', textAlign: 'right',
                    }}
                  />
                  <span>%</span>
                </div>
              </td>
              <td />
              <MarketCell />
              <td style={{ textAlign: 'right', paddingTop: 8, paddingBottom: 4 }}>
                <span style={{ fontSize: 13, fontFamily: '"Courier New", Courier, monospace', color: '#14532d' }}>
                  ${fmt(taxAmt)}
                </span>
              </td>
            </tr>

            {/* Grand Total */}
            <tr>
              <td colSpan={4} style={{ paddingTop: 12 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '3px double #0f172a',
                  paddingTop: 10,
                  paddingBottom: 4,
                }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    Grand Total
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', fontFamily: '"Courier New", Courier, monospace', letterSpacing: '-0.01em' }}>
                    ${fmt(grandTotal)}
                  </span>
                </div>
              </td>
            </tr>

          </tbody>
        </table>

        {/* Footer summary for print */}
        <div style={{ marginTop: 32, borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
          {[
            { label: 'Materials', value: grandTotalMaterials },
            { label: 'Labor', value: laborSubtotal },
            { label: 'Overhead', value: overhead },
            { label: `Profit (${data.markup.profitPct}%)`, value: profit },
            { label: `GET (${data.taxRate}%)`, value: taxAmt },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#374151', fontFamily: '"Courier New", Courier, monospace' }}>${fmt(value)}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
