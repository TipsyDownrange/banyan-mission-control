import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  S, C, COMPANY,
  Letterhead, SectionHead, InfoGrid, TotalsCard,
  ExclusionsList, TermsBox, DualSigBlock, DocFooter, ServiceTCPage,
  fmt, renderToPDF,
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
  const totalLines = [
    ...(data.materials_total ? [{ label: 'Materials', value: data.materials_total }] : []),
    ...(data.labor_subtotal ? [{ label: 'Labor', value: data.labor_subtotal }] : []),
    ...(data.equipment_charges ? [{ label: 'Equipment', value: data.equipment_charges }] : []),
    ...(data.site_visit_fee ? [{ label: 'Site Visit', value: data.site_visit_fee }] : []),
    ...((data.site_visit_credit || 0) > 0 ? [{ label: 'Site Visit Credit', value: -(data.site_visit_credit!) }] : []),
    ...(data.additional_charges || []).map(c => ({ label: c.label, value: c.amount })),
    { label: 'Hawaii GET (4.5%)', value: data.get_amount },
  ];

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={`WO ${data.wo_number}`} date={data.quote_date} />

        {/* Title */}
        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Proposal</Text>
          <Text style={S.docMeta}>
            {data.island && `${data.island}  ·  `}{data.quote_date}
          </Text>
        </View>

        {/* Project info */}
        <InfoGrid items={[
          ['Customer',   data.customer_name],
          ['Phone',      data.customer_phone],
          ['Address',    data.customer_address],
          ['Email',      data.customer_email],
          ['Project',    data.project_description],
          ['Island',     data.island, true],
          ['Site',       data.site_address],
          ['Prepared By',data.prepared_by.name],
        ]} />

        {/* Intro */}
        <Text style={{ ...S.body, marginBottom: 14 }}>
          {COMPANY.name} hereby proposes to furnish and{' '}
          <Text style={S.bodyBold}>
            {data.installation_included ? 'install' : 'supply'}
          </Text>
          {' '}the following for the above-referenced project.
        </Text>

        {/* Scope */}
        <SectionHead title="Scope of Work" />
        {data.scope_narrative ? (
          <Text style={{ ...S.body, marginBottom: 8 }}>{data.scope_narrative}</Text>
        ) : null}
        {data.line_items.filter(li => li.description).map((li, i) => (
          <Text key={i} style={{ ...S.bodyMuted, marginBottom: 3, paddingLeft: 8 }}>
            {li.qty}×  {li.description}
          </Text>
        ))}

        {/* Pricing */}
        <SectionHead title="Pricing" />
        <View style={S.priceTable}>
          <View style={S.priceHeaderRow}>
            <Text style={{ ...S.priceHeaderCell, flex: 1 }}>Description</Text>
            <Text style={{ ...S.priceHeaderCell, width: 100, textAlign: 'right' }}>Amount</Text>
          </View>
          <View style={[S.priceDataRow, { backgroundColor: `${C.teal}08` }]}>
            <Text style={{ flex: 1, fontSize: 9.5, color: C.text, lineHeight: 1.4 }}>
              Total cost: materials, crating, shipping, handling, delivery,
              {data.installation_included ? ' labor, installation,' : ''} & taxes
            </Text>
            <Text style={{ width: 100, fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' }}>
              {fmt(data.total)}
            </Text>
          </View>
        </View>

        <TotalsCard lines={totalLines} total={data.total} deposit={data.deposit} />

        {/* Exclusions */}
        <SectionHead title="Exclusions" />
        <ExclusionsList extras={data.exclusions_extra} installationIncluded={data.installation_included} />

        {/* Terms */}
        <SectionHead title="Terms" />
        <TermsBox deposit={data.deposit} validityDays={data.validity_days} />

        {/* Labor tracking (internal) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ fontSize: 8, color: C.slateLight }}>Manpower: ___________   Hours: ___________</Text>
          <Text style={{ fontSize: 8, color: C.slateLight }}>Balance Due: $ ___________</Text>
        </View>

        {/* Signatures */}
        <DualSigBlock
          preparedBy={{ name: data.prepared_by.name, title: 'Service / Estimating' }}
          date={data.quote_date}
        />

        <DocFooter docNumber={`WO ${data.wo_number}`} />
      </Page>

      <ServiceTCPage docNumber={`WO ${data.wo_number}`} />
    </Document>
  );
}

export async function generateServiceWOPDF(data: ServiceWOData): Promise<Buffer> {
  return renderToPDF(<ServiceWOPDF data={data} />);
}
