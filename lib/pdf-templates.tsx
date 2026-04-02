/**
 * BanyanOS PDF Template System
 * Matches the actual Kula Glass proposal design:
 * - Company info box (top left, thin border)
 * - Logo (top right, blue line art)
 * - "PROPOSAL" title centered in serif bold
 * - Blue section header bars (full width, white text)
 * - Sans-serif body text
 * - 23-clause T&C
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// ─── Brand ────────────────────────────────────────────────────────────────────

export const BLUE = '#2E6DA4';        // Primary blue (section headers, table headers)
export const BLUE_LIGHT = '#D6E4F3'; // Light blue (table header bg)
export const BLACK = '#000000';
export const GRAY_BORDER = '#AAAAAA';
export const GRAY_TEXT = '#555555';
export const WHITE = '#FFFFFF';

export const COMPANY = {
  name:    'Kula Glass Company, Inc.',
  street:  '289 Pakana Street',
  city:    'Wailuku, Hawaii 96793',
  phone:   'P: (808) 242-8999',
  fax:     'F: (808) 242-7822',
  license: 'Lic. C-20080',
};

// ─── Shared Styles ────────────────────────────────────────────────────────────

export const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: BLACK,
    padding: '54 54 54 54',
    lineHeight: 1.4,
    backgroundColor: WHITE,
  },

  // ── Company header block ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  companyBox: {
    border: `1 solid ${BLACK}`,
    padding: '6 10',
    width: 220,
  },
  companyName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  logoBox: {
    width: 76,
    height: 70,
    border: `1.5 solid ${BLUE}`,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FB',
  },
  logoInner: {
    fontSize: 6,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 1.6,
  },

  // ── Big document title ──
  docTitle: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    color: BLACK,
    marginBottom: 16,
    marginTop: 8,
    letterSpacing: 1,
  },

  // ── Info table (project details) ──
  infoTable: {
    flexDirection: 'column',
    border: `0.5 solid ${GRAY_BORDER}`,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottom: `0.5 solid ${GRAY_BORDER}`,
  },
  infoRowLast: {
    flexDirection: 'row',
  },
  infoCell: {
    flex: 1,
    flexDirection: 'row',
    borderRight: `0.5 solid ${GRAY_BORDER}`,
  },
  infoCellLast: {
    flex: 1,
    flexDirection: 'row',
  },
  infoLabel: {
    width: 70,
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'right',
    borderRight: `0.5 solid ${GRAY_BORDER}`,
    color: BLACK,
  },
  infoValue: {
    flex: 1,
    padding: '4 6',
    fontSize: 9,
    color: BLACK,
  },

  // ── Blue section header bar ──
  sectionBar: {
    backgroundColor: BLUE,
    padding: '5 8',
    marginBottom: 8,
    marginTop: 14,
  },
  sectionBarText: {
    color: WHITE,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Pricing table ──
  priceTable: {
    border: `0.5 solid ${GRAY_BORDER}`,
    marginBottom: 8,
  },
  priceHeaderRow: {
    flexDirection: 'row',
    backgroundColor: BLUE,
  },
  priceHeaderCell: {
    padding: '5 6',
    color: WHITE,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    borderRight: `0.5 solid ${WHITE}`,
  },
  priceGroupRow: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderBottom: `0.5 solid ${GRAY_BORDER}`,
  },
  priceGroupCell: {
    flex: 1,
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  priceDataRow: {
    flexDirection: 'row',
    borderBottom: `0.5 solid ${GRAY_BORDER}`,
  },
  priceCellBid: { width: 80, padding: '4 6', fontSize: 9, borderRight: `0.5 solid ${GRAY_BORDER}` },
  priceCellDesc: { flex: 1, padding: '4 6', fontSize: 9, borderRight: `0.5 solid ${GRAY_BORDER}` },
  priceCellQty: { width: 60, padding: '4 6', fontSize: 9, textAlign: 'center', borderRight: `0.5 solid ${GRAY_BORDER}` },
  priceCellAmt: { width: 80, padding: '4 6', fontSize: 9, textAlign: 'right' },

  // ── Totals ──
  totalsBlock: {
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 3,
    width: 280,
  },
  totalLabel: {
    width: 180,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    paddingRight: 10,
  },
  totalValue: {
    width: 100,
    fontSize: 9.5,
    textAlign: 'right',
    borderBottom: `0.5 solid ${GRAY_BORDER}`,
    paddingBottom: 2,
  },
  grandTotalLabel: {
    width: 180,
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    paddingRight: 10,
    color: BLUE,
  },
  grandTotalValue: {
    width: 100,
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    color: BLUE,
    borderTop: `1.5 solid ${BLUE}`,
    borderBottom: `1.5 solid ${BLUE}`,
    paddingTop: 2,
    paddingBottom: 2,
  },

  // ── Content area (free text, exclusions etc) ──
  contentArea: {
    fontSize: 9.5,
    lineHeight: 1.5,
    marginBottom: 10,
    minHeight: 40,
  },
  contentUnderline: {
    borderBottom: `0.5 solid ${GRAY_BORDER}`,
    marginTop: 3,
    height: 1,
  },

  // ── Body text ──
  bodyText: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 6 },
  bodyBold: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },

  // ── Dual signature block ──
  sigTable: {
    border: `0.5 solid ${GRAY_BORDER}`,
    marginTop: 16,
  },
  sigHeaderRow: {
    flexDirection: 'row',
  },
  sigHeaderCell: {
    flex: 1,
    backgroundColor: BLUE,
    padding: '5 8',
  },
  sigHeaderText: {
    color: WHITE,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  sigHeaderDivider: {
    width: 1,
    backgroundColor: WHITE,
  },
  sigDataRow: {
    flexDirection: 'row',
    borderTop: `0.5 solid ${GRAY_BORDER}`,
    minHeight: 22,
  },
  sigLeft: {
    flex: 1,
    flexDirection: 'row',
    borderRight: `0.5 solid ${GRAY_BORDER}`,
  },
  sigRight: {
    flex: 1,
    flexDirection: 'row',
  },
  sigRowLabel: {
    width: 40,
    padding: '4 6',
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'right',
    borderRight: `0.5 solid ${GRAY_BORDER}`,
    color: BLACK,
  },
  sigRowValue: {
    flex: 1,
    padding: '4 6',
    fontSize: 9,
  },

  // ── T&C ──
  tcClauseTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    marginTop: 12,
    marginBottom: 3,
  },
  tcBody: {
    fontSize: 9,
    lineHeight: 1.45,
    color: BLACK,
    marginBottom: 4,
  },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 54,
    right: 54,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${GRAY_BORDER}`,
    paddingTop: 5,
  },
  footerText: { fontSize: 7.5, color: GRAY_TEXT },
});

// ─── Company Header ───────────────────────────────────────────────────────────

export function CompanyHeader({ docNumber, date }: { docNumber?: string; date?: string }) {
  return (
    <View style={S.headerRow}>
      <View style={S.companyBox}>
        <Text style={S.companyName}>{COMPANY.name}</Text>
        <Text style={S.companyDetail}>{COMPANY.street}  •  {COMPANY.city}</Text>
        <Text style={S.companyDetail}>{COMPANY.phone}  •  {COMPANY.fax}  •  {COMPANY.license}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {docNumber && <Text style={{ fontSize: 9, color: GRAY_TEXT }}>No. {docNumber}</Text>}
        {date && <Text style={{ fontSize: 9, color: GRAY_TEXT }}>Date: {date}</Text>}
        {/* Logo placeholder — replace with Image once logo file provided */}
        <View style={S.logoBox}>
          <Text style={S.logoInner}>{'[KG\nLOGO]'}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Section Header Bar ───────────────────────────────────────────────────────

