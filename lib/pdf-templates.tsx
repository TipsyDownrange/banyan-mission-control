/**
 * BanyanOS PDF Template System — 2026 Design
 * Clean, modern. Matches BanyanOS frontend aesthetic.
 * No boxy borders. Pill shapes. Teal accents. Premium feel.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';
import path from 'path';

// Logo — portrait ratio 2481×3508 ≈ 0.707 wide:tall
const LOGO_PATH = path.join(process.cwd(), 'public', 'kg-logo.png');
const LOGO_W = 52;
const LOGO_H = Math.round(LOGO_W / 0.707); // ≈ 74

// ─── Brand Tokens — Kula Glass palette ───────────────────────────────────────
// Primary: KG dark navy (#0D0D80) + steel blue (#2E6DA4)
// NOT BanyanOS teal — these are KG company colors
export const C = {
  navy:       '#0D0D80',  // KG primary — dark navy (logo color)
  navyDark:   '#0a0a60',  // darker navy for hover/active
  blue:       '#2E6DA4',  // KG steel blue (letterhead band, section accents)
  blueBg:     '#EEF4FB',  // light blue wash
  blueMid:    '#4A8BBF',  // mid blue for gradients
  amber:      '#92400e',  // warnings
  red:        '#b91c1c',  // critical issues
  slate:      '#64748b',  // labels
  slateLight: '#94a3b8',  // sub-labels
  border:     '#e2e8f0',  // dividers
  bg:         '#f8fafc',  // page tint
  white:      '#ffffff',
  text:       '#0f172a',
  subtext:    '#475569',
  // Keep teal only for status indicators
  teal:       '#0f766e',
  tealBg:     '#f0fdfa',
  // Orange accent — for highlighted info blocks
  orange:     '#ea580c',
  orangeBg:   '#fff7ed',
  orangeBorder:'#fed7aa',
};

export const COMPANY = {
  name:    'KULA GLASS COMPANY, INC.',
  address: '289 Pakana Street  •  Wailuku, Hawaii 96793',
  contact: 'P: (808) 242-8999  •  F: (808) 242-7822  •  Lic. C-20080',
};

// ─── T&C (2025) ───────────────────────────────────────────────────────────────
// ─── Service Work Order T&C (short — residential & light commercial) ─────────
export const SERVICE_TERMS = [
  { num: '1', title: 'Acceptance',         body: 'A signed proposal and 50% deposit are required before materials are ordered or work is scheduled. Remaining balance is due upon completion.' },
  { num: '2', title: 'Pricing',            body: 'Price includes materials, labor, and Hawaii GET (4.5%) as stated. Any additional work discovered on site requires a written change order before proceeding.' },
  { num: '3', title: 'Measurements',       body: 'Customer or their representative must confirm all field dimensions prior to fabrication. Kula Glass is not responsible for costs arising from incorrect dimensions provided by others.' },
  { num: '4', title: 'Lead Times',         body: 'Material lead times are estimates only and subject to supplier availability. Kula Glass will notify customer of delays as soon as known. Lead time begins upon receipt of deposit and approved dimensions.' },
  { num: '5', title: 'Warranty',           body: 'Kula Glass warrants its installation workmanship for one (1) year from completion. Glass and material warranties are per manufacturer. Warranty does not cover breakage, scratching, or damage caused by others after installation.' },
  { num: '6', title: 'Site Access',        body: 'Customer shall provide safe, clear access to the work area. If access is not available at the scheduled time, a return trip charge may apply.' },
  { num: '7', title: 'Liability',          body: 'Kula Glass is not liable for pre-existing conditions, damage caused by others, or consequential damages. Maximum liability is limited to the value of the work performed.' },
  { num: '8', title: 'Validity',           body: 'This proposal is valid for 30 days from the date above. Pricing is subject to change after that date.' },
];

// ─── Contract Proposal T&C (full 17-clause version) ──────────────────────────
export const TERMS = [
  { num: '1',  title: 'Commencement, Mutual Schedule & Scope Review',   body: 'This proposal shall not become a binding contract until: (a) a mutually agreed written project schedule is attached and signed by both parties, and (b) a scope-review meeting has been held between Kula Glass and General Contractor to review drawings, specifications, exclusions, schedule, sequence, and access. Work shall commence based on the mutually agreed-upon schedule. Subcontractor shall not be responsible for delays caused by any reason beyond its reasonable control.' },
  { num: '1A', title: 'Force Majeure',                                   body: 'Subcontractor shall not be liable for any delay or failure to perform caused by acts of God, war, terrorism, pandemic/epidemic, government orders, fire, flood, earthquake, embargo, riot, labor disputes, supply-chain disruption, or any other event beyond Subcontractor\'s reasonable control. Subcontractor shall receive an equitable time extension and compensation for increased costs.' },
  { num: '1B', title: 'Liquidated and Consequential Damages Waiver',     body: 'Owner and General Contractor waive all claims against Subcontractor for liquidated, consequential, indirect, special, or punitive damages of any kind.' },
  { num: '2',  title: 'Tariff / Import Duty / Trade Act Protection',     body: 'Contract price is based on tariffs and duties in effect on the proposal date. Any new or increased government-imposed costs on glass, aluminum, or components shall be added via change order.' },
  { num: '3',  title: 'Payment Terms – Pay-If-Paid',                     body: 'Payment by Owner is an express condition precedent to General Contractor\'s obligation to pay Subcontractor. Progress payments of 90% due by the 10th of the following month. Retention reduced to 5% at 50% completion and 0% at 100%. Final payment within 30 days of substantial completion. Past-due amounts bear interest at 1.5%/month. Subcontractor may stop work if any invoice is unpaid 30 days.' },
  { num: '4',  title: 'Overtime and Shift Work',                         body: 'All Work is based on straight-time labor. Overtime, weekend, or shift work required by schedule or GC shall be paid as extra work at premium rates.' },
  { num: '5',  title: 'Escalation',                                      body: 'If proposal is accepted more than 60 days after proposal date, or materials not released for fabrication within 90 days of execution, Subcontractor may adjust price to reflect documented cost increases.' },
  { num: '6',  title: 'Openings, Backing, and Substrates',               body: 'All openings, blocking, and substrates shall be plumb, square, and within 1/8" in 10\'‑0" tolerance before Subcontractor begins.' },
  { num: '7',  title: 'Storage and Hoisting',                            body: 'General Contractor shall provide locked storage and unrestricted use of hoists, cranes, and elevators at no cost.' },
  { num: '8',  title: 'Site Conditions and Utilities',                   body: 'General Contractor shall provide at no cost: heat, power, water, sanitary facilities, scaffolding, swing stages, trash removal, and temporary enclosures.' },
  { num: '9',  title: 'Damage After Installation',                       body: 'Subcontractor is not liable for breakage, scratching, or vandalism after installation unless caused solely by its employees.' },
  { num: '10', title: 'No Back-Charges',                                 body: 'No back-charges without seven (7) days\' prior written notice and opportunity to cure.' },
  { num: '11', title: 'Changes and Extra Work',                          body: 'No extra work or change without a signed written change order. Verbal orders are not binding.' },
  { num: '12', title: 'Notice of Claims',                                body: 'Claims for additional time or money must be submitted in writing within seven (7) calendar days of the event.' },
  { num: '13', title: 'Termination or Suspension',                       body: 'Termination or suspension over 30 days entitles Subcontractor to payment for Work performed plus profit on unperformed Work, restocking, and demobilization costs.' },
  { num: '14', title: 'Insurance and Indemnity',                         body: 'Indemnity limited to Subcontractor\'s sole negligence. No indemnity for design defects or others\' negligence.' },
  { num: '15', title: 'Disputes and Governing Law',                      body: 'Governed by laws of the State of Hawaii. Venue in Maui County. Prevailing party recovers attorneys\' fees.' },
  { num: '16', title: 'Entire Agreement / Severability',                 body: 'This document and accepted proposal constitute the entire agreement. Invalid provisions do not affect the remainder.' },
  { num: '17', title: 'Acceptance and Validity',                         body: 'Valid for 30 days. Subject to credit approval and correction of clerical errors.' },
];

export const STANDARD_EXCLUSIONS = [
  'Bond Premium',
  'Extended Warranty',
  'Barricades and Protection',
  'Aluminum Frame (unless explicitly included in scope)',
  'Cleaning beyond broom-clean',
  'Testing and Special Inspections',
  'Insurance exceeding $1,000,000 per occurrence',
  'Liquidated Damages',
  'Overtime / Premium Time (unless noted)',
];

// ─── Shared Styles ────────────────────────────────────────────────────────────
export const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.text,
    padding: '44 52 52 52',
    lineHeight: 1.45,
    backgroundColor: C.white,
  },

  // ── Letterhead ──
  letterhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: `2 solid ${C.blue}`,
  },
  companyName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 8,
    color: C.slate,
    lineHeight: 1.5,
  },

  // ── Document title ──
  docTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  docTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    letterSpacing: -0.3,
  },
  docMeta: {
    fontSize: 8.5,
    color: C.slateLight,
    textAlign: 'right',
    lineHeight: 1.6,
  },

  // ── Info grid (pill-style chips instead of boxy table) ──
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    marginBottom: 18,
    padding: '8 12',
    backgroundColor: C.bg,
    borderRadius: 12,
    border: `1 solid ${C.border}`,
  },
  infoItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5,
    paddingRight: 10,
  },
  infoLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.slateLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 80,
    paddingTop: 1,
  },
  infoValue: {
    fontSize: 9,
    color: C.text,
    flex: 1,
    lineHeight: 1.4,
  },
  infoValueAccent: {
    fontSize: 9,
    color: C.navy,
    fontFamily: 'Helvetica-Bold',
    flex: 1,
  },

  // ── Section header (teal left border accent, no boxy bar) ──
  sectionHead: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: C.blue,
    marginTop: 10,
    marginBottom: 4,
    paddingLeft: 8,
    borderLeft: `3 solid ${C.blue}`,
  },

  // ── Body ──
  body: { fontSize: 9.5, lineHeight: 1.5, color: C.text, marginBottom: 6 },
  bodyBold: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.text },
  bodyMuted: { fontSize: 9, color: C.subtext, lineHeight: 1.5, marginBottom: 4 },

  // ── Pill badge ──
  pill: {
    paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3,
    borderRadius: 999, fontSize: 8, fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },

  // ── Pricing table ──
  priceTable: {
    marginBottom: 14,
    borderRadius: 10,
    border: `1 solid ${C.border}`,
    overflow: 'hidden',
  },
  priceHeaderRow: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    padding: '7 12',
  },
  priceHeaderCell: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceDataRow: {
    flexDirection: 'row',
    padding: '7 12',
    borderTop: `1 solid ${C.border}`,
  },
  priceDataAlt: {
    flexDirection: 'row',
    padding: '7 12',
    borderTop: `1 solid ${C.border}`,
    backgroundColor: C.bg,
  },
  priceGroupRow: {
    flexDirection: 'row',
    padding: '5 12',
    backgroundColor: `${C.teal}11`,
    borderTop: `1 solid ${C.border}`,
  },
  priceGroupLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.teal,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Totals ──
  totalsCard: {
    alignSelf: 'flex-end',
    width: 280,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: '12 16',
    border: `1 solid ${C.border}`,
    marginBottom: 16,
  },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  totalLineLabel: { fontSize: 9, color: C.subtext },
  totalLineValue: { fontSize: 9, color: C.subtext, textAlign: 'right' },
  grandLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `1.5 solid ${C.navy}`,
    paddingTop: 6,
    marginTop: 4,
  },
  grandLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy },
  grandValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' },
  depositLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: `${C.blue}18`,
    padding: '5 8',
    borderRadius: 6,
    marginTop: 6,
  },
  depositLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.blue },
  depositValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.blue, textAlign: 'right' },

  // ── Exclusions list ──
  exclusionItem: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 4,
  },
  exclusionDot: { fontSize: 9, color: C.slateLight, marginRight: 6, width: 10 },
  exclusionText: { fontSize: 9, color: C.subtext, flex: 1, lineHeight: 1.4 },

  // ── Terms box ──
  termsBox: {
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: '10 14',
    border: `1 solid ${C.border}`,
    marginBottom: 14,
  },
  termText: { fontSize: 9, color: C.subtext, lineHeight: 1.5, marginBottom: 4 },
  termBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text },

  // ── Dual signature block ──
  sigGrid: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  sigCard: {
    flex: 1,
    borderRadius: 10,
    border: `1 solid ${C.border}`,
    overflow: 'hidden',
  },
  sigCardHeader: {
    backgroundColor: C.navy,
    padding: '6 12',
  },
  sigCardHeaderText: {
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sigRow: {
    flexDirection: 'row',
    borderTop: `1 solid ${C.border}`,
    minHeight: 24,
  },
  sigRowLabel: {
    width: 38,
    padding: '5 6',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.slate,
    textAlign: 'right',
    borderRight: `1 solid ${C.border}`,
  },
  sigRowValue: {
    flex: 1,
    padding: '5 8',
    fontSize: 9,
    color: C.text,
  },

  // ── T&C page ──
  tcTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.blue,
    marginTop: 10,
    marginBottom: 2,
  },
  tcBody: { fontSize: 8.5, color: C.subtext, lineHeight: 1.45, marginBottom: 4 },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 52,
    right: 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${C.border}`,
    paddingTop: 5,
  },
  footerText: { fontSize: 7.5, color: C.slateLight },
});

// ─── Shared Components ────────────────────────────────────────────────────────

export function Letterhead({ docNumber, date }: { docNumber?: string; date?: string }) {
  return (
    <View style={S.letterhead}>
      <View style={{ flex: 1 }}>
        <Text style={S.companyName}>{COMPANY.name}</Text>
        <Text style={S.companyDetail}>{COMPANY.address}</Text>
        <Text style={S.companyDetail}>{COMPANY.contact}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Image src={LOGO_PATH} style={{ width: LOGO_W, height: LOGO_H }} />
        {docNumber && <Text style={{ fontSize: 8.5, color: C.slate }}>No. {docNumber}</Text>}
        {date && <Text style={{ fontSize: 8.5, color: C.slateLight }}>Date: {date}</Text>}
      </View>
    </View>
  );
}

export function SectionHead({ title }: { title: string }) {
  return <Text style={S.sectionHead}>{title}</Text>;
}

export function InfoGrid({ items }: { items: [string, string, boolean?][] }) {
  return (
    <View style={S.infoGrid}>
      {items.map(([label, value, accent]) => (
        <View key={label} style={S.infoItem}>
          <Text style={S.infoLabel}>{label}</Text>
          <Text style={accent ? S.infoValueAccent : S.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function TotalsCard({ lines, total, deposit }: {
  lines: { label: string; value: number }[];
  total: number;
  deposit: number;
}) {
  return (
    <View style={S.totalsCard}>
      {lines.map(l => (
        <View key={l.label} style={S.totalLine}>
          <Text style={S.totalLineLabel}>{l.label}</Text>
          <Text style={S.totalLineValue}>{fmt(l.value)}</Text>
        </View>
      ))}
      <View style={S.grandLine}>
        <Text style={S.grandLabel}>Total</Text>
        <Text style={S.grandValue}>{fmt(total)}</Text>
      </View>
      <View style={S.depositLine}>
        <Text style={S.depositLabel}>50% Deposit Required</Text>
        <Text style={S.depositValue}>{fmt(deposit)}</Text>
      </View>
    </View>
  );
}

export function ExclusionsList({ extras = [], installationIncluded = true }: {
  extras?: string[];
  installationIncluded?: boolean;
}) {
  const all = [
    ...STANDARD_EXCLUSIONS,
    ...(installationIncluded ? [] : ['Installation']),
    ...extras,
  ];
  return (
    <View style={{ marginBottom: 14 }}>
      {all.map((ex, i) => (
        <View key={i} style={S.exclusionItem}>
          <Text style={S.exclusionDot}>•</Text>
          <Text style={S.exclusionText}>{ex}</Text>
        </View>
      ))}
    </View>
  );
}

export function TermsBox({ deposit, validityDays = 30 }: { deposit: number; validityDays?: number }) {
  return (
    <View style={S.termsBox}>
      <Text style={S.termText}>
        <Text style={S.termBold}>Acceptance: </Text>
        Customer signed proposal and 50% deposit ({fmt(deposit)}) required prior to ordering material or commencing fabrication.
      </Text>
      <Text style={S.termText}>
        <Text style={S.termBold}>Validity: </Text>
        This proposal is valid for {validityDays} calendar days from the date above.
      </Text>
      <Text style={{ ...S.termText, marginBottom: 0 }}>
        <Text style={S.termBold}>Dimensions: </Text>
        Confirmation of layout and field dimensions required prior to ordering or fabricating any custom materials.
      </Text>
    </View>
  );
}

export function DualSigBlock({ preparedBy, date }: {
  preparedBy: { name: string; title?: string };
  date: string;
}) {
  const rows: [string, string, string, string][] = [
    ['Name', '', 'By', preparedBy.name],
    ['Title', '', 'Title', preparedBy.title || 'Project Manager'],
    ['Date', '', 'Date', date],
  ];
  return (
    <View style={S.sigGrid}>
      {[
        { header: 'Accepted By (Customer / Contractor)', rows: rows.map(r => [r[0], r[1]]) },
        { header: 'Kula Glass Company, Inc.', rows: rows.map(r => [r[2], r[3]]) },
      ].map(col => (
        <View key={col.header} style={S.sigCard}>
          <View style={S.sigCardHeader}><Text style={S.sigCardHeaderText}>{col.header}</Text></View>
          {col.rows.map(([label, value]) => (
            <View key={label} style={S.sigRow}>
              <Text style={S.sigRowLabel}>{label}</Text>
              <Text style={S.sigRowValue}>{value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function DocFooter({ docNumber, kID }: { docNumber: string; kID?: string }) {
  return (
    <View style={S.footer}>
      <Text style={S.footerText}>{COMPANY.name}</Text>
      <Text style={S.footerText}>{kID ? `${kID}  ·  ` : ''}{docNumber}  ·  BanyanOS</Text>
    </View>
  );
}

// Full contract T&C page (contract proposals)
export function TCPage({ docNumber }: { docNumber: string }) {
  return (
    <Page size="LETTER" style={S.page}>
      <Letterhead />
      <SectionHead title="Terms and Conditions — 2025" />
      <Text style={{ ...S.bodyMuted, marginBottom: 10 }}>Kula Glass Company, Inc. — Commercial Glass & Glazing</Text>
      {TERMS.map(clause => (
        <View key={clause.num}>
          <Text style={S.tcTitle}>{clause.num}.  {clause.title}</Text>
          <Text style={S.tcBody}>{clause.body}</Text>
        </View>
      ))}
      <DocFooter docNumber={`${docNumber} — Terms & Conditions`} />
    </Page>
  );
}

// Service WO T&C — short, fits on the same page or as a compact second page
export function ServiceTCPage({ docNumber }: { docNumber: string }) {
  return (
    <Page size="LETTER" style={S.page}>
      <Letterhead />
      <View style={S.docTitleRow}>
        <Text style={{ ...S.docTitle, fontSize: 18 }}>Terms &amp; Conditions</Text>
        <Text style={{ ...S.docMeta, alignSelf: 'flex-end' }}>Work Order / Service</Text>
      </View>
      <View style={{ backgroundColor: C.bg, borderRadius: 12, padding: '14 18', border: `1 solid ${C.border}` }}>
        {SERVICE_TERMS.map((clause, i) => (
          <View key={clause.num} style={{ marginBottom: i < SERVICE_TERMS.length - 1 ? 10 : 0 }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.teal, marginBottom: 2 }}>
              {clause.num}.  {clause.title}
            </Text>
            <Text style={{ fontSize: 9, color: C.subtext, lineHeight: 1.45 }}>{clause.body}</Text>
          </View>
        ))}
      </View>
      <DocFooter docNumber={`${docNumber} — Terms & Conditions`} />
    </Page>
  );
}

export function fmt(n: number): string {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function renderToPDF(doc: React.ReactElement<import('@react-pdf/renderer').DocumentProps>): Promise<Buffer> {
  const instance = pdf(doc);
  const ab = await instance.toBlob().then(b => b.arrayBuffer());
  return Buffer.from(ab);
}
