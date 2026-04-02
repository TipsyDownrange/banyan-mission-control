/**
 * BanyanOS PDF Template System
 * Shared components and styles for all document types.
 * All documents use the same brand, typography, and layout system.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer';

// ─── Brand Tokens ─────────────────────────────────────────────────────────────

export const BRAND = {
  navy:    '#071722',
  teal:    '#0f766e',
  tealLight: '#14b8a6',
  indigo:  '#4338ca',
  amber:   '#92400e',
  red:     '#c0392b',
  gray:    '#64748b',
  lightGray: '#94a3b8',
  border:  '#e2e8f0',
  bg:      '#f8fafc',
  white:   '#ffffff',
  text:    '#0f172a',
  subtext: '#475569',
};

export const COMPANY = {
  name:    'KULA GLASS COMPANY, INC.',
  address1: '289 Pakana Street  •  Wailuku, Hawaii 96793',
  address2: 'P: (808) 242-8999  •  F: (808) 242-7822  •  Lic. C-20080',
  email:   'info@kulaglass.com',
  // Logo path — set once logo file is added to public folder
  logoPath: process.env.KG_LOGO_PATH || null,
};

// Blue band color matching the letterhead
export const LETTERHEAD_BLUE = '#8A9DC0';
export const LETTERHEAD_RULE = '#C8C8C8';

// ─── Shared Styles ────────────────────────────────────────────────────────────

export const BASE_STYLES = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: BRAND.text,
    padding: '36 48 48 48',
    lineHeight: 1.4,
    backgroundColor: BRAND.white,
  },
  // Header
  companyName: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
    color: BRAND.navy,
  },
  companyInfo: {
    fontSize: 8,
    color: BRAND.gray,
    marginTop: 2,
  },
  docTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.navy,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 4,
    paddingBottom: 6,
    borderBottom: `2 solid ${BRAND.teal}`,
  },
  // Two-column header layout
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  // Info box (bordered)
  infoBox: {
    border: `1 solid ${BRAND.border}`,
    borderRadius: 4,
    padding: '10 12',
    marginBottom: 14,
    flexDirection: 'row',
  },
  infoCol: {
    flex: 1,
    paddingRight: 12,
  },
  infoColRight: {
    flex: 1,
    paddingLeft: 12,
    borderLeft: `1 solid ${BRAND.border}`,
  },
  infoLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: BRAND.lightGray,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 9,
    color: BRAND.text,
    lineHeight: 1.4,
  },
  infoValueBold: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.text,
  },
  // Section headers
  sectionHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: BRAND.gray,
    borderBottom: `0.5 solid ${BRAND.border}`,
    paddingBottom: 4,
    marginBottom: 8,
    marginTop: 14,
  },
  // Table
  table: {
    border: `1 solid ${BRAND.border}`,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BRAND.bg,
    borderBottom: `1 solid ${BRAND.border}`,
    padding: '6 10',
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: BRAND.lightGray,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: `0.5 solid ${BRAND.bg}`,
    padding: '6 10',
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottom: `0.5 solid ${BRAND.bg}`,
    padding: '6 10',
    backgroundColor: '#fafafa',
  },
  tableCell: {
    fontSize: 9,
    color: BRAND.text,
    lineHeight: 1.4,
  },
  tableCellGray: {
    fontSize: 9,
    color: BRAND.gray,
  },
  // Totals
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '5 10',
    borderTop: `0.5 solid ${BRAND.border}`,
  },
  totalLabel: {
    fontSize: 9,
    color: BRAND.subtext,
  },
  totalValue: {
    fontSize: 9,
    color: BRAND.subtext,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '8 10',
    borderTop: `1.5 solid ${BRAND.navy}`,
    marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.navy,
  },
  grandTotalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.navy,
  },
  depositRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '4 10',
    backgroundColor: `${BRAND.teal}11`,
    border: `1 solid ${BRAND.teal}33`,
    borderRadius: 3,
    marginTop: 4,
  },
  depositLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.teal,
  },
  depositValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.teal,
  },
  // Terms
  termsBlock: {
    marginTop: 14,
    padding: '10 12',
    backgroundColor: BRAND.bg,
    border: `0.5 solid ${BRAND.border}`,
    borderRadius: 4,
  },
  termsText: {
    fontSize: 8,
    color: BRAND.subtext,
    lineHeight: 1.5,
    marginBottom: 6,
  },
  // Signature block
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 20,
  },
  sigBlock: {
    flex: 1,
  },
  sigLine: {
    borderBottom: `1 solid ${BRAND.text}`,
    marginBottom: 4,
    height: 24,
  },
  sigLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: BRAND.gray,
    textAlign: 'center',
  },
  sigName: {
    fontSize: 9,
    color: BRAND.subtext,
    textAlign: 'center',
    marginTop: 2,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: `0.5 solid ${BRAND.border}`,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: BRAND.lightGray,
  },
  // Badge
  badge: {
    padding: '2 6',
    borderRadius: 3,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Body text
  bodyText: {
    fontSize: 9,
    color: BRAND.text,
    lineHeight: 1.5,
  },
  bodyTextGray: {
    fontSize: 9,
    color: BRAND.subtext,
    lineHeight: 1.5,
  },
  // WO number chip
  woChip: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: BRAND.teal,
    letterSpacing: 0.3,
  },
  // Meta grid
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
    gap: 0,
  },
  metaItem: {
    width: '50%',
    flexDirection: 'row',
    marginBottom: 5,
  },
  metaLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    width: 90,
    color: BRAND.lightGray,
  },
  metaValue: {
    fontSize: 9,
    flex: 1,
    color: BRAND.text,
  },
});

// ─── Shared Header Component ──────────────────────────────────────────────────

export function DocHeader({ docType, docNumber, date, hideDate }: {
  docType: string;
  docNumber?: string;
  date: string;
  hideDate?: boolean;
}) {
  return (
    <View>
      {/* ── Letterhead ── */}
      <View style={[BASE_STYLES.headerRow, { marginBottom: 6 }]}>
        {/* Left: Company name + address */}
        <View style={{ flex: 1 }}>
          <Text style={BASE_STYLES.companyName}>{COMPANY.name}</Text>
          <Text style={{ ...BASE_STYLES.companyInfo, marginTop: 3 }}>{COMPANY.address1}</Text>
          <Text style={BASE_STYLES.companyInfo}>{COMPANY.address2}</Text>
        </View>
        {/* Right: Logo placeholder (replace with Image when file available) */}
        <View style={{ width: 90, alignItems: 'center', justifyContent: 'center' }}>
          {/* Logo placeholder — blue bordered box until real logo provided */}
          <View style={{ width: 72, height: 64, borderRadius: 3, border: `2 solid ${LETTERHEAD_BLUE}`, alignItems: 'center', justifyContent: 'center', backgroundColor: `${LETTERHEAD_BLUE}11` }}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: LETTERHEAD_BLUE, textAlign: 'center', letterSpacing: 0.3 }}>KULA GLASS</Text>
            <Text style={{ fontSize: 6, color: LETTERHEAD_BLUE, textAlign: 'center', marginTop: 2 }}>🏗</Text>
          </View>
        </View>
      </View>

      {/* ── Blue band ── */}
      <View style={{ height: 18, backgroundColor: LETTERHEAD_BLUE, marginBottom: 1 }} />
      {/* ── Thin rule ── */}
      <View style={{ height: 0.5, backgroundColor: LETTERHEAD_RULE, marginBottom: 10 }} />

      {/* ── Document title row ── */}
      <View style={[BASE_STYLES.headerRow, { marginBottom: 12 }]}>
        <Text style={BASE_STYLES.docTitle}>{docType}</Text>
        <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 4 }}>
          {docNumber && <Text style={BASE_STYLES.woChip}>{docNumber}</Text>}
          {!hideDate && <Text style={{ fontSize: 8, color: BRAND.lightGray, marginTop: 2 }}>Date: {date}</Text>}
        </View>
      </View>
    </View>
  );
}