export function SectionBar({ title }: { title: string }) {
  return (
    <View style={S.sectionBar}>
      <Text style={S.sectionBarText}>{title}</Text>
    </View>
  );
}

// ─── Standard Exclusions ─────────────────────────────────────────────────────

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

// ─── T&C Text (2025 version) ─────────────────────────────────────────────────

export const TERMS_AND_CONDITIONS = [
  { num: '1', title: 'Commencement, Mutual Schedule & Scope Review', body: 'This proposal shall not become a binding contract until: (a) a mutually agreed written project schedule is attached and signed by both parties, and (b) a scope-review meeting has been held between Kula Glass and General Contractor to review drawings, specifications, exclusions, schedule, sequence, and access. Work shall commence based on the mutually agreed-upon schedule. Subcontractor shall not be responsible for delays caused by any reason beyond its reasonable control.' },
  { num: '1A', title: 'Force Majeure', body: 'Subcontractor shall not be liable for any delay or failure to perform caused by acts of God, war, terrorism, pandemic/epidemic, government orders, fire, flood, earthquake, embargo, riot, labor disputes (including union strikes or shortages), supply-chain disruption, or any other event beyond Subcontractor\'s reasonable control. Subcontractor shall receive an equitable time extension and compensation for increased costs resulting from such events.' },
  { num: '1B', title: 'Liquidated and Consequential Damages Waiver', body: 'Owner and General Contractor waive all claims against Subcontractor for liquidated, consequential, indirect, special, or punitive damages of any kind arising from Subcontractor\'s performance or delay.' },
  { num: '2', title: 'Tariff / Import Duty / Trade Act Protection', body: 'The contract price is based on current tariffs, duties, anti-dumping penalties, and trade restrictions in effect on the proposal date. Any new, increased, or retroactive tariffs or government-imposed costs on glass, aluminum, or components shall be added to the contract price via change order upon proof of increase.' },
  { num: '3', title: 'Payment Terms – Pay-If-Paid', body: 'Payment by Owner to General Contractor is an express condition precedent to General Contractor\'s obligation to pay Subcontractor. Progress payments of 90% of the value of Work performed shall be due on or before the 10th of the following month. Retention shall be reduced to 5% at 50% completion and to 0% upon 100% completion. Final payment due within 30 days after substantial completion. Past-due amounts bear interest at 1.5% per month. Subcontractor may stop work without notice if any invoice remains unpaid for 30 days.' },
  { num: '4', title: 'Overtime and Shift Work', body: 'All Work is based on straight-time labor. Any overtime, weekend, or shift work required by schedule or General Contractor shall be paid as extra work at premium rates.' },
  { num: '5', title: 'Escalation', body: 'If this proposal is accepted more than 60 days after the proposal date, or if materials are not released for fabrication within 90 days of contract execution, Subcontractor may increase the price to reflect documented cost increases in glass, aluminum, freight, tariffs, or labor.' },
  { num: '6', title: 'Openings, Backing, and Substrates', body: 'All openings, blocking, structural steel, and substrates shall be plumb, square, and within 1/8" in 10\'-0" tolerance before Subcontractor begins.' },
  { num: '7', title: 'Storage and Hoisting', body: 'General Contractor shall provide, at no cost, locked storage and unrestricted use of hoists, cranes, and elevators.' },
  { num: '8', title: 'Site Conditions and Utilities', body: 'General Contractor shall provide, at no cost: heat, power, water, sanitary facilities, scaffolding, swing stages, trash removal, and temporary enclosures.' },
  { num: '9', title: 'Damage After Installation', body: 'Subcontractor is not liable for breakage, scratching, or vandalism after installation unless caused solely by its employees.' },
  { num: '10', title: 'No Back-Charges', body: 'No back-charges without seven (7) days\' prior written notice and opportunity to cure.' },
  { num: '11', title: 'Changes and Extra Work', body: 'No extra work or change without a signed written change order. Verbal orders are not binding.' },
  { num: '12', title: 'Notice of Claims', body: 'Claims for additional time or money must be submitted in writing within seven (7) calendar days of the event.' },
  { num: '13', title: 'Termination or Suspension', body: 'Termination for convenience or suspension > 30 days entitles Subcontractor to payment for Work performed plus profit on unperformed Work, restocking, and demobilization costs.' },
  { num: '14', title: 'Insurance and Indemnity', body: 'Indemnity limited to Subcontractor\'s sole negligence. No indemnity for design defects or others\' negligence.' },
  { num: '15', title: 'Disputes and Governing Law', body: 'Governed by laws of the State of Hawaii. Venue in Maui County. Prevailing party recovers attorneys\' fees.' },
  { num: '16', title: 'Entire Agreement / Severability', body: 'This document and accepted proposal constitute the entire agreement. Invalid provisions do not affect the remainder.' },
  { num: '17', title: 'Acceptance and Validity', body: 'Valid for 30 days. Subject to credit approval and correction of clerical errors.' },
];

