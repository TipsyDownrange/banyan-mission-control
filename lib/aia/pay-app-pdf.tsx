/**
 * BAN-336 Pay App Core — three PDF renderers branched on
 * pay_applications.billing_format.
 *
 *   AIA_G702_G703            — Standard AIA template (modeled on the Hokuala
 *                              Hotel May 2026 reference).
 *   CUSTOM_TEMPLATE_AIA_STYLE — Cover + 2-page Breakdown (Blazy / War Memorial
 *                              Gym reference). 5% retainage default, no
 *                              architect cert section.
 *   CUSTOM_TEMPLATE_SCHEDULE_ABC — Schedule A summary + Schedule B detail +
 *                              Schedule C materials (South Hilo Parks
 *                              Baseyard reference).
 *
 * Pure render — caller persists & uploads to Drive. Pure functions to keep
 * the route layer thin and testable; the renderToPDF helper from
 * `lib/pdf-templates` is reused.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { fmt, renderToPDF } from '../pdf-templates';
import type { G702Summary, G703LineCalc } from './pay-app-calc';

export type PayAppPdfFormat =
  | 'AIA_G702_G703'
  | 'CUSTOM_TEMPLATE_AIA_STYLE'
  | 'CUSTOM_TEMPLATE_SCHEDULE_ABC';

export interface PayAppPdfHeader {
  project_name: string;
  kid: string;
  pay_app_number: number;
  period_start: string;
  period_end: string;
  gc_name?: string;
  gc_address?: string;
  contractor_name?: string;
  architect_name?: string;
  application_date?: string;
  contract_for?: string;
}

export interface PayAppPdfLine extends G703LineCalc {
  display_item_number?: string | null;
  description: string;
  parent_line_id?: string | null;
  sov_line_id?: string | null;
  is_parent_rollup?: boolean;
}

export interface PayAppPdfInput {
  format: PayAppPdfFormat;
  header: PayAppPdfHeader;
  summary: G702Summary;
  lines: PayAppPdfLine[];
  net_change_co_footnote?: string;   // itemizes COs + TM auths billed-to-date
  ge_tax_summary_line?: number;      // HI GET 4.712%
  retainage_pct_completed: number;
  retainage_pct_stored: number;
}

const S = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica', color: '#0f172a' },
  pageTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#0c2330' },
  subTitle: { fontSize: 9, color: '#475569', marginBottom: 10 },
  hdrRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  hdrCell: { fontSize: 8, color: '#334155' },
  hdrLabel: { fontWeight: 700, color: '#0f172a' },
  table: { borderWidth: 0.5, borderColor: '#0f172a', marginTop: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#cbd5e1' },
  th: { padding: 4, backgroundColor: '#0c2330', color: '#fff', fontSize: 7, fontWeight: 700 },
  td: { padding: 3, fontSize: 7 },
  tdRight: { padding: 3, fontSize: 7, textAlign: 'right' },
  parentRow: { backgroundColor: '#f1f5f9' },
  summaryRow: { backgroundColor: '#fef3c7' },
  footnote: { fontSize: 7, color: 'var(--bos-color-ink-disabled)', marginTop: 6, fontStyle: 'italic' },
  signatureBlock: { marginTop: 24, flexDirection: 'row', justifyContent: 'space-between' },
  signatureBox: { width: '45%', borderTopWidth: 0.5, borderColor: '#0f172a', paddingTop: 4 },
});

// ── Shared header block ────────────────────────────────────────────────────
function HeaderBlock({ header }: { header: PayAppPdfHeader }) {
  return (
    <View>
      <View style={S.hdrRow}>
        <Text style={S.hdrCell}>
          <Text style={S.hdrLabel}>Project: </Text>{header.project_name}
        </Text>
        <Text style={S.hdrCell}>
          <Text style={S.hdrLabel}>kID: </Text>{header.kid}
        </Text>
      </View>
      <View style={S.hdrRow}>
        <Text style={S.hdrCell}>
          <Text style={S.hdrLabel}>Pay App #: </Text>{header.pay_app_number}
        </Text>
        <Text style={S.hdrCell}>
          <Text style={S.hdrLabel}>Period: </Text>
          {header.period_start} → {header.period_end}
        </Text>
      </View>
      {header.gc_name && (
        <View style={S.hdrRow}>
          <Text style={S.hdrCell}><Text style={S.hdrLabel}>To: </Text>{header.gc_name}</Text>
          {header.contractor_name && (
            <Text style={S.hdrCell}>
              <Text style={S.hdrLabel}>Contractor: </Text>{header.contractor_name}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── G702 summary (used by all 3 formats with optional sections) ────────────
function G702SummaryBlock({ s, includeArchitectCert, footnote, geTaxSummary }: {
  s: G702Summary;
  includeArchitectCert: boolean;
  footnote?: string;
  geTaxSummary?: number;
}) {
  const row = (n: string, label: string, value: number, bold?: boolean) => (
    <View style={[S.tr, bold ? S.summaryRow : {}]} key={n}>
      <View style={{ width: '8%' }}><Text style={S.td}>{n}</Text></View>
      <View style={{ flex: 1 }}><Text style={S.td}>{label}</Text></View>
      <View style={{ width: 110 }}><Text style={S.tdRight}>{fmt(value)}</Text></View>
    </View>
  );
  return (
    <View style={S.table}>
      <View style={S.tr}>
        <View style={{ flex: 1 }}><Text style={[S.th, { textAlign: 'left' }]}>G702 SUMMARY</Text></View>
      </View>
      {row('1', 'Original Contract Sum', s.line1_original_contract_sum)}
      {row('2', 'Net Change by Change Orders', s.line2_net_change_by_co)}
      {row('3', 'Contract Sum to Date (1+2)', s.line3_contract_sum_to_date, true)}
      {row('4', 'Total Completed & Stored', s.line4_total_completed_and_stored)}
      {row('5a', 'Retainage — Completed Work', s.line5a_retainage_completed_work)}
      {row('5b', 'Retainage — Stored Materials', s.line5b_retainage_stored_materials)}
      {row('5', 'Total Retainage', s.line5_total_retainage)}
      {row('6', 'Total Earned Less Retainage', s.line6_total_earned_less_retainage)}
      {row('7', 'Less Previous Certificates', s.line7_less_previous_certificates)}
      {row('8', 'Current Payment Due', s.line8_current_payment_due, true)}
      {row('9', 'Balance to Finish + Retainage', s.line9_balance_to_finish_plus_retainage)}
      {geTaxSummary !== undefined && (
        <View style={[S.tr, S.summaryRow]}>
          <View style={{ width: '8%' }}><Text style={S.td}>HI</Text></View>
          <View style={{ flex: 1 }}><Text style={S.td}>HI GET (locked C3 — summary line)</Text></View>
          <View style={{ width: 110 }}><Text style={S.tdRight}>{fmt(geTaxSummary)}</Text></View>
        </View>
      )}
      {footnote && (
        <View style={{ marginTop: 6 }}>
          <Text style={S.footnote}>Note (line 2):</Text>
          {footnote.split('\n').map((line, i) => (
            <Text style={S.footnote} key={i}>{line}</Text>
          ))}
        </View>
      )}
      {includeArchitectCert && (
        <View style={{ padding: 6, borderTopWidth: 0.5, borderColor: '#0f172a' }}>
          <Text style={{ fontSize: 7, color: '#0f172a' }}>
            ARCHITECT&apos;S CERTIFICATE FOR PAYMENT — In accordance with the Contract
            Documents, based on on-site observations and the data comprising this
            application, the Architect certifies to the Owner that to the best of
            the Architect&apos;s knowledge, information and belief the Work has progressed
            as indicated, the quality of the Work is in accordance with the Contract
            Documents, and the Contractor is entitled to payment of the AMOUNT CERTIFIED.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── G703 detail block ──────────────────────────────────────────────────────
function G703Detail({ lines }: { lines: PayAppPdfLine[] }) {
  return (
    <View style={S.table}>
      <View style={S.tr}>
        <View style={{ width: 28 }}><Text style={S.th}>A Item</Text></View>
        <View style={{ flex: 1 }}><Text style={S.th}>B Description</Text></View>
        <View style={{ width: 60 }}><Text style={S.th}>C Sched</Text></View>
        <View style={{ width: 55 }}><Text style={S.th}>D Prev</Text></View>
        <View style={{ width: 55 }}><Text style={S.th}>E ThisP</Text></View>
        <View style={{ width: 55 }}><Text style={S.th}>F Stored</Text></View>
        <View style={{ width: 60 }}><Text style={S.th}>G Total</Text></View>
        <View style={{ width: 28 }}><Text style={S.th}>H %</Text></View>
        <View style={{ width: 55 }}><Text style={S.th}>I Retn</Text></View>
      </View>
      {lines.map((l, i) => (
        <View style={[S.tr, l.is_parent_rollup ? S.parentRow : {}]} key={i}>
          <View style={{ width: 28 }}><Text style={S.td}>{l.display_item_number ?? String(i + 1)}</Text></View>
          <View style={{ flex: 1 }}><Text style={S.td}>{l.description}</Text></View>
          <View style={{ width: 60 }}><Text style={S.tdRight}>{fmt(l.scheduled_value)}</Text></View>
          <View style={{ width: 55 }}><Text style={S.tdRight}>{fmt(l.work_completed_previous)}</Text></View>
          <View style={{ width: 55 }}><Text style={S.tdRight}>{fmt(l.work_completed_this_period)}</Text></View>
          <View style={{ width: 55 }}><Text style={S.tdRight}>{fmt(l.materials_stored_this_period)}</Text></View>
          <View style={{ width: 60 }}><Text style={S.tdRight}>{fmt(l.total_completed_to_date)}</Text></View>
          <View style={{ width: 28 }}><Text style={S.tdRight}>{(l.pct_complete * 100).toFixed(0)}%</Text></View>
          <View style={{ width: 55 }}><Text style={S.tdRight}>{fmt(l.retainage_held)}</Text></View>
        </View>
      ))}
    </View>
  );
}

// ── Format 1: AIA G702/G703 (standard, with architect cert) ────────────────
function PayAppDocAIA(input: PayAppPdfInput) {
  return (
    <Document>
      <Page size="LETTER" style={S.page} orientation="portrait">
        <Text style={S.pageTitle}>APPLICATION AND CERTIFICATE FOR PAYMENT (AIA G702)</Text>
        <Text style={S.subTitle}>Pay Application #{input.header.pay_app_number}</Text>
        <HeaderBlock header={input.header} />
        <G702SummaryBlock
          s={input.summary}
          includeArchitectCert={true}
          footnote={input.net_change_co_footnote}
          geTaxSummary={input.ge_tax_summary_line}
        />
      </Page>
      <Page size="LETTER" style={S.page} orientation="landscape">
        <Text style={S.pageTitle}>CONTINUATION SHEET (AIA G703)</Text>
        <HeaderBlock header={input.header} />
        <G703Detail lines={input.lines} />
      </Page>
    </Document>
  );
}

// ── Format 2: Custom AIA-style (Blazy War Memorial Gym) ────────────────────
function PayAppDocCustomAIA(input: PayAppPdfInput) {
  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Text style={S.pageTitle}>PAY APPLICATION — COVER SHEET</Text>
        <Text style={S.subTitle}>
          Custom AIA-style format · 5% retainage default · No architect certification
        </Text>
        <HeaderBlock header={input.header} />
        <G702SummaryBlock
          s={input.summary}
          includeArchitectCert={false}
          footnote={input.net_change_co_footnote}
          geTaxSummary={input.ge_tax_summary_line}
        />
        <View style={S.signatureBlock}>
          <View style={S.signatureBox}>
            <Text>Contractor signature / date</Text>
          </View>
          <View style={S.signatureBox}>
            <Text>Owner approval / date</Text>
          </View>
        </View>
      </Page>
      <Page size="LETTER" style={S.page} orientation="landscape">
        <Text style={S.pageTitle}>BREAKDOWN — Pay App #{input.header.pay_app_number}</Text>
        <HeaderBlock header={input.header} />
        <G703Detail lines={input.lines} />
      </Page>
    </Document>
  );
}

// ── Format 3: Schedule A/B/C (South Hilo Parks Baseyard) ───────────────────
function PayAppDocScheduleABC(input: PayAppPdfInput) {
  const matLines = input.lines.filter((l) => l.materials_stored_this_period > 0);
  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Text style={S.pageTitle}>SCHEDULE A — Summary of Payment Application</Text>
        <HeaderBlock header={input.header} />
        <G702SummaryBlock
          s={input.summary}
          includeArchitectCert={false}
          footnote={input.net_change_co_footnote}
          geTaxSummary={input.ge_tax_summary_line}
        />
      </Page>
      <Page size="LETTER" style={S.page} orientation="landscape">
        <Text style={S.pageTitle}>SCHEDULE B — Line-Item Detail</Text>
        <HeaderBlock header={input.header} />
        <G703Detail lines={input.lines} />
      </Page>
      <Page size="LETTER" style={S.page}>
        <Text style={S.pageTitle}>SCHEDULE C — Materials Presently Stored</Text>
        <HeaderBlock header={input.header} />
        {matLines.length === 0 ? (
          <Text style={S.footnote}>No materials presently stored this period.</Text>
        ) : (
          <View style={S.table}>
            <View style={S.tr}>
              <View style={{ width: 40 }}><Text style={S.th}>Item</Text></View>
              <View style={{ flex: 1 }}><Text style={S.th}>Description</Text></View>
              <View style={{ width: 80 }}><Text style={S.th}>Stored ($)</Text></View>
            </View>
            {matLines.map((l, i) => (
              <View style={S.tr} key={i}>
                <View style={{ width: 40 }}>
                  <Text style={S.td}>{l.display_item_number ?? String(i + 1)}</Text>
                </View>
                <View style={{ flex: 1 }}><Text style={S.td}>{l.description}</Text></View>
                <View style={{ width: 80 }}>
                  <Text style={S.tdRight}>{fmt(l.materials_stored_this_period)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}

export function renderPayAppDocument(input: PayAppPdfInput) {
  switch (input.format) {
    case 'AIA_G702_G703':
      return PayAppDocAIA(input);
    case 'CUSTOM_TEMPLATE_AIA_STYLE':
      return PayAppDocCustomAIA(input);
    case 'CUSTOM_TEMPLATE_SCHEDULE_ABC':
      return PayAppDocScheduleABC(input);
    default: {
      const _exhaustive: never = input.format;
      throw new Error(`Unknown PayApp PDF format: ${String(_exhaustive)}`);
    }
  }
}

export async function renderPayAppPdf(input: PayAppPdfInput): Promise<Buffer> {
  const doc = renderPayAppDocument(input);
  return renderToPDF(doc as React.ReactElement<import('@react-pdf/renderer').DocumentProps>);
}
