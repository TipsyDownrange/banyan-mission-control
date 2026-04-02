/**
 * Service Work Order / Proposal PDF
 * Matches Joey's canonical format — single lump sum, exclusions, T&C, signatures.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  BASE_STYLES, BRAND, DocHeader, ExclusionsBlock,
  TermsBlock, SignatureBlock, DocFooter, fmt, renderToPDF,
} from './pdf-templates';

export type ServiceWOData = {
  wo_number: string;
  quote_date: string;
  invoice_date?: string;
  // Customer
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  // Project
  project_description: string;
  site_address: string;
  island: string;
  // Scope
  scope_narrative: string;
  line_items: { qty: number; description: string }[];
  installation_included: boolean;
  // Pricing
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
  // Terms
  exclusions_extra?: string[];
  validity_days?: number;
  // Labor detail (shown internally, not to customer)
  labor_detail?: string;
  // Prepared by
  prepared_by: { name: string; email: string; phone: string };
};

function ServiceWOPDF({ data }: { data: ServiceWOData }) {
  return (
    <Document>
      <Page size="LETTER" style={BASE_STYLES.page}>
        <DocHeader
          docType="PROPOSAL"
          docNumber={`WO ${data.wo_number}`}
          date={data.quote_date}
        />

        {/* Invoice date line */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -10, marginBottom: 10 }}>
          <Text style={{ fontSize: 8, color: BRAND.lightGray }}>
            invoice date: {data.invoice_date || '___________'}
          </Text>
        </View>

        {/* Client + Project Info Box */}
        <View style={BASE_STYLES.infoBox}>
          <View style={BASE_STYLES.infoCol}>
            <Text style={BASE_STYLES.infoLabel}>Requested By:</Text>
            <Text style={BASE_STYLES.infoValueBold}>{data.customer_name}</Text>
            {data.customer_email ? <Text style={BASE_STYLES.infoValue}>email: {data.customer_email}</Text> : null}
            <Text style={BASE_STYLES.infoValue}>{data.customer_address}</Text>
            {data.customer_phone ? <Text style={BASE_STYLES.infoValue}>{data.customer_phone}</Text> : null}
          </View>
          <View style={BASE_STYLES.infoColRight}>
            <Text style={BASE_STYLES.infoLabel}>Project:</Text>
            <Text style={BASE_STYLES.infoValueBold}>{data.project_description}</Text>
            <Text style={BASE_STYLES.infoValue}>{data.site_address}</Text>
            {data.island ? <Text style={{ ...BASE_STYLES.infoValue, color: BRAND.teal, fontFamily: 'Helvetica-Bold', marginTop: 4 }}>{data.island}</Text> : null}
          </View>
        </View>

        {/* Job Description Table */}
        <View style={BASE_STYLES.table}>
          {/* Table header */}
          <View style={BASE_STYLES.tableHeader}>
            <Text style={{ ...BASE_STYLES.tableHeaderCell, flex: 1 }}>JOB DESCRIPTION</Text>
            <Text style={{ ...BASE_STYLES.tableHeaderCell, width: 80, textAlign: 'right' }}>AMOUNT</Text>
          </View>

          {/* Scope + line items row */}
          <View style={{ flexDirection: 'row', padding: '10 10 6 10' }}>
            <View style={{ flex: 1 }}>
              {/* Scope narrative */}
              {data.scope_narrative ? (
                <Text style={{ ...BASE_STYLES.bodyText, marginBottom: 8 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>Scope: </Text>
                  {data.scope_narrative}
                </Text>
              ) : null}

              {/* Line items */}
              {data.line_items.filter(li => li.description).map((li, i) => (
                <Text key={i} style={{ ...BASE_STYLES.bodyText, marginBottom: 3 }}>
                  {li.qty} each  {li.description}
                </Text>
              ))}

              {/* Total cost label */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND.text }}>
                  Total cost: materials, crating, shipping, handling, delivery,
                  {data.installation_included ? ' labor, installation, ' : ' '}&amp; taxes
                  {' '}....
                </Text>
              </View>

              {/* Exclusions */}
              <ExclusionsBlock
                extras={data.exclusions_extra}
                installationIncluded={data.installation_included}
              />
            </View>

            {/* Amount column */}
            <View style={{ width: 80, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: BRAND.navy }}>
                {fmt(data.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        <TermsBlock deposit={data.deposit} validityDays={data.validity_days} />

        {/* Labor tracking fields (internal) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ fontSize: 8, color: BRAND.lightGray }}>
            Manpower: ___________   Hours: ___________
          </Text>
          <Text style={{ fontSize: 8, color: BRAND.lightGray }}>
            Total Hours: ___________
          </Text>
        </View>

        {/* Balance due box */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
          <View style={{ border: `1 solid ${BRAND.border}`, borderRadius: 3, padding: '6 12', flexDirection: 'row', gap: 16 }}>
            <Text style={{ fontSize: 9, color: BRAND.subtext }}>Please pay balance</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: BRAND.text }}>
              $ _______________
            </Text>
          </View>
        </View>

        {/* Signatures */}
        <SignatureBlock preparedBy={data.prepared_by} date={data.quote_date} />

        <DocFooter docNumber={`WO ${data.wo_number}`} />
      </Page>
    </Document>
  );
}

export async function generateServiceWOPDF(data: ServiceWOData): Promise<Buffer> {
  return renderToPDF(<ServiceWOPDF data={data} />);
}
