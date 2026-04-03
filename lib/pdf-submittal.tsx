/**
 * Submittal Transmittal PDF
 * Covers both individual submittals and submittal packets.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, DocFooter, DualSigBlock, renderToPDF } from './pdf-templates';

export type SubmittalItem = {
  spec_section: string;      // e.g. "088000"
  description: string;       // e.g. "Curtain Wall Shop Drawings"
  type: 'Shop Drawings' | 'Product Data' | 'Samples' | 'Test Reports' | 'Certificates' | 'O&M Manual' | 'Other';
  copies: number;
  status: 'Initial Submission' | 'Resubmission' | 'Final';
  resubmission_number?: number;
};

export type SubmittalData = {
  transmittal_number: string;  // TRANS-PRJ-26-0001-012
  date: string;
  project_name: string;
  kID: string;
  contract_number: string;
  gc_name: string;
  gc_contact: string;
  gc_address?: string;
  architect_name?: string;
  architect_contact?: string;
  purpose: 'Approval' | 'Information' | 'Review & Comment' | 'Resubmission' | 'Record';
  items: SubmittalItem[];
  remarks?: string;
  submitted_by: { name: string; title: string; email: string; phone: string };
  // Response fields (blank on submission)
  response_date?: string;
  response_action?: 'Approved' | 'Approved as Noted' | 'Revise & Resubmit' | 'Rejected' | 'For Information Only';
  response_comments?: string;
  responded_by?: string;
};

const actionColor = (action?: string) => {
  if (!action) return C.slateLight;
  if (action === 'Approved') return '#16a34a';
  if (action === 'Approved as Noted') return C.blue;
  if (action === 'Revise & Resubmit') return C.orange;
  return C.red;
};

function SubmittalPDF({ data }: { data: SubmittalData }) {
  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={data.transmittal_number} date={data.date} />

        <View style={[S.docTitleRow, { marginBottom: 12 }]}>
          <Text style={S.docTitle}>Submittal Transmittal</Text>
          <View style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4, borderRadius: 999, backgroundColor: `${C.blue}18`, alignSelf: 'flex-end' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.blue, textTransform: 'uppercase', letterSpacing: 0.4 }}>{data.purpose}</Text>
          </View>
        </View>

        {/* Header info block */}
        <View style={{ border: `1.5 solid ${C.orange}`, borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <View style={{ padding: '8 12', backgroundColor: C.bg, flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Project',       data.project_name],
              ['Date',          data.date],
              ['Trans. #',      data.transmittal_number],
              ['Contract #',    data.contract_number],
              ['To (GC)',        data.gc_name],
              ['Attn',          data.gc_contact],
              ['Architect',     data.architect_name || '—'],
              ['kID',           data.kID],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '50%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5, paddingRight: 10 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, width: 70, paddingTop: 1 }}>{label}</Text>
                <Text style={{ fontSize: 9, color: C.text, flex: 1, lineHeight: 1.4 }}>{value}</Text>
              </View>
            ))}
          </View>
          <View style={{ backgroundColor: C.orangeBg, borderTop: `1 solid ${C.orangeBorder}`, padding: '5 12', flexDirection: 'row' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 10 }}>Submitted For:</Text>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy }}>{data.purpose}</Text>
          </View>
        </View>

        {/* Submittal items table */}
        <SectionHead title={`Submittal Items (${data.items.length})`} />
        <View style={{ borderRadius: 8, overflow: 'hidden', border: `1 solid ${C.border}`, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.navy, padding: '5 8' }}>
            {[['Spec', 60], ['Description', 1], ['Type', 90], ['Copies', 36], ['Status', 80]].map(([label, flex]) => (
              <Text key={String(label)} style={{ flex: typeof flex === 'number' && flex > 1 ? flex : undefined, width: typeof flex === 'number' && flex <= 1 ? undefined : typeof flex === 'number' ? flex : undefined, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 6 }}>
                {String(label)}
              </Text>
            ))}
          </View>
          {data.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', padding: '5 8', backgroundColor: i % 2 === 1 ? C.bg : C.white, borderTop: `0.5 solid ${C.border}`, alignItems: 'flex-start' }}>
              <Text style={{ width: 60, fontSize: 8.5, color: C.blue, fontFamily: 'Helvetica-Bold', marginRight: 6 }}>{item.spec_section}</Text>
              <Text style={{ flex: 1, fontSize: 8.5, color: C.text, lineHeight: 1.4, marginRight: 6 }}>{item.description}</Text>
              <Text style={{ width: 90, fontSize: 8, color: C.subtext, marginRight: 6 }}>{item.type}</Text>
              <Text style={{ width: 36, fontSize: 8.5, color: C.text, textAlign: 'center', marginRight: 6 }}>{item.copies}</Text>
              <Text style={{ width: 80, fontSize: 8, color: item.status === 'Resubmission' ? C.orange : C.subtext }}>{item.status}{item.resubmission_number ? ` #${item.resubmission_number}` : ''}</Text>
            </View>
          ))}
        </View>

        {/* Remarks */}
        {data.remarks && (
          <>
            <SectionHead title="Remarks" />
            <Text style={{ ...S.body, marginBottom: 12 }}>{data.remarks}</Text>
          </>
        )}

        {/* GC Response block */}
        <SectionHead title="Review Action" />
        <View style={{ borderRadius: 10, border: `1 solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', backgroundColor: C.bg, borderBottom: `0.5 solid ${C.border}` }}>
            {['Approved', 'Approved as Noted', 'Revise & Resubmit', 'Rejected', 'For Information Only'].map(action => (
              <View key={action} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: '6 8', borderRight: `0.5 solid ${C.border}` }}>
                <View style={{ width: 10, height: 10, borderRadius: 2, border: `1 solid ${actionColor(action)}`, marginRight: 5, backgroundColor: data.response_action === action ? actionColor(action) : 'transparent' }} />
                <Text style={{ fontSize: 7, color: actionColor(action), fontFamily: data.response_action === action ? 'Helvetica-Bold' : 'Helvetica', flex: 1 }}>{action}</Text>
              </View>
            ))}
          </View>
          <View style={{ padding: '8 12', minHeight: 48 }}>
            {data.response_comments ? (
              <Text style={S.body}>{data.response_comments}</Text>
            ) : (
              <Text style={{ fontSize: 8.5, color: C.border }}>Awaiting review...</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: '5 12', backgroundColor: C.bg, borderTop: `0.5 solid ${C.border}` }}>
            <Text style={{ fontSize: 8.5, color: C.subtext }}>Reviewed by: {data.responded_by || '___________________________'}</Text>
            <Text style={{ fontSize: 8.5, color: C.subtext }}>Date: {data.response_date || '_______________'}</Text>
          </View>
        </View>

        <DualSigBlock
          preparedBy={{ name: data.submitted_by.name, title: data.submitted_by.title }}
          date={data.date}
        />
        <DocFooter docNumber={data.transmittal_number} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateSubmittalPDF(data: SubmittalData): Promise<Buffer> {
  return renderToPDF(<SubmittalPDF data={data} />);
}
