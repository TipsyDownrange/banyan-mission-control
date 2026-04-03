/**
 * Installer Warranty Certificate
 * Kula Glass workmanship warranty — tied to INSTALL_COMPLETED spine event.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, DocFooter, renderToPDF } from './pdf-templates';

export type WarrantyData = {
  warranty_number: string;        // WAR-PRJ-26-0001-001
  issue_date: string;
  project_name: string;
  kID: string;
  // Owner / customer
  owner_name: string;
  owner_address: string;
  // Scope
  system_types: string[];         // e.g. ["Curtain Wall", "Storefront"]
  scope_description: string;
  // Warranty terms
  workmanship_years: number;      // default 1
  // Dates (derived from spine events)
  substantial_completion_date: string;
  warranty_start_date: string;
  warranty_end_date: string;
  // Exclusions
  exclusions?: string[];
  // Signed by
  signed_by: { name: string; title: string };
  // Spine reference
  event_id?: string;
};

const DEFAULT_EXCLUSIONS = [
  'Damage caused by others after installation',
  'Scratching, breakage, or vandalism',
  'Settlement, movement, or failure of the building structure',
  'Normal weathering of sealants and finishes',
  'Acts of God, including hurricane, earthquake, or flood',
  'Modifications made by others after installation',
  'Failure of glass or materials covered separately by manufacturer warranty',
];

function WarrantyPDF({ data }: { data: WarrantyData }) {
  const allExclusions = [...(data.exclusions || []), ...DEFAULT_EXCLUSIONS];

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={data.warranty_number} date={data.issue_date} />

        <View style={{ textAlign: 'center', marginBottom: 20, marginTop: 4 }}>
          <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.navy, letterSpacing: -0.3, textAlign: 'center' }}>
            Installer Warranty Certificate
          </Text>
          <Text style={{ fontSize: 11, color: C.blue, textAlign: 'center', marginTop: 4 }}>
            {data.workmanship_years}-Year Workmanship Warranty
          </Text>
        </View>

        {/* Header block */}
        <View style={{ border: `1.5 solid ${C.orange}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <View style={{ padding: '10 14', backgroundColor: C.bg, flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              ['Project',     data.project_name],
              ['kID',         data.kID],
              ['Issued To',   data.owner_name],
              ['Address',     data.owner_address],
              ['Issue Date',  data.issue_date],
              ['Substantial Completion', data.substantial_completion_date],
            ].map(([label, value]) => (
              <View key={label} style={{ width: '50%', flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, paddingRight: 10 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slateLight, textTransform: 'uppercase', letterSpacing: 0.5, width: 90, paddingTop: 1 }}>{label}</Text>
                <Text style={{ fontSize: 9, color: C.text, flex: 1, lineHeight: 1.4 }}>{value}</Text>
              </View>
            ))}
          </View>
          {/* Warranty period strip */}
          <View style={{ backgroundColor: C.orangeBg, borderTop: `1 solid ${C.orangeBorder}`, padding: '7 14', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.orange, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 12, flexShrink: 0 }}>Warranty Period</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.navy, flex: 1 }}>
              {data.warranty_start_date}  →  {data.warranty_end_date}
            </Text>
            <View style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4, borderRadius: 999, backgroundColor: C.navy, flexShrink: 0 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white }}>{data.workmanship_years} Year{data.workmanship_years !== 1 ? 's' : ''}</Text>
            </View>
          </View>
        </View>

        {/* Covered systems */}
        <SectionHead title="Systems Covered" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
          {data.system_types.map(sys => (
            <View key={sys} style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4, borderRadius: 999, backgroundColor: `${C.blue}15`, border: `1 solid ${C.blue}44`, marginRight: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 9, color: C.navy, fontFamily: 'Helvetica-Bold' }}>{sys}</Text>
            </View>
          ))}
        </View>

        {/* Scope */}
        <SectionHead title="Scope of Installation" />
        <Text style={{ ...S.body, marginBottom: 14 }}>{data.scope_description}</Text>

        {/* Warranty statement */}
        <SectionHead title="Warranty Statement" />
        <View style={{ backgroundColor: C.bg, borderRadius: 10, padding: '12 14', border: `1 solid ${C.border}`, marginBottom: 14 }}>
          <Text style={{ fontSize: 9.5, lineHeight: 1.6, color: C.text }}>
            Kula Glass Company, Inc. warrants to the above-named Owner that the installation work described herein shall be free from defects in workmanship for a period of <Text style={{ fontFamily: 'Helvetica-Bold' }}>{data.workmanship_years} year{data.workmanship_years !== 1 ? 's' : ''}</Text> from the date of substantial completion ({data.substantial_completion_date}).{'\n\n'}
            In the event of a warranted defect, Kula Glass will, at its sole discretion, repair or replace the defective work at no charge to the Owner. This warranty applies to labor only and does not cover materials, glass, or hardware, which are covered separately by manufacturer warranties.{'\n\n'}
            This warranty is non-transferable and applies only to the original Owner of the above-referenced project.
          </Text>
        </View>

        {/* Exclusions */}
        <SectionHead title="Exclusions" />
        <View style={{ marginBottom: 16 }}>
          {allExclusions.map((ex, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 3, paddingLeft: 4 }}>
              <Text style={{ fontSize: 8.5, color: C.slateLight, marginRight: 6 }}>•</Text>
              <Text style={{ fontSize: 8.5, color: C.subtext, flex: 1, lineHeight: 1.4 }}>{ex}</Text>
            </View>
          ))}
        </View>

        {/* Signature */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <View style={{ flex: 1, marginRight: 20 }}>
            <View style={{ borderBottom: `1 solid ${C.text}`, marginBottom: 4, height: 28 }} />
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slate, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 0.4 }}>Authorized Representative</Text>
            <Text style={{ fontSize: 9, color: C.subtext, textAlign: 'center', marginTop: 2 }}>{data.signed_by.name}  ·  {data.signed_by.title}</Text>
            <Text style={{ fontSize: 8.5, color: C.subtext, textAlign: 'center', marginTop: 1 }}>Date: {data.issue_date}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ borderBottom: `1 solid ${C.text}`, marginBottom: 4, height: 28 }} />
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.slate, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 0.4 }}>Accepted By (Owner)</Text>
            <Text style={{ fontSize: 9, color: C.border, textAlign: 'center', marginTop: 2 }}>____________________________</Text>
            <Text style={{ fontSize: 8.5, color: C.subtext, textAlign: 'center', marginTop: 1 }}>Date: _______________</Text>
          </View>
        </View>

        {data.event_id && (
          <View style={{ marginTop: 14, padding: '6 10', backgroundColor: C.bg, borderRadius: 6, border: `0.5 solid ${C.border}` }}>
            <Text style={{ fontSize: 7, color: C.slateLight }}>
              BanyanOS Reference — Event ID: {data.event_id}  ·  kID: {data.kID}  ·  Warranty #: {data.warranty_number}
            </Text>
          </View>
        )}

        <DocFooter docNumber={data.warranty_number} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateWarrantyPDF(data: WarrantyData): Promise<Buffer> {
  return renderToPDF(<WarrantyPDF data={data} />);
}
