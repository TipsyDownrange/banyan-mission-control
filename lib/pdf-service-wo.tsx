/**
 * Service Work Order / Proposal PDF
 * Matches the actual Kula Glass proposal design.
 * Single lump sum pricing. T&C appended on page 2.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  S, BLUE, GRAY_BORDER, COMPANY, WHITE,
  CompanyHeader, SectionBar, DualSignatureBlock, DocFooter,
  STANDARD_EXCLUSIONS, TERMS_AND_CONDITIONS, fmt, renderToPDF,
} from './pdf-templates';

export type ServiceWOData = {
  wo_number: string;
  quote_date: string;
  invoice_date?: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  project_description: string;
  site_address: string;
  island: string;
  scope_narrative: string;
  line_items: { qty: number; description: string }[];
  installation_included: boolean;
  materials_total: number;
  labor_subtotal: number;
  equipment_charges: number;
  additional_charges: { label: string; amount: number }[];
  site_visit_fee?: number;
  site_visit_credit?: number;
  subtotal: number;
  get_amount: number;
  total: number;
  deposit: number;
  exclusions_extra?: string[];
  validity_days?: number;
  prepared_by: { name: string; email: string; phone: string };
};

function ServiceWOPDF({ data }: { data: ServiceWOData }) {
  const allExclusions = [
    ...STANDARD_EXCLUSIONS,
    ...(data.installation_included ? [] : ['Installation']),
    ...(data.exclusions_extra || []),
  ];

  return (
    <Document>
      {/* ── PAGE 1: PROPOSAL FACE SHEET ── */}
      <Page size="LETTER" style={S.page}>
        <CompanyHeader docNumber={`WO ${data.wo_number}`} date={data.quote_date} />

        {/* PROPOSAL title */}
        <Text style={S.docTitle}>PROPOSAL</Text>

        {/* Project info table */}
        <View style={[S.infoTable, { marginBottom: 14 }]}>
          {[
            ['Date', data.quote_date, 'WO Number', `WO ${data.wo_number}`],
            ['Customer', data.customer_name, 'Phone', data.customer_phone],
            ['Address', data.customer_address, 'Email', data.customer_email],
            ['Project', data.project_description, 'Island', data.island],
            ['Site Address', data.site_address, 'Prepared By', data.prepared_by.name],
          ].map(([l1, v1, l2, v2], i, arr) => (
            <View key={l1} style={i === arr.length - 1 ? S.infoRowLast : S.infoRow}>
              <View style={S.infoCell}>
                <Text style={S.infoLabel}>{l1}</Text>
                <Text style={S.infoValue}>{v1}</Text>
              </View>
              <View style={S.infoCellLast}>
                <Text style={S.infoLabel}>{l2}</Text>
                <Text style={S.infoValue}>{v2}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Intro sentence */}
        <Text style={{ ...S.bodyText, marginBottom: 14 }}>
          {COMPANY.name} hereby proposes to furnish and{' '}
          <Text style={S.bodyBold}>
            {data.installation_included ? 'install' : 'supply'}
          </Text>
          {' '}the following for the above-referenced project.
        </Text>

        {/* SCOPE & PRICING */}
        <SectionBar title="Scope & Pricing Summary" />

        {/* Job description table */}
        <View style={[S.priceTable, { marginBottom: 12 }]}>
          <View style={S.priceHeaderRow}>
            <View style={{ flex: 1, ...S.priceHeaderCell }}><Text>JOB DESCRIPTION</Text></View>
            <View style={{ width: 90, ...S.priceHeaderCell, textAlign: 'right', borderRight: 0 }}><Text>AMOUNT</Text></View>
          </View>
          <View style={{ flexDirection: 'row', padding: '10 10 6 10' }}>
            <View style={{ flex: 1 }}>
              {/* Scope narrative */}
              {data.scope_narrative ? (
                <Text style={{ ...S.bodyText, marginBottom: 8 }}>
                  <Text style={S.bodyBold}>Scope: </Text>{data.scope_narrative}
                </Text>
              ) : null}
              {/* Line items */}
              {data.line_items.filter(li => li.description).map((li, i) => (
                <Text key={i} style={{ ...S.bodyText, marginBottom: 3 }}>
                  {li.qty} each  {li.description}
                </Text>
              ))}
              {/* Total cost label */}
              <View style={{ marginTop: 12 }}>
                <Text style={S.bodyBold}>
                  Total cost: materials, crating, shipping, handling, delivery,
                  {data.installation_included ? ' labor, installation,' : ''} & taxes  ....
                </Text>
              </View>
            </View>
            {/* Amount */}
            <View style={{ width: 90, alignItems: 'flex-end', justifyContent: 'flex-end', paddingLeft: 10 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: BLUE }}>{fmt(data.total)}</Text>
            </View>
          </View>
        </View>

        {/* GET breakdown */}
        <View style={S.totalsBlock}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Subtotal</Text>
            <Text style={S.totalValue}>{fmt(data.subtotal)}</Text>
          </View>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Hawaii GET (4.5%)</Text>
            <Text style={S.totalValue}>{fmt(data.get_amount)}</Text>
          </View>
          <View style={[S.totalRow, { marginTop: 4 }]}>
            <Text style={S.grandTotalLabel}>TOTAL PROPOSAL AMOUNT</Text>
            <Text style={S.grandTotalValue}>{fmt(data.total)}</Text>
          </View>
          <View style={[S.totalRow, { marginTop: 6 }]}>
            <Text style={{ ...S.totalLabel, fontSize: 9 }}>50% Deposit Required to Commence</Text>
            <Text style={{ ...S.totalValue, fontFamily: 'Helvetica-Bold', color: BLUE }}>{fmt(data.deposit)}</Text>
          </View>
        </View>

        {/* EXCLUSIONS */}
        <SectionBar title="Exclusions" />
        <View style={{ marginBottom: 12 }}>
          {allExclusions.map((ex, i) => (
            <Text key={i} style={{ ...S.bodyText, marginBottom: 2 }}>•  {ex}</Text>
          ))}
        </View>

        {/* Validity + T&C note */}
        <View style={{ marginBottom: 12 }}>
          <Text style={S.bodyText}>
            <Text style={S.bodyBold}>Proposal Validity: </Text>
            This proposal is valid for {data.validity_days || 30} calendar days from the date above.
          </Text>
          <Text style={S.bodyText}>
            <Text style={S.bodyBold}>Acceptance: </Text>
            This proposal, together with the attached Terms and Conditions, shall govern upon acceptance. Customer signed proposal and 50% deposit ({fmt(data.deposit)}) are required prior to ordering material or commencing fabrication.
          </Text>
          <Text style={S.bodyText}>
            <Text style={S.bodyBold}>Dimensions: </Text>
            Confirmation of layout and field dimensions is required prior to ordering or fabricating any custom materials.
          </Text>
        </View>

        {/* Labor tracking (internal) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 8.5, color: '#999' }}>Manpower: _______________   Hours: _______________</Text>
          <Text style={{ fontSize: 8.5, color: '#999' }}>Total Hours: _______________</Text>
        </View>

        {/* Balance due box */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
          <View style={{ border: `1 solid ${GRAY_BORDER}`, padding: '6 16', flexDirection: 'row', gap: 20 }}>
            <Text style={{ fontSize: 9.5 }}>Please pay balance</Text>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold' }}>$ _______________</Text>
          </View>
        </View>

        {/* Signature block */}
        <DualSignatureBlock
          preparedBy={{ name: data.prepared_by.name, title: 'Estimator / Service PM' }}
          date={data.quote_date}
        />

        <DocFooter docNumber={`WO ${data.wo_number}`} />
      </Page>

      {/* ── PAGE 2: TERMS & CONDITIONS ── */}
      <Page size="LETTER" style={S.page}>
        <CompanyHeader />
        <SectionBar title="Terms and Conditions" />
        <Text style={{ ...S.bodyText, marginBottom: 10, fontFamily: 'Helvetica-Bold' }}>
          KULA GLASS COMPANY, INC. — Commercial Glass & Glazing Subcontract
        </Text>
        {TERMS_AND_CONDITIONS.map(clause => (
          <View key={clause.num}>
            <Text style={S.tcClauseTitle}>{clause.num}. {clause.title}</Text>
            <Text style={S.tcBody}>{clause.body}</Text>
          </View>
        ))}
        <DocFooter docNumber={`WO ${data.wo_number} — Terms & Conditions`} />
      </Page>
    </Document>
  );
}

export async function generateServiceWOPDF(data: ServiceWOData): Promise<Buffer> {
  return renderToPDF(<ServiceWOPDF data={data} />);
}
