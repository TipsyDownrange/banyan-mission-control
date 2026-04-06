'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { BidSummary } from '@/components/estimating/EstimatingWorkspace';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  miscExtra: LineItem[];
  other: {
    equipmentRental: string;
    misc: string;
    travel: string;
    freight: string;
  };
  otherExtra: LineItem[];
  labor: LaborLine[];
  markup: {
    overheadOverride: string;
    profitPct: string;
  };
  taxRate: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';

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
    miscExtra: [],
    other: {
      equipmentRental: '',
      misc: '',
      travel: '',
      freight: '',
    },
    otherExtra: [],
    labor: [
      { description: 'Fab by ___', hours: '', rate: '117', amount: '' },
      { description: 'Fab by Kula', hours: '', rate: '117', amount: '' },
      { description: 'Field Labor', hours: '', rate: '117', amount: '' },
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

function DollarInput({ value, onChange, placeholder = '0.00', width = 130 }: DollarInputProps) {
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
        padding: '5px 10px',
        border: focused ? '1px solid #14b8a6' : '1px solid rgba(20,184,166,0.3)',
        borderRadius: 8,
        fontSize: 13,
        fontFamily: FONT,
        fontVariantNumeric: 'tabular-nums',
        color: '#0f172a',
        background: focused ? '#f0fdf4' : 'rgba(240,253,244,0.7)',
        outline: 'none',
        textAlign: 'right',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    />
  );
}

function SmallInput({
  value,
  onChange,
  placeholder,
  width = 48,
  align = 'right',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
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
        textAlign: align,
        boxSizing: 'border-box',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    />
  );
}

function DescriptionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="Description…"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '100%',
        border: 'none',
        borderBottom: focused ? '1.5px solid #14b8a6' : '1px solid #e2e8f0',
        fontSize: 12,
        fontFamily: FONT,
        background: 'transparent',
        outline: 'none',
        color: '#0f172a',
        padding: '3px 0',
        transition: 'border-color 0.15s',
      }}
    />
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={4} style={{ paddingTop: 22, paddingBottom: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingBottom: 8,
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: 'linear-gradient(180deg, #14b8a6, #0f766e)',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#475569',
            fontFamily: FONT,
          }}>
            {children}
          </span>
        </div>
      </td>
    </tr>
  );
}

function SubtotalRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 2 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 16,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '6px 12px',
          marginTop: 4,
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: FONT,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 13,
            fontWeight: 800,
            color: '#0f172a',
            fontFamily: FONT,
            fontVariantNumeric: 'tabular-nums',
            minWidth: 110,
            textAlign: 'right',
          }}>
            ${fmt(value)}
          </span>
        </div>
      </td>
    </tr>
  );
}

function GrandTotalRow({ label, value, prominent = false }: {
  label: string;
  value: number;
  prominent?: boolean;
}) {
  if (prominent) {
    return (
      <tr>
        <td colSpan={4} style={{ paddingTop: 8, paddingBottom: 4 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0f172a',
            borderRadius: 12,
            padding: '14px 20px',
          }}>
            <span style={{
              fontSize: 13,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontFamily: FONT,
            }}>
              {label}
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 900,
              color: '#fff',
              fontFamily: FONT,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}>
              ${fmt(value)}
            </span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={4} style={{ paddingTop: 4, paddingBottom: 4 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#1e293b',
          borderRadius: 10,
          padding: '10px 16px',
          marginTop: 4,
        }}>
          <span style={{
            fontSize: 11,
            fontWeight: 800,
            color: 'rgba(148,163,184,0.9)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: FONT,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 15,
            fontWeight: 900,
            color: '#f8fafc',
            fontFamily: FONT,
            fontVariantNumeric: 'tabular-nums',
          }}>
            ${fmt(value)}
          </span>
        </div>
      </td>
    </tr>
  );
}

function MarketCell({ market }: { market?: string }) {
  return (
    <td style={{
      width: 90,
      fontSize: 10,
      color: '#cbd5e1',
      fontStyle: 'italic',
      textAlign: 'right',
      paddingLeft: 8,
      fontFamily: FONT,
    }}>
      {market ?? '—'}
    </td>
  );
}

