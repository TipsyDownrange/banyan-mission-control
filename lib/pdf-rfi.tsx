/**
 * RFI (Request for Information) PDF
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { BASE_STYLES, BRAND, DocHeader, DocFooter, SignatureBlock, fmt, renderToPDF } from './pdf-templates';

export type RFIData = {
  rfi_number: string;         // RFI-PRJ-26-0001-004
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
  // Response (blank on issue, filled when received)
  response_date?: string;
  responded_by?: string;
  response_text?: string;
  status: 'OPEN' | 'RESPONDED' | 'CLOSED';
};

function RFIPDF({ data }: { data: RFIData }) {
  const statusColor = data.status === 'OPEN' ? BRAND.amber : data.status === 'RESPONDED' ? BRAND.teal : BRAND.gray;

  return (
    <Document>
      <Page size="LETTER" style={BASE_STYLES.page}>
        <DocHeader docType="REQUEST FOR INFORMATION" docNumber={data.rfi_number} date={data.date} />

        {/* Info box */}
        <View style={BASE_STYLES.infoBox}>
          <View style={BASE_STYLES.infoCol}>
            <Text style={BASE_STYLES.infoLabel}>Project</Text>
            <Text style={BASE_STYLES.infoValueBold}>{data.project_name}</Text>
            <Text style={{ ...BASE_STYLES.infoValue, color: BRAND.teal }}>{data.kID}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={BASE_STYLES.infoLabel}>To</Text>
              <Text style={BASE_STYLES.infoValueBold}>{data.gc_name}</Text>
              <Text style={BASE_STYLES.infoValue}>Attn: {data.gc_contact}</Text>
            </View>
          </View>
          <View style={BASE_STYLES.infoColRight}>
            <Text style={BASE_STYLES.infoLabel}>Contract #</Text>
            <Text style={BASE_STYLES.infoValue}>{data.contract_number}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={BASE_STYLES.infoLabel}>Response Required By</Text>
              <Text style={{ ...BASE_STYLES.infoValueBold, color: BRAND.amber }}>{data.response_required_date}</Text>
            </View>
            <View style={{ marginTop: 8 }}>
              <Text style={BASE_STYLES.infoLabel}>Status</Text>
              <Text style={{ ...BASE_STYLES.infoValueBold, color: statusColor }}>{data.status}</Text>
            </View>
          </View>
        </View>

        {/* Subject */}
        <View style={{ marginBottom: 12 }}>
          <Text style={BASE_STYLES.sectionHeader}>Subject</Text>
          <Text style={{ ...BASE_STYLES.bodyText, fontFamily: 'Helvetica-Bold' }}>{data.subject}</Text>
        </View>

        {/* Description */}
        <View style={{ marginBottom: 12 }}>
          <Text style={BASE_STYLES.sectionHeader}>Description of Request</Text>
          <Text style={BASE_STYLES.bodyText}>{data.description}</Text>
        </View>

        {/* Reference docs */}
        {data.reference_docs.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={BASE_STYLES.sectionHeader}>Reference Documents</Text>
            {data.reference_docs.map((ref, i) => (
              <Text key={i} style={{ ...BASE_STYLES.bodyTextGray, marginBottom: 3 }}>
                {ref.doc_type} {ref.doc_number} — {ref.description}
              </Text>
            ))}
          </View>
        )}

        {/* Proposed solution */}
        <View style={{ marginBottom: 12 }}>
          <Text style={BASE_STYLES.sectionHeader}>Proposed Solution</Text>
          <Text style={BASE_STYLES.bodyText}>{data.proposed_solution || 'None proposed'}</Text>
        </View>

        {/* Impact */}
        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={BASE_STYLES.sectionHeader}>Schedule Impact</Text>
            <Text style={BASE_STYLES.bodyText}>{data.schedule_impact || 'Unknown — pending response'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={BASE_STYLES.sectionHeader}>Cost Impact</Text>
            <Text style={BASE_STYLES.bodyText}>{data.cost_impact || 'Unknown — pending response'}</Text>
          </View>
        </View>

        {/* GC Response section */}
        <View style={{ border: `1 solid ${BRAND.border}`, borderRadius: 4, padding: '10 12', marginBottom: 16 }}>
          <Text style={{ ...BASE_STYLES.sectionHeader, marginTop: 0 }}>GC Response</Text>
          {data.response_text ? (
            <>
              <View style={{ flexDirection: 'row', gap: 20, marginBottom: 8 }}>
                <Text style={BASE_STYLES.bodyTextGray}>Date: {data.response_date}</Text>
                <Text style={BASE_STYLES.bodyTextGray}>By: {data.responded_by}</Text>
              </View>
              <Text style={BASE_STYLES.bodyText}>{data.response_text}</Text>
            </>
          ) : (
            <View style={{ height: 48 }}>
              <Text style={BASE_STYLES.bodyTextGray}>Date: _______________    Responded by: _______________</Text>
            </View>
          )}
        </View>

        <SignatureBlock preparedBy={data.submitted_by} date={data.date} />
        <DocFooter docNumber={data.rfi_number} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateRFIPDF(data: RFIData): Promise<Buffer> {
  return renderToPDF(<RFIPDF data={data} />);
}