// ─── Dual Signature Block ─────────────────────────────────────────────────────

export function DualSignatureBlock({ preparedBy, date }: {
  preparedBy: { name: string; title?: string; date?: string };
  date: string;
}) {
  return (
    <View style={S.sigTable}>
      <View style={S.sigHeaderRow}>
        <View style={[S.sigHeaderCell, { borderRight: `1 solid ${WHITE}` }]}>
          <Text style={S.sigHeaderText}>ACCEPTED BY (Customer / Contractor)</Text>
        </View>
        <View style={S.sigHeaderCell}>
          <Text style={S.sigHeaderText}>KULA GLASS COMPANY, INC.</Text>
        </View>
      </View>
      {[
        ['Name', '', 'By', preparedBy.name],
        ['Title', '', 'Title', preparedBy.title || 'Estimator / Project Manager'],
        ['Date', '', 'Date', date],
      ].map(([ll, lv, rl, rv]) => (
        <View key={ll} style={S.sigDataRow}>
          <View style={S.sigLeft}>
            <Text style={S.sigRowLabel}>{ll}</Text>
            <Text style={S.sigRowValue}>{lv}</Text>
          </View>
          <View style={S.sigRight}>
            <Text style={S.sigRowLabel}>{rl}</Text>
            <Text style={S.sigRowValue}>{rv}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function DocFooter({ docNumber, kID }: { docNumber: string; kID?: string }) {
  return (
    <View style={S.footer}>
      <Text style={S.footerText}>{COMPANY.name}  •  {docNumber}</Text>
      <Text style={S.footerText}>{kID ? `${kID}  •  ` : ''}BanyanOS</Text>
    </View>
  );
}

// ─── Currency formatter ───────────────────────────────────────────────────────

export function fmt(n: number): string {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── PDF buffer helper ────────────────────────────────────────────────────────

export async function renderToPDF(doc: React.ReactElement<import('@react-pdf/renderer').DocumentProps>): Promise<Buffer> {
  const instance = pdf(doc);
  const arrayBuffer = await instance.toBlob().then(b => b.arrayBuffer());
  return Buffer.from(arrayBuffer);
}
