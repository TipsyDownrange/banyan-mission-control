import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { S, C, Letterhead, SectionHead, InfoGrid, DocFooter, renderToPDF } from './pdf-templates';

export type FieldIssueData = {
  event_id: string; report_id: string; timestamp: string;
  project_name: string; kID: string; location_group: string;
  elevation?: string; unit_reference?: string;
  reported_by: string; role: string;
  issue_description: string; issue_category: string; caused_by: string;
  affected_count: number; hours_lost: number; blocking: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  photos: { file_name: string; drive_link: string; timestamp: string; file_id?: string }[];
  gps?: { lat: number; lng: number };
  device_id?: string; recorded_at: string; recorded_by: string; source_system: string;
};

function FieldIssuePDF({ data }: { data: FieldIssueData }) {
  const sevColor = { CRITICAL: '#7f1d1d', HIGH: C.red, MEDIUM: C.amber, LOW: C.slate }[data.severity] || C.slate;
  const sevBg    = { CRITICAL: '#fef2f2', HIGH: '#fef2f2', MEDIUM: '#fffbeb', LOW: C.bg }[data.severity] || C.bg;
  const laborCost = data.affected_count * data.hours_lost * 89.10;

  function fmtTime(iso: string) {
    try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Pacific/Honolulu' }) + ' HST'; }
    catch { return iso; }
  }

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={data.report_id} date={fmtTime(data.timestamp).split(',').slice(0,3).join(',')} />

        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Field Issue Report</Text>
          {/* Severity pill */}
          <View style={{ backgroundColor: sevBg, border: `1.5 solid ${sevColor}`, borderRadius: 999, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, alignSelf: 'flex-end' }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: sevColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {data.severity}{data.blocking ? '  ·  BLOCKING' : ''}
            </Text>
          </View>
        </View>

        <Text style={{ ...S.bodyMuted, marginBottom: 16 }}>{fmtTime(data.timestamp)}</Text>

        <InfoGrid items={[
          ['Project',    data.project_name],
          ['kID',        data.kID, true],
          ['Reported By',data.reported_by],
          ['Role',       data.role],
          ...(data.location_group ? [['Location', data.location_group] as [string,string]] : []),
          ...((data.elevation && data.elevation !== '—') ? [['Elevation', data.elevation] as [string,string]] : []),
          ...((data.unit_reference && data.unit_reference !== '—') ? [['Unit Ref', data.unit_reference] as [string,string]] : []),
          ...(data.gps ? [['GPS', `${data.gps.lat.toFixed(5)}, ${data.gps.lng.toFixed(5)}`] as [string,string]] : []),
        ]} />

        <SectionHead title="Issue Description" />
        <Text style={{ ...S.body, marginBottom: 12 }}>{data.issue_description}</Text>

        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <SectionHead title="Category" />
            <Text style={S.body}>{data.issue_category}</Text>
          </View>
          {data.caused_by ? (
          <View style={{ flex: 1 }}>
            <SectionHead title="Caused By" />
            <Text style={{ ...S.body, fontFamily: 'Helvetica-Bold', color: sevColor }}>{data.caused_by}</Text>
          </View>
          ) : null}
        </View>

        {/* Impact card */}
        <SectionHead title="Operational Impact" />
        <View style={{ backgroundColor: sevBg, border: `1 solid ${sevColor}44`, borderRadius: 12, padding: '12 16', marginBottom: 14, flexDirection: 'row', gap: 16 }}>
          {[
            ['Crew Affected', String(data.affected_count), 'people'],
            ['Hours Lost', String(data.hours_lost), 'hours'],
            ['Blocking', data.blocking ? 'YES' : 'NO', ''],
            ...(laborCost > 0 ? [['Est. Cost Impact', `~$${laborCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, '@$89.10/hr journeyman']] : []),
          ].map(([label, value, sub]) => (
            <View key={label} style={{ flex: 1 }}>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.slate, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</Text>
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: sevColor, lineHeight: 1.1 }}>{value}</Text>
              {sub ? <Text style={{ fontSize: 7.5, color: C.slateLight, marginTop: 2 }}>{sub}</Text> : null}
            </View>
          ))}
        </View>

        {/* Evidence */}
        <SectionHead title={`Photo Evidence — ${data.photos.length} photo${data.photos.length !== 1 ? 's' : ''}`} />
        {data.photos.length === 0 ? (
          <Text style={{ ...S.body, color: C.red, fontFamily: 'Helvetica-Bold' }}>⚠ No photos attached — documentation incomplete</Text>
        ) : (
          data.photos.map((p, i) => (
            <View key={i} style={{ marginBottom: 12 }}>
              {p.file_id && (
                <Image
                  src={`https://drive.google.com/thumbnail?id=${p.file_id}&sz=w400`}
                  style={{ maxWidth: 300, marginBottom: 4, borderRadius: 4 }}
                />
              )}
              <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.text }}>{p.file_name}</Text>
              <Text style={{ fontSize: 8, color: C.slateLight }}>Captured: {p.timestamp}  ·  {p.drive_link}</Text>
            </View>
          ))
        )}

        {/* Immutability notice */}
        <View style={{ marginTop: 16, padding: '8 12', backgroundColor: C.blueBg, borderRadius: 8, border: `0.5 solid ${C.blue}44` }}>
          <Text style={{ fontSize: 7.5, color: C.blue, lineHeight: 1.5 }}>
            Immutable record — BanyanOS  ·  Event ID: {data.event_id}  ·  Recorded: {fmtTime(data.recorded_at)}  ·  Source: {data.source_system}
          </Text>
        </View>

        <DocFooter docNumber={data.report_id} kID={data.kID} />
      </Page>
    </Document>
  );
}

export async function generateFieldIssuePDF(data: FieldIssueData): Promise<Buffer> {
  return renderToPDF(<FieldIssuePDF data={data} />);
}
