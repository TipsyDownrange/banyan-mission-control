/**
 * Field Issue Report PDF — Legal Defense Document
 * NOTE: This generates a standalone exhibit for legal/claim purposes.
 * In day-to-day operations, issues are embedded in the Daily Field Report.
 * This standalone version is generated on-demand for claims, disputes, or backcharge documentation.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import {
  S, BLUE, GRAY_BORDER, GRAY_TEXT, WHITE,
  CompanyHeader, SectionBar, DocFooter, renderToPDF,
} from './pdf-templates';

export type FieldIssueData = {
  event_id: string;
  report_id: string;
  timestamp: string;
  project_name: string;
  kID: string;
  location_group: string;
  elevation?: string;
  unit_reference?: string;
  reported_by: string;
  role: string;
  issue_description: string;
  issue_category: string;
  caused_by: string;
  affected_count: number;
  hours_lost: number;
  blocking: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  photos: { file_name: string; drive_link: string; timestamp: string }[];
  gps?: { lat: number; lng: number };
  device_id?: string;
  recorded_at: string;
  recorded_by: string;
  source_system: string;
};

function FieldIssuePDF({ data }: { data: FieldIssueData }) {
  const sevColor = { CRITICAL: '#7f1d1d', HIGH: '#c0392b', MEDIUM: '#e67e22', LOW: GRAY_TEXT }[data.severity] || GRAY_TEXT;
  const laborCost = data.affected_count * data.hours_lost * 89.10;

  function fmtTime(iso: string) {
    try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Pacific/Honolulu' }) + ' HST'; }
    catch { return iso; }
  }

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <CompanyHeader docNumber={data.report_id} date={fmtTime(data.timestamp).split(',')[0]} />

        <Text style={S.docTitle}>FIELD ISSUE REPORT</Text>

        {/* Severity banner */}
        <View style={{ backgroundColor: sevColor, padding: '8 12', marginBottom: 14 }}>
          <Text style={{ color: WHITE, fontFamily: 'Helvetica-Bold', fontSize: 11, letterSpacing: 0.5 }}>
            {data.severity} SEVERITY{data.blocking ? '  —  BLOCKING WORK' : ''}
          </Text>
          <Text style={{ color: WHITE, fontSize: 9, marginTop: 2 }}>{fmtTime(data.timestamp)}</Text>
        </View>

        {/* Project + location info */}
        <View style={[S.infoTable, { marginBottom: 14 }]}>
          {[
            ['Project', data.project_name, 'kID', data.kID],
            ['Reported By', data.reported_by, 'Role', data.role],
            ['Location', data.location_group, 'Elevation', data.elevation || '—'],
            ['Unit Reference', data.unit_reference || '—', 'GPS', data.gps ? `${data.gps.lat.toFixed(5)}, ${data.gps.lng.toFixed(5)}` : '—'],
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

        {/* Issue description */}
        <SectionBar title="Issue Description" />
        <Text style={{ ...S.bodyText, marginBottom: 12 }}>{data.issue_description}</Text>

        {/* Category + Cause */}
        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <SectionBar title="Category" />
            <Text style={S.bodyText}>{data.issue_category}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <SectionBar title="Caused By" />
            <Text style={{ ...S.bodyText, fontFamily: 'Helvetica-Bold', color: sevColor }}>{data.caused_by}</Text>
          </View>
        </View>

        {/* Impact */}
        <SectionBar title="Operational Impact" />
        <View style={{ border: `1 solid ${sevColor}`, backgroundColor: `${sevColor}11`, padding: '10 12', marginBottom: 12, flexDirection: 'row', gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY_TEXT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Crew Affected</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: sevColor }}>{data.affected_count}</Text>
            <Text style={{ fontSize: 8, color: GRAY_TEXT }}>people</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY_TEXT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hours Lost</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: sevColor }}>{data.hours_lost}</Text>
            <Text style={{ fontSize: 8, color: GRAY_TEXT }}>hours</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY_TEXT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Blocking Work</Text>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: data.blocking ? '#c0392b' : BLUE }}>{data.blocking ? 'YES' : 'NO'}</Text>
          </View>
          {laborCost > 0 && (
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: GRAY_TEXT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Labor Cost Impact</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: sevColor }}>
                ~${laborCost.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={{ fontSize: 7, color: GRAY_TEXT }}>@$89.10/hr journeyman</Text>
            </View>
          )}
        </View>

        {/* Photo evidence */}
        <SectionBar title={`Photo Evidence (${data.photos.length} photo${data.photos.length !== 1 ? 's' : ''})`} />
        {data.photos.length === 0 ? (
          <Text style={{ ...S.bodyText, color: '#c0392b', fontFamily: 'Helvetica-Bold' }}>
            ⚠ No photos attached — documentation incomplete
          </Text>
        ) : (
          data.photos.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 5 }}>
              <Text style={{ ...S.bodyText, width: 18 }}>{i + 1}.</Text>
              <View>
                <Text style={S.bodyText}>{p.file_name}</Text>
                <Text style={{ fontSize: 8, color: GRAY_TEXT }}>Captured: {p.timestamp}  •  Drive: {p.drive_link}</Text>
              </View>
            </View>
          ))
        )}

        {/* Immutability notice */}
        <View style={{ marginTop: 14, padding: '8 10', border: `0.5 solid ${BLUE}33`, backgroundColor: '#EEF4FB' }}>
          <Text style={{ fontSize: 7.5, color: BLUE, lineHeight: 1.5 }}>
            This report is an immutable record generated by BanyanOS.  Event ID: {data.event_id}
            {'  ·  '}Recorded: {fmtTime(data.recorded_at)}  {'  ·  '}Source: {data.source_system}
            {data.device_id ? `  ·  Device: ${data.device_id}` : ''}
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