function AmountDisplay({ value }: { value: number }) {
  return (
    <span style={{
      fontSize: 13,
      fontFamily: FONT,
      fontVariantNumeric: 'tabular-nums',
      color: '#0f766e',
      fontWeight: 600,
    }}>
      ${fmt(value)}
    </span>
  );
}

// ─── Print styles injected into DOM ──────────────────────────────────────────

const PRINT_STYLES = `
@media print {
  @page {
    margin: 0.65in 0.75in;
    size: letter;
  }

  body > *:not(#__next),
  header, nav, aside, footer,
  [data-no-print], .no-print {
    display: none !important;
  }

  body {
    background: white !important;
    color: #0f172a !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  #carls-print-root {
    display: block !important;
    position: fixed;
    inset: 0;
    overflow: auto;
    background: white;
    z-index: 99999;
    padding: 0;
    margin: 0;
  }

  #carls-print-area {
    font-family: -apple-system, "SF Pro Display", Inter, system-ui, sans-serif !important;
    font-size: 11pt;
    color: #0f172a;
    max-width: 100%;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
  }

  #carls-print-area input,
  #carls-print-area select,
  #carls-print-area textarea {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    outline: none !important;
    appearance: none !important;
    -webkit-appearance: none !important;
    pointer-events: none;
  }

  #carls-print-area .no-print,
  #carls-print-area button:not(.print-show) {
    display: none !important;
  }

  .print-grand-total {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
`;

// ─── Main Component ───────────────────────────────────────────────────────────

interface CarlsMethodTabProps {
  bid: BidSummary;
}

