/**
 * T&M Ticket PDF — 09_TM_Ticket
 * Time & Materials ticket for extra work authorized in the field.
 *
 * Formula chain (matches BanyanOS spec):
 *   (1)  Total Materials
 *   (2)  Total Wages         = SUM(hours × rate/hr per row)
 *   (3)  Total Fringe        = SUM(hours × fringe/hr per row)
 *   (4)  Total Labor         = (2) + (3)
 *   (5)  Materials & Labor   = (1) + (4)
 *   (6)  O&P 10%             = (5) × 0.10
 *   (7)  Insurance & Taxes   = (3) × 0.14
 *   (8)  O&P on Ins & Tax    = (7) × 0.10
 *   (9)  Subtotal M&L        = (5) + (6) + (7) + (8)
 *   (10) Equipment
 *   (11) Subcontractors
 *   (14) GET 4.712%          = (9) × 0.04712
 *   TOTAL                    = (9) + (10) + (11) + (14)
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { C, COMPANY, Letterhead, SectionHead, DocFooter, renderToPDF } from './pdf-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TMLabor = {
  classification: string;   // e.g. "Journeyman Glazier"
  crew: number;              // crew size (informational)
  hours: number;             // total crew-hours (already aggregated)
  rate_per_hr: number;       // wage rate $/hr
  fringe_per_hr: number;     // fringe rate $/hr
};

export type TMMaterial = {
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
};

export type TMEquipment = {
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
};

export type TMSubcontractor = {
  name: string;
  amount: number;
  markup_pct?: number;        // default 10%
};

export type TMPhoto = {
  filename: string;
  caption: string;
  drive_url: string;
  timestamp: string;          // ISO or formatted
};

export type TMTicketData = {
  tm_number: string;          // TM-{KID}-{SEQ}
  date: string;               // YYYY-MM-DD
  status: 'AUTHORIZED' | 'PENDING' | 'DISPUTED' | 'VOID';
  kid: string;
  project_name: string;
  gc_owner: string;
  auth_type: 'Verbal' | 'Written' | 'Email';
  auth_person: string;
  auth_person_title: string;
  auth_datetime: string;      // e.g. "2026-04-02 14:45 HST"
  triggered_by: string;       // e.g. "Field Issue FI-fd77a951"
  verbal_agreement_id?: string;
  logged_by?: string;
  description: string;
  labor: TMLabor[];
  materials: TMMaterial[];
  equipment: TMEquipment[];
  subcontractors: TMSubcontractor[];
  photos: TMPhoto[];
  linked_co?: string;         // e.g. "COP-003"
  co_submit_date?: string;
  // Rates — defaults per spec
  op_pct?: number;            // default 0.10
  insurance_on_fringe_pct?: number;  // default 0.14
  op_on_insurance_pct?: number;      // default 0.10
  get_pct?: number;           // default 0.04712
  // Signer
  signer_name?: string;
  signer_title?: string;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { backgroundColor: C.white, fontFamily: 'Helvetica', fontSize: 9, color: C.text, paddingHorizontal: 36, paddingTop: 0, paddingBottom: 48 },
  // Status badge
  statusBadge: { backgroundColor: C.orange, color: C.white, fontSize: 8, fontFamily: 'Helvetica-Bold', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  // Info grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10, gap: 0 },
  infoCell: { width: '50%', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  infoLabel: { fontSize: 7.5, color: C.slate, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoVal: { fontSize: 9, color: C.text, marginTop: 1 },
  kidVal: { fontSize: 9, color: C.orange, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  // Description
  descBox: { backgroundColor: C.bg, borderRadius: 6, padding: 10, marginBottom: 10 },
  // Tables
  tableHeader: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 5, paddingHorizontal: 6 },
  tableHeaderCell: { color: C.white, fontSize: 7.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg },
  tableCell: { fontSize: 8.5, color: C.text },
  tableCellRight: { fontSize: 8.5, color: C.text, textAlign: 'right' },
  tableDash: { fontSize: 8.5, color: C.slateLight, textAlign: 'center' },
  // Labor summary
  laborSummary: { alignItems: 'flex-end', marginTop: 4, marginBottom: 10 },
  summaryLine: { flexDirection: 'row', gap: 24, marginBottom: 1 },
  summaryLabel: { fontSize: 8.5, color: C.slate },
  summaryValue: { fontSize: 8.5, color: C.text, textAlign: 'right', minWidth: 70 },
  summaryLabelBold: { fontSize: 8.5, color: C.navy, fontFamily: 'Helvetica-Bold' },
  summaryValueBold: { fontSize: 8.5, color: C.navy, fontFamily: 'Helvetica-Bold', textAlign: 'right', minWidth: 70 },
  // Cost summary
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  costLabel: { fontSize: 8.5, color: C.text },
  costRef: { fontSize: 8, color: C.slate, marginLeft: 4 },
  costValue: { fontSize: 8.5, color: C.text, textAlign: 'right', minWidth: 80 },
  costDash: { fontSize: 8.5, color: C.slateLight, textAlign: 'right', minWidth: 80 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 10, backgroundColor: C.blueBg, borderBottomWidth: 1, borderBottomColor: C.border },
  subtotalLabel: { fontSize: 9, color: C.navy, fontFamily: 'Helvetica-Bold' },
  subtotalValue: { fontSize: 9, color: C.navy, fontFamily: 'Helvetica-Bold', textAlign: 'right', minWidth: 80 },
  totalBar: { backgroundColor: C.navy, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', justifyContent: 'space-between', borderRadius: 4, marginTop: 2 },
  totalLabel: { fontSize: 11, color: C.white, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontSize: 11, color: C.white, fontFamily: 'Helvetica-Bold' },
  // Auth box
  authBox: { backgroundColor: C.orangeBg, borderWidth: 1, borderColor: C.orangeBorder, borderRadius: 6, padding: 10, marginBottom: 10 },
  authTitle: { fontSize: 9, color: C.orange, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 5 },
  authText: { fontSize: 9, color: C.text, lineHeight: 1.5 },
  // Photo
  photoRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  photoSeq: { width: 14, fontSize: 8.5, color: C.navy, fontFamily: 'Helvetica-Bold' },
  photoMain: { flex: 1 },
  photoFilename: { fontSize: 8.5, color: C.navy, fontFamily: 'Helvetica-Bold' },
  photoCaption: { fontSize: 8, color: C.slate, marginTop: 1 },
  photoDrive: { fontSize: 7.5, color: C.blue, marginTop: 1 },
  photoTs: { fontSize: 7.5, color: C.slateLight },
  // Linked CO
  coBox: { backgroundColor: C.blueBg, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 6, padding: 9, marginVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  coArrow: { fontSize: 11, color: C.blue },
  coText: { fontSize: 8.5, color: C.text },
  coBold: { fontFamily: 'Helvetica-Bold', color: C.navy },
  // Signatures
  sigGrid: { flexDirection: 'row', gap: 24, marginTop: 8 },
  sigBlock: { flex: 1, borderTopWidth: 2, borderTopColor: C.navy, paddingTop: 8 },
  sigTitle: { fontSize: 8, color: C.slate, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 10 },
  sigLine: { borderBottomWidth: 1, borderBottomColor: C.slate, marginBottom: 4 },
  sigLabel: { fontSize: 7.5, color: C.slateLight },
  sigValue: { fontSize: 8.5, color: C.text, marginBottom: 8 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n === 0 ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtTotal = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function calcTM(data: TMTicketData) {
  const op_pct = data.op_pct ?? 0.10;
  const ins_pct = data.insurance_on_fringe_pct ?? 0.14;
  const op_ins_pct = data.op_on_insurance_pct ?? 0.10;
  const get_pct = data.get_pct ?? 0.04712;

  const wages = data.labor.reduce((s, l) => s + l.hours * l.rate_per_hr, 0);        // (2)
  const fringe = data.labor.reduce((s, l) => s + l.hours * l.fringe_per_hr, 0);     // (3)
  const totalLabor = wages + fringe;                                                   // (4)
  const totalMaterials = data.materials.reduce((s, m) => s + m.qty * m.unit_price, 0); // (1)
  const totalEquip = data.equipment.reduce((s, e) => s + e.qty * e.unit_price, 0);   // (10)
  const totalSubs = data.subcontractors.reduce((s, sub) => {
    const markup = 1 + (sub.markup_pct ?? 0.10);
    return s + sub.amount * markup;
  }, 0);                                                                               // (11)
  const matAndLabor = totalMaterials + totalLabor;                                    // (5)
  const op = matAndLabor * op_pct;                                                    // (6)
  const ins = fringe * ins_pct;                                                       // (7)
  const opIns = ins * op_ins_pct;                                                     // (8)
  const subtotal = matAndLabor + op + ins + opIns;                                   // (9)
  const get = subtotal * get_pct;                                                     // (14)
  const total = subtotal + totalEquip + totalSubs + get;

  return { wages, fringe, totalLabor, totalMaterials, totalEquip, totalSubs,
           matAndLabor, op, ins, opIns, subtotal, get, total, op_pct, ins_pct, op_ins_pct, get_pct };
}

// ─── Page 1 Component ─────────────────────────────────────────────────────────

function Page1({ data, calc }: { data: TMTicketData; calc: ReturnType<typeof calcTM> }) {
  const statusColors: Record<string, string> = {
    AUTHORIZED: C.orange,
    PENDING: C.slate,
    DISPUTED: C.red,
    VOID: '#6b7280',
  };

  return (
    <Page size="LETTER" style={s.page}>
      <Letterhead docNumber={data.tm_number} date={data.date} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy }}>T&amp;M Ticket</Text>
        <View style={{ ...s.statusBadge, backgroundColor: statusColors[data.status] ?? C.orange }}>
          <Text>{data.status}</Text>
        </View>
      </View>

      {/* Project info grid */}
      <View style={s.infoGrid}>
        {[
          ['PROJECT', data.project_name, false],
          ['DATE', data.date, false],
          ['TM #', data.tm_number, false],
          ['KID', data.kid, true],
          ['GC / OWNER', data.gc_owner, false],
          ['AUTHORIZATION', `${data.auth_type} — ${data.auth_person}`, false],
          ['TRIGGERED BY', data.triggered_by, false],
          ['AUTH DATE', data.auth_datetime, false],
        ].map(([label, val, highlight]) => (
          <View key={String(label)} style={s.infoCell}>
            <Text style={s.infoLabel}>{String(label)}</Text>
            <Text style={highlight ? s.kidVal : s.infoVal}>{String(val)}</Text>
          </View>
        ))}
      </View>

      {/* Description */}
      <SectionHead title="Description of Extra Work" />
      <View style={s.descBox}>
        <Text style={{ fontSize: 9, color: C.text, lineHeight: 1.5 }}>{data.description}</Text>
      </View>

      {/* Labor */}
      <SectionHead title="Labor" />
      <View style={s.tableHeader}>
        {[['CLASSIFICATION', 180], ['CREW', 40], ['HOURS', 45], ['RATE/HR', 55], ['FRINGE/HR', 55], ['WAGES', 60], ['FRINGE', 60]].map(([h, w]) => (
          <Text key={String(h)} style={{ ...s.tableHeaderCell, width: Number(w) }}>{String(h)}</Text>
        ))}
      </View>
      {data.labor.map((l, i) => {
        const wages = l.hours * l.rate_per_hr;
        const fringe = l.hours * l.fringe_per_hr;
        return (
          <View key={i} style={i % 2 === 1 ? s.tableRowAlt : s.tableRow}>
            <Text style={{ ...s.tableCell, width: 180 }}>{l.classification}</Text>
            <Text style={{ ...s.tableCell, width: 40, textAlign: 'center' }}>{l.crew}</Text>
            <Text style={{ ...s.tableCell, width: 45, textAlign: 'right' }}>{l.hours}</Text>
            <Text style={{ ...s.tableCellRight, width: 55 }}>${l.rate_per_hr.toFixed(2)}</Text>
            <Text style={{ ...s.tableCellRight, width: 55 }}>${l.fringe_per_hr.toFixed(2)}</Text>
            <Text style={{ ...s.tableCellRight, width: 60 }}>{fmt(wages)}</Text>
            <Text style={{ ...s.tableCellRight, width: 60 }}>{fmt(fringe)}</Text>
          </View>
        );
      })}
      <View style={s.laborSummary}>
        <View style={s.summaryLine}><Text style={s.summaryLabel}>Wages (2):</Text><Text style={s.summaryValue}>{fmt(calc.wages)}</Text></View>
        <View style={s.summaryLine}><Text style={s.summaryLabel}>Fringe (3):</Text><Text style={s.summaryValue}>{fmt(calc.fringe)}</Text></View>
        <View style={s.summaryLine}><Text style={s.summaryLabelBold}>Total Labor (4):</Text><Text style={s.summaryValueBold}>{fmt(calc.totalLabor)}</Text></View>
      </View>

      {/* Materials */}
      <SectionHead title="Materials" />
      <View style={s.tableHeader}>
        {[['DESCRIPTION', 180], ['QTY', 45], ['UNIT', 45], ['UNIT PRICE', 75], ['SUBTOTAL', 75]].map(([h, w]) => (
          <Text key={String(h)} style={{ ...s.tableHeaderCell, width: Number(w) }}>{String(h)}</Text>
        ))}
      </View>
      {data.materials.length === 0 ? (
        <View style={s.tableRow}>
          {[180, 45, 45, 75, 75].map((w, i) => <Text key={i} style={{ ...s.tableDash, width: w }}>—</Text>)}
        </View>
      ) : data.materials.map((m, i) => (
        <View key={i} style={i % 2 === 1 ? s.tableRowAlt : s.tableRow}>
          <Text style={{ ...s.tableCell, width: 180 }}>{m.description}</Text>
          <Text style={{ ...s.tableCell, width: 45, textAlign: 'center' }}>{m.qty}</Text>
          <Text style={{ ...s.tableCell, width: 45 }}>{m.unit}</Text>
          <Text style={{ ...s.tableCellRight, width: 75 }}>${m.unit_price.toFixed(2)}</Text>
          <Text style={{ ...s.tableCellRight, width: 75 }}>{fmt(m.qty * m.unit_price)}</Text>
        </View>
      ))}
      <View style={{ alignItems: 'flex-end', marginTop: 4, marginBottom: 10 }}>
        <View style={s.summaryLine}><Text style={s.summaryLabel}>Total Materials (1):</Text><Text style={s.summaryValue}>{fmt(calc.totalMaterials)}</Text></View>
      </View>

      {/* Cost Summary */}
      <SectionHead title="Cost Summary" />
      <View style={s.costRow}><Text style={s.costLabel}>Materials &amp; Labor (1)+(4)<Text style={s.costRef}> (5)</Text></Text><Text style={s.costValue}>{fmt(calc.matAndLabor)}</Text></View>
      <View style={s.costRow}><Text style={s.costLabel}>Overhead &amp; Profit — {(calc.op_pct * 100).toFixed(1)}% of (5)<Text style={s.costRef}> (6)</Text></Text><Text style={s.costValue}>{fmt(calc.op)}</Text></View>
      <View style={s.costRow}><Text style={s.costLabel}>Insurance &amp; Taxes — {(calc.ins_pct * 100).toFixed(1)}% of fringe (3)<Text style={s.costRef}> (7)</Text></Text><Text style={s.costValue}>{fmt(calc.ins)}</Text></View>
      <View style={s.costRow}><Text style={s.costLabel}>Overhead on Ins. &amp; Taxes — {(calc.op_ins_pct * 100).toFixed(1)}% of (7)<Text style={s.costRef}> (8)</Text></Text><Text style={s.costValue}>{fmt(calc.opIns)}</Text></View>
      <View style={s.subtotalRow}><Text style={s.subtotalLabel}>Subtotal Materials &amp; Labor<Text style={{ fontSize: 8, color: C.blue, fontFamily: 'Helvetica' }}> (9)</Text></Text><Text style={s.subtotalValue}>{fmt(calc.subtotal)}</Text></View>
      <View style={s.costRow}><Text style={s.costLabel}>Equipment / Reimbursables<Text style={s.costRef}> (10)</Text></Text>{calc.totalEquip === 0 ? <Text style={s.costDash}>—</Text> : <Text style={s.costValue}>{fmt(calc.totalEquip)}</Text>}</View>
      <View style={s.costRow}><Text style={s.costLabel}>Subcontractors (with markup)<Text style={s.costRef}> (11)</Text></Text>{calc.totalSubs === 0 ? <Text style={s.costDash}>—</Text> : <Text style={s.costValue}>{fmt(calc.totalSubs)}</Text>}</View>
      <View style={s.costRow}><Text style={s.costLabel}>Gross Income Tax — {(calc.get_pct * 100).toFixed(3)}% on (9)<Text style={s.costRef}> (14)</Text></Text><Text style={s.costValue}>{fmt(calc.get)}</Text></View>
      <View style={s.totalBar}>
        <Text style={s.totalLabel}>Total T&amp;M Ticket</Text>
        <Text style={s.totalValue}>{fmtTotal(calc.total)}</Text>
      </View>

      <DocFooter kID={data.kid} docNumber={data.tm_number} />
    </Page>
  );
}