// ─── Exclusions Block ─────────────────────────────────────────────────────────

export const STANDARD_EXCLUSIONS = [
  'Bond Premium',
  'Extended Warranty',
  'Barricades',
  'Protection',
  'Aluminum frame',
  'Cleaning',
  'Testing',
  'Insurance Exceeding (1) Million',
];

export function ExclusionsBlock({ extras = [], installationIncluded = true }: {
  extras?: string[];
  installationIncluded?: boolean;
}) {
  const all = [
    ...STANDARD_EXCLUSIONS,
    ...(installationIncluded ? [] : ['Installation']),
    ...extras,
  ];
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginBottom: 4, color: BRAND.text }}>
        Exclusions:
      </Text>
      <Text style={BASE_STYLES.bodyTextGray}>{all.join(', ')}</Text>
    </View>
  );
}

// ─── Standard Terms Block ─────────────────────────────────────────────────────

export function TermsBlock({ deposit, validityDays = 30 }: {
  deposit: number;
  validityDays?: number;
}) {
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <View style={BASE_STYLES.termsBlock}>
      <Text style={{ ...BASE_STYLES.termsText, fontFamily: 'Helvetica-Bold', color: BRAND.text }}>
        Customer signed proposal along with 50% deposit ({fmt(deposit)}) is needed, prior to ordering material or starting fabrication.
      </Text>
      <Text style={BASE_STYLES.termsText}>
        This proposal is subject to revisions if not accepted within {validityDays} days after date.
      </Text>
      <Text style={{ ...BASE_STYLES.termsText, marginBottom: 0 }}>
        Confirmation of layout &amp; dimensions is to be provided prior to ordering or fabricating any custom materials.
      </Text>
    </View>
  );
}