export default function CarlsMethodTab({ bid }: CarlsMethodTabProps) {
  const [data, setData] = useState<CarlsData>(() => defaultData(bid));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [xAmount, setXAmount] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/estimating/carls-method?bidVersionId=${bid.bidVersionId}`);
        const json = await res.json();
        if (json.data) {
          const loaded = { ...defaultData(bid), ...json.data };
          // Migrate old byWhom field to description
          if (loaded.labor) {
            loaded.labor = loaded.labor.map((l: LaborLine & { byWhom?: string }) => ({
              ...l,
              description: l.description || (l.byWhom ? `Fab by ${l.byWhom}` : ''),
            }));
          }
          if (!loaded.miscExtra) loaded.miscExtra = [];
          if (!loaded.otherExtra) loaded.otherExtra = [];
          setData(loaded);
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
  const miscSubtotal = Object.values(data.misc).reduce((a, v) => a + parseDollar(v), 0)
    + sumItems(data.miscExtra ?? []);
  const otherSubtotal = Object.values(data.other).reduce((a, v) => a + parseDollar(v), 0)
    + sumItems(data.otherExtra ?? []);
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

  // X Modifier (what-if negotiation tool)
  const xVal = parseDollar(xAmount);
  const grossCost = grandTotalMaterials + laborSubtotal;
  const currentMarkupPct = grossCost > 0 ? ((overhead + profit) / grossCost) * 100 : 0;
  const newProfit = profit + xVal;
  const newTotalCostsBeforeProfit2 = grandTotalMaterials + laborSubtotal + overhead;
  const newTotalCosts2 = newTotalCostsBeforeProfit2 + newProfit;
  const newTaxAmt2 = newTotalCosts2 * taxRate;
  const newGrandTotal2 = newTotalCosts2 + newTaxAmt2;
  const newMarkupPct = grossCost > 0 ? ((overhead + newProfit) / grossCost) * 100 : 0;

  // ─── PDF Export ──────────────────────────────────────────────────────────────

  function handlePrintPDF() {
    const styleEl = document.createElement('style');
    styleEl.id = 'carls-print-style';
    styleEl.textContent = PRINT_STYLES;
    document.head.appendChild(styleEl);
    window.print();
    setTimeout(() => {
      const el = document.getElementById('carls-print-style');
      if (el) document.head.removeChild(el);
    }, 2000);
  }

  // ─── Formatted date ──────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Shared cell style for body rows
  const bodyCell: React.CSSProperties = {
    paddingTop: 5,
    paddingBottom: 5,
    verticalAlign: 'middle',
    fontFamily: FONT,
    fontSize: 12,
    color: '#374151',
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 13, fontFamily: FONT }}>
        Loading estimate…
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: 960, fontFamily: FONT }}>

      {/* Inject print styles */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

      {/* ── Toolbar ── */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          gap: 12,
          padding: '10px 16px',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Carl&apos;s Method
          </span>
          {saving ? (
            <span style={{
              fontSize: 10, color: '#94a3b8', fontWeight: 600,
              background: '#f8fafc', padding: '2px 8px', borderRadius: 6,
            }}>
              Saving…
            </span>
          ) : lastSaved ? (
            <span style={{
              fontSize: 10, color: '#16a34a', fontWeight: 700,
              background: 'rgba(22,163,74,0.07)', padding: '2px 8px', borderRadius: 6,
              border: '1px solid rgba(22,163,74,0.15)',
            }}>
              ✓ Saved
            </span>
          ) : null}
        </div>

        <button
          onClick={handlePrintPDF}
          style={{
            padding: '8px 20px',
            borderRadius: 10,
            background: '#0f172a',
            color: 'white',
            border: 'none',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.07em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: FONT,
            textTransform: 'uppercase',
          }}
        >
          🖨 Export PDF
        </button>
      </div>

      {/* ── The Estimate Sheet ── */}
      <div
        id="carls-print-area"
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 1px 8px rgba(15,23,42,0.05)',
        }}
      >

        {/* ── Company Header (dark) ── */}
        <div
          className="print-grand-total"
          style={{
            background: '#0f172a',
            padding: '20px 28px 18px',
          }}
        >
          {/* Brand line */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: '0.08em',
                color: '#fff',
                textTransform: 'uppercase',
                fontFamily: FONT,
              }}>
                Kula Glass Co., Inc.
              </div>
              <div style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.22em',
                color: 'rgba(20,184,166,0.85)',
                textTransform: 'uppercase',
                marginTop: 3,
                fontFamily: FONT,
              }}>
                Estimate Form · Carl&apos;s Method
              </div>
            </div>
            {/* Print date (hidden in screen toolbar, shown in PDF) */}
            <div style={{
              textAlign: 'right',
              fontSize: 10,
              color: 'rgba(148,163,184,0.7)',
              fontFamily: FONT,
            }}>
              <div>Generated {today}</div>
            </div>
          </div>

          {/* Project meta row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: '8px 20px',
          }}>
            {[
              { label: 'Job Name', value: bid.projectName },
              { label: 'Location', value: bid.island },
              { label: 'Date', value: bid.bidDate || today },
              { label: 'Estimator', value: bid.estimator },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{
                  fontSize: 8,
                  fontWeight: 800,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: 'rgba(148,163,184,0.6)',
                  marginBottom: 3,
                  fontFamily: FONT,
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#f8fafc',
                  fontFamily: FONT,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {value || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Estimate Body ── */}
        <div style={{ padding: '16px 24px 28px' }}>

          {/* Column header row */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{
                  textAlign: 'left', paddingBottom: 8,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: '#94a3b8',
                  borderBottom: '1px solid #e2e8f0', width: '40%',
                  fontFamily: FONT,
                }}>
                  Item Description
                </th>
                <th style={{
                  textAlign: 'left', paddingBottom: 8,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: '#94a3b8',
                  borderBottom: '1px solid #e2e8f0', width: '22%',
                  fontFamily: FONT,
                }}>
                  Notes
                </th>
                <th style={{
                  textAlign: 'right', paddingBottom: 8,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: '#cbd5e1',
                  borderBottom: '1px solid #e2e8f0', width: 90,
                  fontFamily: FONT,
                }}>
                  Market
                </th>
                <th style={{
                  textAlign: 'right', paddingBottom: 8,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: '#94a3b8',
                  borderBottom: '1px solid #e2e8f0', width: 140,
                  fontFamily: FONT,
                }}>
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>

              {/* ── ALUMINUM ── */}
              <SectionHeader>Aluminum</SectionHeader>
              {data.aluminum.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={bodyCell}>
                    <DescriptionInput
                      value={item.description}
                      onChange={v => update(d => ({
                        ...d,
                        aluminum: d.aluminum.map((x, j) => j === i ? { ...x, description: v } : x),
                      }))}
                    />
                  </td>
                  <td style={bodyCell} />
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
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
              <tr className="no-print">
                <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 6 }}>
                  <button
                    onClick={() => update(d => ({ ...d, aluminum: [...d.aluminum, { description: '', amount: '' }] }))}
                    style={{
                      fontSize: 10, color: '#94a3b8', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: FONT, fontWeight: 600,
                    }}
                  >
                    + add line
                  </button>
                </td>
              </tr>
              <SubtotalRow label="Metal Subtotal" value={metalSubtotal} />

              {/* ── GLASS ── */}
              <SectionHeader>Glass</SectionHeader>
              {data.glass.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={bodyCell}>
                    <DescriptionInput
                      value={item.description}
                      onChange={v => update(d => ({
                        ...d,
                        glass: d.glass.map((x, j) => j === i ? { ...x, description: v } : x),
                      }))}
                    />
                  </td>
                  <td style={bodyCell} />
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
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
              <tr className="no-print">
                <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 6 }}>
                  <button
                    onClick={() => update(d => ({ ...d, glass: [...d.glass, { description: '', amount: '' }] }))}
                    style={{
                      fontSize: 10, color: '#94a3b8', background: 'none',
                      border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: FONT, fontWeight: 600,
                    }}
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
                <tr key={key} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={bodyCell}>{label}</td>
                  <td style={bodyCell} />
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
                    <DollarInput
                      value={data.misc[key]}
                      onChange={v => update(d => ({ ...d, misc: { ...d.misc, [key]: v } }))}
                    />
                  </td>
                </tr>
              ))}
              {/* Misc Extra Lines */}
              {(data.miscExtra ?? []).map((item, i) => (
                <tr key={`miscExtra-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={bodyCell}>
                    <DescriptionInput
                      value={item.description}
                      onChange={v => update(d => ({
                        ...d,
                        miscExtra: (d.miscExtra ?? []).map((x, j) => j === i ? { ...x, description: v } : x),
                      }))}
                    />
                  </td>
                  <td style={bodyCell} />
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <DollarInput
                        value={item.amount}
                        onChange={v => update(d => ({
                          ...d,
                          miscExtra: (d.miscExtra ?? []).map((x, j) => j === i ? { ...x, amount: v } : x),
                        }))}
                      />
                      <button
                        onClick={() => update(d => ({ ...d, miscExtra: (d.miscExtra ?? []).filter((_, j) => j !== i) }))}
                        className="no-print"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                        title="Remove"
                      >×</button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="no-print">
                <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 6 }}>
                  <button
                    onClick={() => update(d => ({ ...d, miscExtra: [...(d.miscExtra ?? []), { description: '', amount: '' }] }))}
                    style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, fontWeight: 600 }}
                  >+ add misc item</button>
                </td>
              </tr>
              <SubtotalRow label="Misc Subtotal" value={miscSubtotal} />

              {/* ── OTHER COST ITEMS ── */}
              <SectionHeader>Other Cost Items</SectionHeader>
              {([
                ['equipmentRental', 'Equipment Rental'],
                ['misc',            'Misc'],
                ['travel',          'Travel'],
                ['freight',         'Freight (misc)'],
              ] as [keyof CarlsData['other'], string][]).map(([key, label]) => (
                <tr key={key} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={bodyCell}>{label}</td>
                  <td style={bodyCell} />
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
                    <DollarInput
                      value={data.other[key]}
                      onChange={v => update(d => ({ ...d, other: { ...d.other, [key]: v } }))}
                    />
                  </td>
                </tr>
              ))}
              {/* Other Extra Lines */}
              {(data.otherExtra ?? []).map((item, i) => (
                <tr key={`otherExtra-${i}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={bodyCell}>
                    <DescriptionInput
                      value={item.description}
                      onChange={v => update(d => ({
                        ...d,
                        otherExtra: (d.otherExtra ?? []).map((x, j) => j === i ? { ...x, description: v } : x),
                      }))}
                    />
                  </td>
                  <td style={bodyCell} />
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <DollarInput
                        value={item.amount}
                        onChange={v => update(d => ({
                          ...d,
                          otherExtra: (d.otherExtra ?? []).map((x, j) => j === i ? { ...x, amount: v } : x),
                        }))}
                      />
                      <button
                        onClick={() => update(d => ({ ...d, otherExtra: (d.otherExtra ?? []).filter((_, j) => j !== i) }))}
                        className="no-print"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                        title="Remove"
                      >×</button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="no-print">
                <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 6 }}>
                  <button
                    onClick={() => update(d => ({ ...d, otherExtra: [...(d.otherExtra ?? []), { description: '', amount: '' }] }))}
                    style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, fontWeight: 600 }}
                  >+ add cost item</button>
                </td>
              </tr>

              {/* Grand Total Materials — mid-tier dark */}
              <tr><td colSpan={4} style={{ paddingTop: 6 }} /></tr>
              <GrandTotalRow label="Grand Total Materials" value={grandTotalMaterials} />

              {/* ── LABOR ── */}
              <SectionHeader>Labor</SectionHeader>
              {data.labor.map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={bodyCell}>
                    <DescriptionInput
                      value={line.description}
                      onChange={v => update(d => ({
                        ...d,
                        labor: d.labor.map((l, j) => j === i ? { ...l, description: v } : l),
                      }))}
                    />
                  </td>
                  <td style={bodyCell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                      <SmallInput
                        value={line.hours}
                        onChange={v => update(d => ({
                          ...d,
                          labor: d.labor.map((l, j) => j === i ? { ...l, hours: v, amount: '' } : l),
                        }))}
                        placeholder="hrs"
                        width={44}
                      />
                      <span style={{ color: '#94a3b8' }}>@</span>
                      <span style={{ color: '#64748b' }}>$</span>
                      <SmallInput
                        value={line.rate}
                        onChange={v => update(d => ({
                          ...d,
                          labor: d.labor.map((l, j) => j === i ? { ...l, rate: v, amount: '' } : l),
                        }))}
                        width={52}
                      />
                      <span style={{ color: '#94a3b8' }}>/hr</span>
                    </div>
                  </td>
                  <MarketCell />
                  <td style={{ ...bodyCell, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <DollarInput
                        value={line.amount || (line.hours && line.rate ? fmt(laborAmount(line)) : '')}
                        onChange={v => update(d => ({
                          ...d,
                          labor: d.labor.map((l, j) => j === i ? { ...l, amount: v } : l),
                        }))}
                        placeholder={line.hours && line.rate ? fmt(laborAmount(line)) : '0.00'}
                      />
                      {data.labor.length > 1 && (
                        <button
                          onClick={() => update(d => ({ ...d, labor: d.labor.filter((_, j) => j !== i) }))}
                          className="no-print"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                          title="Remove"
                        >×</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="no-print">
                <td colSpan={4} style={{ paddingTop: 2, paddingBottom: 6 }}>
                  <button
                    onClick={() => update(d => ({ ...d, labor: [...d.labor, { description: '', hours: '', rate: '117', amount: '' }] }))}
                    style={{ fontSize: 10, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT, fontWeight: 600 }}
                  >+ add labor line</button>
                </td>
              </tr>
              <SubtotalRow label="Subtotal Labor" value={laborSubtotal} />

              {/* ── MARKUP ── */}
              <SectionHeader>Markup</SectionHeader>
              <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={bodyCell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Overhead</span>
                    {data.markup.overheadOverride && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px',
                        borderRadius: 999, background: 'rgba(245,158,11,0.1)',
                        color: '#d97706', border: '1px solid rgba(245,158,11,0.25)',
                      }}>MANUAL</span>
                    )}
                  </div>
                </td>
                <td style={{ ...bodyCell, fontSize: 11, color: data.markup.overheadOverride ? '#d97706' : '#94a3b8', fontStyle: 'italic' }}>
                  {data.markup.overheadOverride
                    ? `overrides $${fmt(laborSubtotal)}`
                    : `= Labor Subtotal ($${fmt(laborSubtotal)})`
                  }
                </td>
                <MarketCell />
                <td style={{ ...bodyCell, textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <DollarInput
                      value={data.markup.overheadOverride}
                      onChange={v => update(d => ({ ...d, markup: { ...d.markup, overheadOverride: v } }))}
                      placeholder={fmt(laborSubtotal)}
                    />
                    {data.markup.overheadOverride && (
                      <button
                        onClick={() => update(d => ({ ...d, markup: { ...d.markup, overheadOverride: '' } }))}
                        className="no-print"
                        title="Reset to auto (= labor)"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontSize: 11, padding: '0 2px', fontWeight: 700 }}
                      >↺</button>
                    )}
                  </div>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={bodyCell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>Profit @</span>
                    <SmallInput
                      value={data.markup.profitPct}
                      onChange={v => update(d => ({ ...d, markup: { ...d.markup, profitPct: v } }))}
                      width={44}
                    />
                    <span style={{ color: '#94a3b8' }}>%</span>
                  </div>
                </td>
                <td style={bodyCell} />
                <MarketCell />
                <td style={{ ...bodyCell, textAlign: 'right' }}>
                  <AmountDisplay value={profit} />
                </td>
              </tr>

              {/* Total Costs */}
              <tr><td colSpan={4} style={{ paddingTop: 4 }} /></tr>
              <GrandTotalRow label="Total Costs" value={totalCosts} />

              {/* ── TAX ── */}
              <SectionHeader>Tax</SectionHeader>
              <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={bodyCell}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>GET Tax @</span>
                    <SmallInput
                      value={data.taxRate}
                      onChange={v => update(d => ({ ...d, taxRate: v }))}
                      width={44}
                    />
                    <span style={{ color: '#94a3b8' }}>%</span>
                  </div>
                </td>
                <td style={bodyCell} />
                <MarketCell />
                <td style={{ ...bodyCell, textAlign: 'right' }}>
                  <AmountDisplay value={taxAmt} />
                </td>
              </tr>

              {/* ── GRAND TOTAL ── */}
              <tr><td colSpan={4} style={{ paddingTop: 10 }} /></tr>
              <GrandTotalRow label="Grand Total" value={grandTotal} prominent />

              {/* ── X MODIFIER ── */}
              <tr><td colSpan={4} style={{ paddingTop: 20 }} /></tr>
              <tr>
                <td colSpan={4}>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(15,118,110,0.05), rgba(20,184,166,0.03))',
                    border: '1px solid rgba(20,184,166,0.25)',
                    borderRadius: 12,
                    padding: '14px 18px',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 10 }}>
                      🧠 What-If / Negotiation Tool
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Current markup */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#475569', fontFamily: FONT }}>
                          Mark-Up = (Overhead + Profit) / Gross Cost
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontFamily: FONT, fontVariantNumeric: 'tabular-nums' }}>
                          {currentMarkupPct.toFixed(2)}%
                        </span>
                      </div>
                      {/* X field */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 12, color: '#475569', fontFamily: FONT, flexShrink: 0 }}>
                          If Profit is adjusted by X =
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <DollarInput
                            value={xAmount}
                            onChange={setXAmount}
                            placeholder="-2,000"
                            width={120}
                          />
                          {xAmount && (
                            <button
                              onClick={() => setXAmount('')}
                              className="no-print"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}
                            >×</button>
                          )}
                        </div>
                      </div>
                      {/* Results */}
                      <div style={{
                        borderTop: '1px solid rgba(20,184,166,0.2)',
                        paddingTop: 10,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 20,
                        flexWrap: 'wrap',
                      }}>
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>New Mark-Up %</div>
                          <div style={{
                            fontSize: 18, fontWeight: 900, fontFamily: FONT,
                            color: xVal < 0 ? '#dc2626' : xVal > 0 ? '#16a34a' : '#0f172a',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
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
                          <div style={{
                            fontSize: 22, fontWeight: 900, fontFamily: FONT,
                            color: xVal < 0 ? '#dc2626' : xVal > 0 ? '#16a34a' : '#0f172a',
                            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                          }}>
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
                </td>
              </tr>

            </tbody>
          </table>

          {/* ── Summary footer ── */}
          <div style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 20,
            flexWrap: 'wrap',
          }}>
            {[
              { label: 'Materials', value: grandTotalMaterials },
              { label: 'Labor', value: laborSubtotal },
              { label: 'Overhead', value: overhead },
              { label: `Profit (${data.markup.profitPct}%)`, value: profit },
              { label: `GET (${data.taxRate}%)`, value: taxAmt },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 8, fontWeight: 800, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  fontFamily: FONT, marginBottom: 2,
                }}>
                  {label}
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: '#334155',
                  fontFamily: FONT, fontVariantNumeric: 'tabular-nums',
                }}>
                  ${fmt(value)}
                </div>
              </div>
            ))}
          </div>

          {/* ── Print-only footer ── */}
          <div style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 12,
            borderTop: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: FONT }}>
              Generated by BanyanOS · {today}
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', fontFamily: FONT }}>
              Kula Glass Co., Inc. — Confidential Estimate
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
