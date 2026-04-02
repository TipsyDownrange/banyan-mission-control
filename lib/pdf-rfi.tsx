/**
 * RFI (Request for Information) PDF
 * Matches Kula Glass proposal design language.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  S, BLUE, GRAY_BORDER, GRAY_TEXT,
  CompanyHeader, SectionBar, DualSignatureBlock, DocFooter,
  fmt, renderToPDF,
} from './pdf-templates';

export type RFIData = {
  rfi_number: string;
  date: string;
  response_required_date: string;
  project_name: string;
  kID: string;
  contract_number: string;
  gc_name: string;
  gc_contact: string;
  subject: string;
  description: string;
  reference_docs: { doc_type: string; doc_number: string; description: string }[];
  proposed_solution?: string;
  schedule_impact?: string;
  cost_impact?: string;
  submitted_by: { name: string; email: string; phone: string };
  response_date?: string;
  responded_by?: string;
  response_text?: string;
  status: 'OPEN' | 'RESPONDED' | 'CLOSED';
};

function RFIPDF({ data }: { data: RFIData }) {
  const statusColor = data.status === 'OPEN' ? '#e67e22' : data.status === 'RESPONDED' ? BLUE : GRAY_TEXT;

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <CompanyHeader docNumber={data.rfi_number} date={data.date} />

        <Text style={S.docTitle}>REQUEST FOR INFORMATION</Text>

        {/* Project info table */}
        <View style={[S.infoTable, { marginBottom: 14 }]}>
          {[
            ['Project', data.project_name, 'kID', data.kID],
            ['Contract #', data.contract_number, 'RFI #', data.rfi_number],
            ['To (GC)', data.gc_name, 'Attn', data.gc_contact],
            ['Date', data.date, 'Response Required', data.response_required_date],
            ['Status', data.status, 'Submitted By', data.submitted_by.name],
          ].map(([l1, v1, l2, v2], i, arr) => (
            <View key={l1} style={i === arr.length - 1 ? S.infoRowLast : S.infoRow}>
              <View style={S.infoCell}>
                <Text style={S.infoLabel}>{l1}</Text>
                <Text style={{ ...S.infoValue, color: l1 === 'Status' ? statusColor : undefined, fontFamily: l1 === 'Status' ? 'Helvetica-Bold' : 'Helvetica' }}>{v1}</Text>
              </View>
              <View style={S.infoCellLast}>
                <Text style={S.infoLabel}>{l2}</Text>
                <Text style={{ ...S.infoValue, color: l2 === 'Response Required' ? '#e67e22' : undefined, fontFamily: l2 === 'Response Required' ? 'Helvetica-Bold' : 'Helvetica' }}>{v2}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Subject */}
        <SectionBar title="Subject" />
        <Text style={{ ...S.bodyText, fontFamily: 'Helvetica-Bold', marginBottom: 12 }}>{data.subject}</Text>

        {/* Description */}
        <SectionBar title="Description of Request" />
        <Text style={{ ...S.bodyText, marginBottom: 12 }}>{data.description}</Text>

        {/* Reference docs */}
        {data.reference_docs.length > 0 && (
          <>
            <SectionBar title="Reference Documents" />
            {data.reference_docs.map((ref, i) => (
              <Text key={i} style={{ ...S.bodyText, marginBottom: 3 }}>
                {ref.doc_type} {ref.doc_number} — {ref.description}
              </Text>
            ))}
          </>
        )}

        {/* Proposed solution */}
        <SectionBar title="Proposed Solution" />
        <Text style={{ ...S.bodyText, marginBottom: 12, minHeight: 28 }}>
          {data.proposed_solution || 'None proposed'}
        </Text>

        {/* Impact */}
        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <SectionBar title="Schedule Impact" />
            <Text style={S.bodyText}>{data.schedule_impact || 'Unknown — pending response'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <SectionBar title="Cost Impact" />
            <Text style={S.bodyText}>{data.cost_impact || 'Unknown — pending response'}</Text>
          </View>
        </View>

        {/* GC Response box */}
        <SectionBar title="GC Response" />
        <View style={{ border: `1 solid ${GRAY_BORDER}`, padding: '10 12', marginBottom: 16, minHeight: 60 }}>
          {data.response_text ? (
            <>
              <Text style={{ ...S.bodyText, color: GRAY_TEXT, marginBottom: 6 }}>
                Date: {data.response_date}    Responded by: {data.responded_by}
              </Text>
              <Text style={S.bodyText}>{data.response_text}</Text>
            </>
          ) : (
            <Text style={{ ...S.bodyText, color: '#ccc' }}>
              Date: _______________    Responded by: _______________
            </Text>
          )}
        </View>

        <DualSignatureBlock
          preparedBy={{ name: data.submitted_by.name, title: 'Project Manager' }}
          date={data.date}
        />

        <DocFooter docNumber={data.rfi_number} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateRFIPDF(data: RFIData): Promise<Buffer> {
  return renderToPDF(<RFIPDF data={data} />);
}
