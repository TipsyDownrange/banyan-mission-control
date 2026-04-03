/**
 * Change Order Proposal (COP) PDF
 * Based on Kula Glass standard COP form.
 * Used when we submit a change order proposal to the GC.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  S, C, Letterhead, SectionHead, DocFooter, DualSigBlock, renderToPDF,
} from './pdf-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialLine = {
  description: string;
  unit_quantity: number;
  unit_price: number;
  unit: string;
};

export type LaborLine = {
  classification: string;  // e.g. "Journeyman", "Apprentice"
  hours: number;
  wage_rate: number;       // base hourly wage
  fringe_rate: number;     // fringe benefit rate per hour
};

export type EquipmentLine = {
  description: string;
  units: number;
  rate: number;
};

export type SubcontractorLine = {
  name: string;
  amount: number;
};

export type COPData = {
  cop_number: string;           // e.g. "COP-003"
  date: string;
  project_name: string;
  kID: string;
  job_number: string;
  gc_name: string;
  // Reference
  reference_bulletin?: string;
  reference_pcd?: string;
  reference_field_change?: string;
  reference_rfi?: string;
  // Description
  description: string;
  schedule_extension_days?: number;
  // Line items
  materials: MaterialLine[];
  labor: LaborLine[];
  equipment: EquipmentLine[];
  subcontractors: SubcontractorLine[];
  // Rates (defaults from standard form)
  op_rate?: number;            // default 0.10
  insurance_tax_rate?: number; // default 0.14 (on fringe only)
  overhead_on_it_rate?: number;// default 0.10
  get_rate?: number;           // default 0.04166
  bond_rate?: number;          // default 0
  subcontractor_markup?: number;// default 0.10
  // Prepared by
  prepared_by: { name: string; title: string };
};

// ─── Calculations ────────────────────────────────────────────────────────────

function calcCOP(data: COPData) {
  const opRate  = data.op_rate ?? 0.10;
  const itRate  = data.insurance_tax_rate ?? 0.14;
  const oitRate = data.overhead_on_it_rate ?? 0.10;
  const getRate = data.get_rate ?? 0.04166;
  const bondRate= data.bond_rate ?? 0;
  const subMarkup = data.subcontractor_markup ?? 0.10;

  // Materials
  const materialLines = data.materials.map(m => ({
    ...m,
    subtotal: m.unit_quantity * m.unit_price,
  }));
  const total1 = materialLines.reduce((s, m) => s + m.subtotal, 0);

  // Labor
  const laborLines = data.labor.map(l => ({
    ...l,
    fringe_total: l.fringe_rate * l.hours,
    wage_total: l.wage_rate * l.hours,
  }));
  const total2 = laborLines.reduce((s, l) => s + l.wage_total, 0);   // wages subtotal
  const total3 = laborLines.reduce((s, l) => s + l.fringe_total, 0); // fringe subtotal
  const total4 = total2 + total3; // total labor

  // Subtotals
  const total5 = total1 + total4;                        // materials + labor
  const total6 = total5 * opRate;                        // O&P
  const total7 = total3 * itRate;                        // insurance & taxes on fringe
  const total8 = total7 * oitRate;                       // overhead on I&T
  const total9 = total5 + total6 + total7 + total8;      // subtotal before equip/sub

  // Equipment
  const equipLines = data.equipment.map(e => ({
    ...e,
    subtotal: e.units * e.rate,
  }));
  const total10 = equipLines.reduce((s, e) => s + e.subtotal, 0);

  // Subcontractors
  const subLines = data.subcontractors.map(sub => ({
    ...sub,
    markup_amount: sub.amount * subMarkup,
    subtotal: sub.amount * (1 + subMarkup),
  }));
  const total11a = subLines.reduce((s, sub) => s + sub.amount, 0);       // sub cost
  const total11b = subLines.reduce((s, sub) => s + sub.markup_amount, 0); // markup
  const total11  = subLines.reduce((s, sub) => s + sub.subtotal, 0);     // sub total with markup

  // Grand total
  const total12 = total9 + total10 + total11;
  const total13 = total12 * bondRate;
  const total14 = (total12 + total13 - total11a) * getRate; // GET on our portion
  const totalCOP = total12 + total13 + total14;
  const totalRounded = Math.round(totalCOP);

  return {
    materialLines, total1,
    laborLines, total2, total3, total4,
    total5, total6, total7, total8, total9,
    equipLines, total10,
    subLines, total11a, total11b, total11,
    total12, total13, total14,
    totalCOP, totalRounded,
    rates: { opRate, itRate, oitRate, getRate, bondRate, subMarkup },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtN(n: number): string {
  if (!n) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

const TH = ({ children, flex, right }: { children: string; flex?: number; right?: boolean }) => (
  <Text style={{ flex: flex ?? 1, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: right ? 'right' : 'left' }}>
    {children}
  </Text>
);

const TD = ({ children, flex, right, bold, accent }: { children: string; flex?: number; right?: boolean; bold?: boolean; accent?: boolean }) => (
  <Text style={{ flex: flex ?? 1, fontSize: 9, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica', color: accent ? C.navy : C.text, textAlign: right ? 'right' : 'left' }}>
    {children}
  </Text>
);

const TableHeader = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', backgroundColor: C.navy, padding: '5 8', }}>
    {children}
  </View>
);

const TableRow = ({ children, alt }: { children: React.ReactNode; alt?: boolean }) => (
  <View style={{ flexDirection: 'row', padding: '4 8', backgroundColor: alt ? C.bg : C.white, borderBottom: `0.5 solid ${C.border}` }}>
    {children}
  </View>
);

const CalcRow = ({ label, ref: refNum, value, bold, highlight }: { label: string; ref?: string; value: number; bold?: boolean; highlight?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '3 8', backgroundColor: highlight ? `${C.blue}12` : 'transparent', borderTop: highlight ? `1 solid ${C.blue}33` : undefined }}>
    <Text style={{ fontSize: 8.5, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica', color: bold ? C.navy : C.subtext, flex: 1 }}>{label}</Text>
    {refNum && <Text style={{ fontSize: 7.5, color: C.slateLight, marginRight: 12 }}>({refNum})</Text>}
    <Text style={{ fontSize: 9, fontFamily: bold ? 'Helvetica-Bold' : 'Helvetica', color: bold ? C.navy : C.subtext, width: 90, textAlign: 'right' }}>{fmtN(value)}</Text>
  </View>
);

// ─── PDF Document ─────────────────────────────────────────────────────────────

function COPPDF({ data }: { data: COPData }) {
  const calc = calcCOP(data);

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={data.cop_number} date={data.date} />

        {/* Title */}
        <View style={[S.docTitleRow, { marginBottom: 12 }]}>
          <Text style={S.docTitle}>Change Order Proposal</Text>
          <Text style={S.docMeta}>{data.project_name}</Text>
        </View>

        {/* Header info block — orange bordered */}
        <View style={{ border: `1.5 solid ${C.orange}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ padding: '8 12', backgroundColor: C.bg, flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Project',       data.project_name],
              ['Date',          data.date],
              ['COP #',         data.cop_number],
              ['Job No.',       data.job_number],
              ['GC / Owner',    data.gc_name],
              ['kID',           data.kID],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '50%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, paddingRight: 10 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, width: 70, paddingTop: 1 }}>{label}</Text>
                <Text style={{ fontSize: 9, color: C.text, flex: 1, lineHeight: 1.4 }}>{value}</Text>
              </View>
            ))}
          </View>
          {/* Reference row */}
          <View style={{ backgroundColor: C.orangeBg, borderTop: `1 solid ${C.orangeBorder}`, padding: '5 12', flexDirection: 'row' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.4 }}>Reference:</Text>
            {data.reference_bulletin && <Text style={{ fontSize: 8.5, color: C.text }}>Bulletin: {data.reference_bulletin}</Text>}
            {data.reference_pcd && <Text style={{ fontSize: 8.5, color: C.text }}>PCD: {data.reference_pcd}</Text>}
            {data.reference_field_change && <Text style={{ fontSize: 8.5, color: C.text }}>Field Change: {data.reference_field_change}</Text>}
            {data.reference_rfi && <Text style={{ fontSize: 8.5, color: C.text }}>RFI: {data.reference_rfi}</Text>}
            {!data.reference_bulletin && !data.reference_pcd && !data.reference_field_change && !data.reference_rfi &&
              <Text style={{ fontSize: 8.5, color: C.slateLight }}>—</Text>}
          </View>
        </View>

        {/* Description */}
        <SectionHead title="Description of Change" />
        <Text style={{ ...S.body, marginBottom: 12 }}>{data.description}</Text>

        {/* Materials */}
        <SectionHead title="Materials" />
        <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 8 }}>
          <TableHeader>
            <TH flex={3}>Description</TH>
            <TH>Qty</TH>
            <TH>Unit</TH>
            <TH right>Unit Price</TH>
            <TH right>Subtotal</TH>
          </TableHeader>
          {calc.materialLines.length > 0
            ? calc.materialLines.map((m, i) => (
                <TableRow key={i} alt={i % 2 === 1}>
                  <TD flex={3}>{m.description}</TD>
                  <TD>{String(m.unit_quantity)}</TD>
                  <TD>{m.unit}</TD>
                  <TD right>{fmtN(m.unit_price)}</TD>
                  <TD right bold>{fmtN(m.subtotal)}</TD>
                </TableRow>
              ))
            : <TableRow><TD flex={6} accent={false}>—</TD></TableRow>
          }
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: '4 8', backgroundColor: `${C.blue}10`, borderTop: `0.5 solid ${C.border}` }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Total Materials (1):  {fmtN(calc.total1)}</Text>
          </View>
        </View>

        {/* Labor */}
        <SectionHead title="Labor" />
        <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 8 }}>
          <TableHeader>
            <TH flex={2}>Classification</TH>
            <TH>Hours</TH>
            <TH right>Wage/hr</TH>
            <TH right>Fringe/hr</TH>
            <TH right>Wages</TH>
            <TH right>Fringe</TH>
          </TableHeader>
          {calc.laborLines.length > 0
            ? calc.laborLines.map((l, i) => (
                <TableRow key={i} alt={i % 2 === 1}>
                  <TD flex={2}>{l.classification}</TD>
                  <TD>{String(l.hours)}</TD>
                  <TD right>{fmtN(l.wage_rate)}</TD>
                  <TD right>{fmtN(l.fringe_rate)}</TD>
                  <TD right>{fmtN(l.wage_total)}</TD>
                  <TD right>{fmtN(l.fringe_total)}</TD>
                </TableRow>
              ))
            : <TableRow><TD flex={7}>—</TD></TableRow>
          }
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginRight: 20, padding: '4 8', backgroundColor: `${C.blue}10`, borderTop: `0.5 solid ${C.border}` }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Wages (2): {fmtN(calc.total2)}</Text>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Fringe (3): {fmtN(calc.total3)}</Text>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Total Labor (4): {fmtN(calc.total4)}</Text>
          </View>
        </View>

        {/* Equipment / Reimbursables */}
        {(data.equipment.length > 0 || true) && (
          <>
            <SectionHead title="Equipment / Reimbursables (per diem, air fare, etc.)" />
            <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 8 }}>
              <TableHeader>
                <TH flex={3}>Description</TH>
                <TH>Units / Hrs</TH>
                <TH right>Rate</TH>
                <TH right>Subtotal</TH>
              </TableHeader>
              {calc.equipLines.length > 0
                ? calc.equipLines.map((e, i) => (
                    <TableRow key={i} alt={i % 2 === 1}>
                      <TD flex={3}>{e.description}</TD>
                      <TD>{String(e.units)}</TD>
                      <TD right>{fmtN(e.rate)}</TD>
                      <TD right bold>{fmtN(e.subtotal)}</TD>
                    </TableRow>
                  ))
                : <TableRow><TD flex={5}>—</TD></TableRow>
              }
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: '4 8', backgroundColor: `${C.blue}10`, borderTop: `0.5 solid ${C.border}` }}>
                <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Total Equipment (10): {fmtN(calc.total10)}</Text>
              </View>
            </View>
          </>
        )}

        {/* Subcontractors */}
        <SectionHead title={`Subcontractors (${fmtPct(calc.rates.subMarkup)} markup)`} />
        <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 8 }}>
          <TableHeader>
            <TH flex={3}>Name</TH>
            <TH right>Amount</TH>
            <TH right>Markup</TH>
            <TH right>Subtotal</TH>
          </TableHeader>
          {calc.subLines.length > 0
            ? calc.subLines.map((sub, i) => (
                <TableRow key={i} alt={i % 2 === 1}>
                  <TD flex={3}>{sub.name}</TD>
                  <TD right>{fmtN(sub.amount)}</TD>
                  <TD right>{fmtN(sub.markup_amount)}</TD>
                  <TD right bold>{fmtN(sub.subtotal)}</TD>
                </TableRow>
              ))
            : <TableRow><TD flex={5}>—</TD></TableRow>
          }
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: '4 8', backgroundColor: `${C.blue}10`, borderTop: `0.5 solid ${C.border}` }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Total Subcontractors (11): {fmtN(calc.total11)}</Text>
          </View>
        </View>

        {/* Calculation chain */}
        <SectionHead title="Cost Summary" />
        <View style={{ borderRadius: 10, border: `1 solid ${C.border}`, overflow: 'hidden', marginBottom: 14 }}>
          <CalcRow label={`Materials & Labor (1)+(4)`} ref="5" value={calc.total5} />
          <CalcRow label={`Overhead & Profit — ${fmtPct(calc.rates.opRate)} of (5)`} ref="6" value={calc.total6} />
          <CalcRow label={`Insurance & Taxes — ${fmtPct(calc.rates.itRate)} of fringe (3)`} ref="7" value={calc.total7} />
          <CalcRow label={`Overhead on Ins. & Taxes — ${fmtPct(calc.rates.oitRate)} of (7)`} ref="8" value={calc.total8} />
          <CalcRow label="Subtotal Materials & Labor (5)+(6)+(7)+(8)" ref="9" value={calc.total9} bold />
          <CalcRow label="Equipment / Reimbursables" ref="10" value={calc.total10} />
          <CalcRow label="Subcontractors (with markup)" ref="11" value={calc.total11} />
          <CalcRow label="Total Materials, Labor & Equipment (9)+(10)+(11)" ref="12" value={calc.total12} bold highlight />
          <CalcRow label={`Bond Fee — ${fmtPct(calc.rates.bondRate)} on (12)`} ref="13" value={calc.total13} />
          <CalcRow label={`Gross Income Tax — ${fmtPct(calc.rates.getRate)} on (12)+(13)-(11a)`} ref="14" value={calc.total14} />
          {/* Grand total */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: '8 12', backgroundColor: C.navy }}>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.white }}>TOTAL FOR CHANGE ORDER PROPOSAL (12)+(13)+(14)</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.white }}>${calc.totalRounded.toLocaleString()}</Text>
          </View>
        </View>

        {/* Schedule */}
        {(data.schedule_extension_days !== undefined) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10, marginBottom: 14, padding: '6 12', backgroundColor: `${C.blue}10`, borderRadius: 8, border: `1 solid ${C.blue}33` }}>
            <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.blue }}>Schedule Extension:</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy }}>
              {data.schedule_extension_days > 0 ? `${data.schedule_extension_days} calendar day${data.schedule_extension_days !== 1 ? 's' : ''}` : 'No extension requested'}
            </Text>
          </View>
        )}

        <DualSigBlock
          preparedBy={{ name: data.prepared_by.name, title: data.prepared_by.title }}
          date={data.date}
        />

        <DocFooter docNumber={data.cop_number} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateCOPPDF(data: COPData): Promise<Buffer> {
  return renderToPDF(<COPPDF data={data} />);
}
