import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, InfoGrid, DualSigBlock, DocFooter, renderToPDF } from './pdf-templates';

export type RFIData = {
  rfi_number: string; date: string; response_required_date: string;
  project_name: string; kID: string; contract_number: string;
  gc_name: string; gc_contact: string; subject: string; description: string;
  reference_docs: { doc_type: string; doc_number: string; description: string }[];
  proposed_solution?: string; schedule_impact?: string; cost_impact?: string;
  submitted_by: { name: string; email: string; phone: string };
  response_date?: string; responded_by?: string; response_text?: string;
  status: 'OPEN' | 'RESPONDED' | 'CLOSED';
};

function RFIPDF({ data }: { data: RFIData }) {
  const statusColor = data.status === 'OPEN' ? C.amber : data.status === 'RESPONDED' ? C.teal : C.slate;

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={data.rfi_number} date={data.date} />

        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Request for Information</Text>
          <View style={{ ...S.pill, backgroundColor: `${statusColor}18`, alignSelf: 'flex-end' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: statusColor, textTransform: 'uppercase', letterSpacing: 0.4 }}>{data.status}</Text>
          </View>
        </View>

        <InfoGrid items={[
          ['Project',    data.project_name],
          ['kID',        data.kID, true],
          ['Contract #', data.contract_number],
          ['RFI #',      data.rfi_number],
          ['To (GC)',    data.gc_name],
          ['Attn',       data.gc_contact],
          ['Date',       data.date],
          ['Response By',data.response_required_date, true],
          ['Submitted By', data.submitted_by.name],
          ['Email',      data.submitted_by.email],
        ]} />

        <SectionHead title="Subject" />
        <Text style={{ ...S.body, fontFamily: 'Helvetica-Bold', marginBottom: 12 }}>{data.subject}</Text>

        <SectionHead title="Description of Request" />
        <Text style={{ ...S.body, marginBottom: 12 }}>{data.description}</Text>

        {data.reference_docs.length > 0 && (
          <>
            <SectionHead title="Reference Documents" />
            {data.reference_docs.map((ref, i) => (
              <Text key={i} style={{ ...S.bodyMuted, marginBottom: 3, paddingLeft: 8 }}>
                •  {ref.doc_type} {ref.doc_number} — {ref.description}
              </Text>
            ))}
          </>
        )}

        <SectionHead title="Proposed Solution" />
        <Text style={{ ...S.body, marginBottom: 12, minHeight: 24 }}>
          {data.proposed_solution || 'None proposed'}
        </Text>

        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <SectionHead title="Schedule Impact" />
            <Text style={S.body}>{data.schedule_impact || 'Unknown — pending response'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <SectionHead title="Cost Impact" />
            <Text style={S.body}>{data.cost_impact || 'Unknown — pending response'}</Text>
          </View>
        </View>

        <SectionHead title="GC Response" />
        <View style={{ padding: '12 14', backgroundColor: C.bg, borderRadius: 10, border: `1 solid ${C.border}`, marginBottom: 16, minHeight: 56 }}>
          {data.response_text ? (
            <>
              <Text style={{ ...S.bodyMuted, marginBottom: 6 }}>Date: {data.response_date}  ·  By: {data.responded_by}</Text>
              <Text style={S.body}>{data.response_text}</Text>
            </>
          ) : (
            <Text style={{ fontSize: 8.5, color: C.border }}>Awaiting response...</Text>
          )}
        </View>

        <DualSigBlock preparedBy={{ name: data.submitted_by.name, title: 'Project Manager' }} date={data.date} />
        <DocFooter docNumber={data.rfi_number} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateRFIPDF(data: RFIData): Promise<Buffer> {
  return renderToPDF(<RFIPDF data={data} />);
}