// ─── Page 2 Component ─────────────────────────────────────────────────────────

function Page2({ data }: { data: TMTicketData }) {
  return (
    <Page size="LETTER" style={s.page}>
      <Letterhead docNumber={data.tm_number} date={data.date} />

      {/* Authorization Record */}
      <SectionHead title="Authorization Record" />
      <View style={s.authBox}>
        <Text style={s.authTitle}>Verbal Authorization</Text>
        <Text style={s.authText}>
          Authorized by {data.auth_person} ({data.auth_person_title}) at {data.auth_datetime}.{'\n'}
          {data.logged_by ? `Logged by ${data.logged_by}.` : ''}{data.verbal_agreement_id ? ` Verbal Agreement ID: ${data.verbal_agreement_id}.` : ''}
        </Text>
      </View>

      {/* Photo Evidence */}
      {data.photos.length > 0 && (
        <>
          <SectionHead title={`Photo Evidence — ${data.photos.length} Photo${data.photos.length !== 1 ? 's' : ''}`} />
          {data.photos.map((p, i) => (
            <View key={i} style={s.photoRow}>
              <Text style={s.photoSeq}>{i + 1}.</Text>
              <View style={s.photoMain}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.photoFilename}>{p.filename}</Text>
                  <Text style={s.photoTs}>{p.timestamp}</Text>
                </View>
                <Text style={s.photoCaption}>{p.caption}</Text>
                <Text style={s.photoDrive}>Drive: {p.drive_url}</Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Linked CO */}
      {data.linked_co && (
        <View style={s.coBox}>
          <Text style={s.coArrow}>➡</Text>
          <Text style={s.coText}>
            <Text style={s.coBold}>Linked Change Order: {data.linked_co}</Text>
            {data.co_submit_date ? ` submitted to ${data.gc_owner} on ${data.co_submit_date}.` : '.'}
          </Text>
        </View>
      )}

      {/* Signatures */}
      <SectionHead title="Signatures" />
      <View style={s.sigGrid}>
        {/* GC / Owner */}
        <View style={s.sigBlock}>
          <Text style={s.sigTitle}>Acknowledged By (GC / Owner)</Text>
          <View style={s.sigLine} /><Text style={s.sigLabel}>Name</Text>
          <View style={{ height: 14 }} />
          <View style={s.sigLine} /><Text style={s.sigLabel}>Title</Text>
          <View style={{ height: 14 }} />
          <View style={s.sigLine} /><Text style={s.sigLabel}>Date</Text>
        </View>
        {/* Kula Glass */}
        <View style={s.sigBlock}>
          <Text style={s.sigTitle}>Kula Glass Company, Inc.</Text>
          <Text style={s.sigValue}>By {data.signer_name ?? 'Project Manager'}</Text>
          <Text style={s.sigValue}>Title {data.signer_title ?? 'Project Manager'}</Text>
          <Text style={s.sigValue}>Date {data.date}</Text>
        </View>
      </View>

      <DocFooter kID={data.kid} docNumber={data.tm_number} />
    </Page>
  );
}

// ─── Main Document ────────────────────────────────────────────────────────────

export function TMTicketDocument({ data }: { data: TMTicketData }) {
  const calc = calcTM(data);
  return (
    <Document>
      <Page1 data={data} calc={calc} />
      <Page2 data={data} />
    </Document>
  );
}

export async function generateTMTicketPDF(data: TMTicketData): Promise<Buffer> {
  return renderToPDF(<TMTicketDocument data={data} />);
}
