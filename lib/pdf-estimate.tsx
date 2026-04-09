import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  S, C, COMPANY,
  Letterhead, SectionHead, DocFooter,
  fmt, renderToPDF,
} from './pdf-templates';

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
  install_step_id?: string;
  custom?: boolean;
}

export interface EstimateData {
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
  xModifier: string;
}

export interface EstimatePDFInput {
  wo_number: string;
  date: string;
  island: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  estimate: EstimateData;
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

function parseDollar(s: string): number {
  const n = parseFloat((s || '').replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function sumItems(items: LineItem[]): number {
  return (items || []).reduce((a, i) => a + parseDollar(i.amount), 0);
}

function laborAmount(line: LaborLine): number {
  const h = parseFloat(line.hours) || 0;
  const r = parseFloat(line.rate) || 0;
  return line.amount ? parseDollar(line.amount) : h * r;
}

export interface EstimateTotals {
  metalSubtotal: number;
  glassSubtotal: number;
  miscSubtotal: number;
  otherSubtotal: number;
  materialsTotal: number;
  driveTimeHours: number;
  driveTimeAmt: number;
  laborSubtotal: number;
  overhead: number;
  profitPct: number;
  profit: number;
  xVal: number;
  effectiveProfit: number;
  taxRate: number;
  taxAmt: number;
  grandTotal: number;
}

export function calcTotals(est: EstimateData): EstimateTotals {
  const metalSubtotal = sumItems(est.aluminum);
  const glassSubtotal = sumItems(est.glass);
  const miscSubtotal =
    Object.values(est.misc || {}).reduce((a, v) => a + parseDollar(v as string), 0) +
    sumItems(est.miscExtra ?? []);
  const otherSubtotal =
    Object.values(est.other || {}).reduce((a, v) => a + parseDollar(v as string), 0) +
    sumItems(est.otherExtra ?? []);
  const materialsTotal = metalSubtotal + glassSubtotal + miscSubtotal + otherSubtotal;

  const trips = parseFloat(est.driveTime?.trips) || 0;
  const hoursPerTrip = parseFloat(est.driveTime?.hoursPerTrip) || 0;
  const driveTimeHours = trips * hoursPerTrip;
  const driveTimeRate = parseFloat(est.driveTime?.rate) || 117;
  const driveTimeAmt = driveTimeHours * driveTimeRate;

  const laborSubtotal = (est.labor || []).reduce((a, l) => a + laborAmount(l), 0) + driveTimeAmt;

  const overhead = est.markup?.overheadOverride
    ? parseDollar(est.markup.overheadOverride)
    : laborSubtotal;

  const profitPct = parseFloat(est.markup?.profitPct) / 100 || 0;
  const totalCostsBeforeProfit = materialsTotal + laborSubtotal + overhead;
  const profit = totalCostsBeforeProfit * profitPct;

  const xVal = parseDollar(est.xModifier || '');
  const effectiveProfit = profit + xVal;

  const totalCosts = totalCostsBeforeProfit + effectiveProfit;
  const taxRate = parseFloat(est.taxRate) / 100 || 0.04712;
  const taxAmt = totalCosts * taxRate;
  const grandTotal = totalCosts + taxAmt;

  return {
    metalSubtotal, glassSubtotal, miscSubtotal, otherSubtotal, materialsTotal,
    driveTimeHours, driveTimeAmt, laborSubtotal,
    overhead, profitPct, profit, xVal, effectiveProfit,
    taxRate, taxAmt, grandTotal,
  };
}

// ─── Row helpers (PDF) ────────────────────────────────────────────────────────

function TableHeader({ cols }: { cols: { label: string; width?: number | string; align?: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.navy, padding: '5 10', borderRadius: 0 }}>
      {cols.map(c => (
        <Text key={c.label} style={{
          fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white,
          textTransform: 'uppercase', letterSpacing: 0.4,
          flex: c.width ? undefined : 1,
          width: c.width,
          textAlign: (c.align as 'left' | 'right' | 'center') || 'left',
        }}>{c.label}</Text>
      ))}
    </View>
  );
}

function DataRow({
  cols, alt, bold,
}: {
  cols: { text: string; width?: number | string; align?: string; muted?: boolean }[];
  alt?: boolean;
  bold?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      padding: '5 10',
      borderTop: `1 solid ${C.border}`,
      backgroundColor: alt ? C.bg : C.white,
    }}>
      {cols.map((c, i) => (
        <Text key={i} style={{
          fontSize: 9,
          fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica',
          color: c.muted ? C.slateLight : (bold ? C.navy : C.text),
          flex: c.width ? undefined : 1,
          width: c.width,
          textAlign: (c.align as 'left' | 'right' | 'center') || 'left',
        }}>{c.text}</Text>
      ))}
    </View>
  );
}

function SubtotalRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{
      flexDirection: 'row',
      padding: '5 10',
      borderTop: `1 solid ${C.border}`,
      backgroundColor: `rgba(37,99,235,0.07)`,
    }}>
      <Text style={{ flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.blue, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right', width: 100 }}>{fmt(value)}</Text>
    </View>
  );
}

// ─── PDF Component ────────────────────────────────────────────────────────────

function EstimatePDF({ input }: { input: EstimatePDFInput }) {
  const { wo_number, date, island, customer_name, customer_phone, customer_email, customer_address, estimate } = input;
  const T = calcTotals(estimate);

  const driveTrips = parseFloat(estimate.driveTime?.trips) || 0;
  const driveHpp = parseFloat(estimate.driveTime?.hoursPerTrip) || 0;
  const driveRate = parseFloat(estimate.driveTime?.rate) || 117;

  const profitPctDisplay = parseFloat(estimate.markup?.profitPct) || 10;
  const taxRateDisplay = parseFloat(estimate.taxRate) || 4.712;

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={`WO ${wo_number}`} date={date} />

        {/* Title */}
        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Simple Estimate</Text>
          <Text style={S.docMeta}>{island}  ·  {date}</Text>
        </View>

        {/* Customer info block */}
        <View style={{ border: `1.5 solid ${C.blue}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ backgroundColor: C.navy, padding: '5 12' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.6 }}>Customer Information</Text>
          </View>
          <View style={{ padding: '8 12', backgroundColor: C.bg, flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Customer', customer_name],
              ['Phone',    customer_phone],
              ['Email',    customer_email],
              ['Address',  customer_address],
              ['Island',   island],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '50%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, paddingRight: 10 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, width: 55, paddingTop: 1 }}>{label}</Text>
                <Text style={{ fontSize: 9, color: C.text, flex: 1, lineHeight: 1.4 }}>{value || '—'}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Materials Section */}
        <SectionHead title="Materials" />
        <View style={{ ...S.priceTable, marginBottom: 10 }}>
          <TableHeader cols={[{ label: 'Category' }, { label: 'Subtotal', width: 100, align: 'right' }]} />
          {T.metalSubtotal > 0 && (
            <DataRow cols={[{ text: 'Aluminum' }, { text: fmt(T.metalSubtotal), width: 100, align: 'right' }]} />
          )}
          {T.glassSubtotal > 0 && (
            <DataRow cols={[{ text: 'Glass' }, { text: fmt(T.glassSubtotal), width: 100, align: 'right' }]} alt />
          )}
          {T.miscSubtotal > 0 && (
            <DataRow cols={[{ text: 'Misc Materials' }, { text: fmt(T.miscSubtotal), width: 100, align: 'right' }]} />
          )}
          {T.otherSubtotal > 0 && (
            <DataRow cols={[{ text: 'Other Costs' }, { text: fmt(T.otherSubtotal), width: 100, align: 'right' }]} alt />
          )}
          <SubtotalRow label="Materials Total" value={T.materialsTotal} />
        </View>

        {/* Labor Section */}
        <SectionHead title="Labor" />
        <View style={{ ...S.priceTable, marginBottom: 10 }}>
          <TableHeader cols={[
            { label: 'Description' },
            { label: 'Hours', width: 50, align: 'right' },
            { label: 'Rate', width: 60, align: 'right' },
            { label: 'Amount', width: 90, align: 'right' },
          ]} />
          {(estimate.labor || []).map((line, i) => {
            const amt = laborAmount(line);
            const h = parseFloat(line.hours) || 0;
            const r = parseFloat(line.rate) || 0;
            return (
              <DataRow
                key={i}
                alt={i % 2 === 1}
                cols={[
                  { text: line.description || '—' },
                  { text: h ? h.toFixed(2) : '—', width: 50, align: 'right', muted: !h },
                  { text: r ? `$${r}/hr` : '—', width: 60, align: 'right', muted: !r },
                  { text: fmt(amt), width: 90, align: 'right' },
                ]}
              />
            );
          })}
          {/* Drive time row */}
          {T.driveTimeAmt > 0 && (
            <DataRow
              alt={(estimate.labor || []).length % 2 === 1}
              cols={[
                { text: `Drive Time (${driveTrips} trips × ${driveHpp}h)` },
                { text: T.driveTimeHours.toFixed(2), width: 50, align: 'right' },
                { text: `$${driveRate}/hr`, width: 60, align: 'right' },
                { text: fmt(T.driveTimeAmt), width: 90, align: 'right' },
              ]}
            />
          )}
          <SubtotalRow label="Labor Total" value={T.laborSubtotal} />
        </View>

        {/* Markup Section (internal) */}
        <View style={{ backgroundColor: `rgba(146,64,14,0.06)`, border: `1 solid rgba(146,64,14,0.25)`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ backgroundColor: `rgba(146,64,14,0.13)`, padding: '5 12', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.6 }}>Markup (Internal)</Text>
            <Text style={{ fontSize: 7.5, color: `${C.amber}cc` }}>— Kula Glass labor-equal overhead method</Text>
          </View>
          <View style={{ padding: '8 12', gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: C.subtext }}>Overhead (= labor subtotal)</Text>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text }}>{fmt(T.overhead)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: C.subtext }}>Profit ({profitPctDisplay}% of costs before profit)</Text>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text }}>{fmt(T.profit)}</Text>
            </View>
            {T.xVal !== 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: C.amber }}>X Modifier (adjusts profit)</Text>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.amber }}>
                  {T.xVal > 0 ? '+' : ''}{fmt(T.xVal)}
                </Text>
              </View>
            )}
            {T.xVal !== 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 9, color: C.subtext }}>Effective Profit (after X modifier)</Text>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text }}>{fmt(T.effectiveProfit)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Summary / Grand Total */}
        <SectionHead title="Summary" />
        <View style={{ alignSelf: 'flex-end', width: 300, backgroundColor: C.bg, borderRadius: 12, padding: '12 16', border: `1 solid ${C.border}`, marginBottom: 20 }}>
          {[
            { label: 'Materials', value: T.materialsTotal },
            { label: 'Labor', value: T.laborSubtotal },
            { label: 'Overhead', value: T.overhead },
            { label: T.xVal !== 0 ? `Profit (${profitPctDisplay}% + X modifier)` : `Profit (${profitPctDisplay}%)`, value: T.effectiveProfit },
            { label: `GET (${taxRateDisplay}%)`, value: T.taxAmt },
          ].map(l => (
            <View key={l.label} style={S.totalLine}>
              <Text style={S.totalLineLabel}>{l.label}</Text>
              <Text style={S.totalLineValue}>{fmt(l.value)}</Text>
            </View>
          ))}
          <View style={S.grandLine}>
            <Text style={S.grandLabel}>Grand Total</Text>
            <Text style={S.grandValue}>{fmt(T.grandTotal)}</Text>
          </View>
        </View>

        {/* Internal footer notice */}
        <View style={{
          padding: '8 14',
          backgroundColor: `rgba(185,28,28,0.06)`,
          border: `1 solid rgba(185,28,28,0.25)`,
          borderRadius: 8,
          marginBottom: 10,
        }}>
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.red, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Internal estimate — not for customer distribution
          </Text>
        </View>

        <DocFooter docNumber={`WO ${wo_number} — Internal Estimate`} />
      </Page>
    </Document>
  );
}

export async function generateEstimatePDF(input: EstimatePDFInput): Promise<Buffer> {
  return renderToPDF(<EstimatePDF input={input} />);
}