// ─── Signature Block ──────────────────────────────────────────────────────────

export function SignatureBlock({ preparedBy, date }: {
  preparedBy: { name: string; email: string; phone: string };
  date: string;
}) {
  return (
    <View style={BASE_STYLES.sigRow}>
      <View style={BASE_STYLES.sigBlock}>
        <View style={BASE_STYLES.sigLine} />
        <Text style={BASE_STYLES.sigLabel}>PREPARED BY</Text>
        <Text style={BASE_STYLES.sigName}>{preparedBy.name}</Text>
        <Text style={{ ...BASE_STYLES.sigName, fontSize: 8 }}>{preparedBy.email}  ·  {preparedBy.phone}</Text>
        <Text style={{ ...BASE_STYLES.sigName, fontSize: 8 }}>Date: {date}</Text>
      </View>
      <View style={BASE_STYLES.sigBlock}>
        <View style={BASE_STYLES.sigLine} />
        <Text style={BASE_STYLES.sigLabel}>ACCEPTED BY</Text>
        <Text style={{ ...BASE_STYLES.sigName, fontSize: 8 }}>Date: _______________</Text>
      </View>
    </View>
  );
}

// ─── Doc Footer ───────────────────────────────────────────────────────────────

export function DocFooter({ docNumber, kID }: { docNumber: string; kID?: string }) {
  return (
    <View style={BASE_STYLES.footer}>
      <Text style={BASE_STYLES.footerText}>BanyanOS · {docNumber}</Text>
      <Text style={BASE_STYLES.footerText}>
        {kID ? `${kID} · ` : ''}{COMPANY.name}
      </Text>
    </View>
  );
}

// ─── Currency formatter ───────────────────────────────────────────────────────

export function fmt(n: number): string {
  return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── PDF buffer helper ────────────────────────────────────────────────────────

export async function renderToPDF(doc: React.ReactElement<import("@react-pdf/renderer").DocumentProps>): Promise<Buffer> {
  const instance = pdf(doc);
  const arrayBuffer = await instance.toBlob().then(b => b.arrayBuffer());
  return Buffer.from(arrayBuffer);
}
