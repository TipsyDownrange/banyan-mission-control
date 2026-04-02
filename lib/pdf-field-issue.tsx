/**
 * Field Issue Report PDF — Legal Defense Document
 * Every field is required. Immutable once generated.
 * This is the $270K defense record.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { BASE_STYLES, BRAND, DocHeader, DocFooter, renderToPDF } from './pdf-templates';

export type FieldIssueData = {
  event_id: string;
  report_id: string;          // FI-[event_id_short]
  timestamp: string;          // ISO, immutable
  project_name: string;
  kID: string;
  location_group: string;
  elevation?: string;
  unit_reference?: string;
  reported_by: string;
  role: string;
  // Issue details
  issue_description: string;
  issue_category: string;
  caused_by: string;
  affected_count: number;
  hours_lost: number;
  blocking: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  // Evidence
  photos: { file_name: string; drive_link: string; timestamp: string }[];
  gps?: { lat: number; lng: number };
  device_id?: string;
  // Spine reference
  recorded_at: string;
  recorded_by: string;
  source_system: string;
};

function FieldIssuePDF({ data }: { data: FieldIssueData }) {
  const sevColor = {
    CRITICAL: '#7f1d1d', HIGH: BRAND.red, MEDIUM: BRAND.amber, LOW: BRAND.gray,
  }[data.severity] || BRAND.gray;

  const sevBg = {
    CRITICAL: '#fef2f2', HIGH: '#fff5f5', MEDIUM: '#fffbeb', LOW: BRAND.bg,
  }[data.severity] || BRAND.bg;

  function fmtTime(iso: string) {
    try {
      return new Date(iso).toLocaleString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Pacific/Honolulu',
      }) + ' HST';
    } catch { return iso; }
  }

  return (
    <Document>
      <Page size="LETTER" style={BASE_STYLES.page}>
        <DocHeader docType="FIELD ISSUE REPORT" docNumber={data.report_id} date={fmtTime(data.timestamp).split(',')[0]} />

        {/* Severity banner */}
        <View style={{ backgroundColor: sevBg, border: `1.5 solid ${sevColor}`, borderRadius: 4, padding: '8 12', marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sevColor }}>
            {data.severity} SEVERITY{data.blocking ? ' — BLOCKING WORK' : ''}
          </Text>
          <Text style={{ fontSize: 8, color: sevColor }}>{fmtTime(data.timestamp)}</Text>
        </View>

        {/* Project + Location */}
        <View style={BASE_STYLES.infoBox}>
          <View style={BASE_STYLES.infoCol}>
            <Text style={BASE_STYLES.infoLabel}>Project</Text>
            <Text style={BASE_STYLES.infoValueBold}>{data.project_name}</Text>
            <Text style={{ ...BASE_STYLES.infoValue, color: BRAND.teal }}>{data.kID}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={BASE_STYLES.infoLabel}>Reported By</Text>
              <Text style={BASE_STYLES.infoValueBold}>{data.reported_by}</Text>
              <Text style={BASE_STYLES.infoValue}>{data.role}</Text>
            </View>
          </View>
          <View style={BASE_STYLES.infoColRight}>
            <Text style={BASE_STYLES.infoLabel}>Location</Text>
            <Text style={BASE_STYLES.infoValueBold}>{data.location_group || '—'}</Text>
            {data.elevation && <Text style={BASE_STYLES.infoValue}>Elevation: {data.elevation}</Text>}
            {data.unit_reference && <Text style={BASE_STYLES.infoValue}>Unit: {data.unit_reference}</Text>}
            {data.gps && (
              <View style={{ marginTop: 8 }}>
                <Text style={BASE_STYLES.infoLabel}>GPS</Text>
                <Text style={BASE_STYLES.infoValue}>{data.gps.lat.toFixed(6)}, {data.gps.lng.toFixed(6)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Issue description */}
        <View style={{ marginBottom: 12 }}>
          <Text style={BASE_STYLES.sectionHeader}>Issue Description</Text>
          <Text style={BASE_STYLES.bodyText}>{data.issue_description}</Text>
        </View>

        {/* Category + Cause */}
        <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={BASE_STYLES.sectionHeader}>Category</Text>
            <Text style={BASE_STYLES.bodyText}>{data.issue_category}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={BASE_STYLES.sectionHeader}>Caused By</Text>
            <Text style={{ ...BASE_STYLES.bodyText, fontFamily: 'Helvetica-Bold', color: BRAND.red }}>
              {data.caused_by}
            </Text>
          </View>
        </View>

        {/* Impact */}
        <View style={{ border: `1 solid ${sevColor}33`, borderRadius: 4, padding: '10 12', marginBottom: 12, backgroundColor: sevBg }}>
          <Text style={{ ...BASE_STYLES.sectionHeader, marginTop: 0, borderBottomColor: `${sevColor}44`, color: sevColor }}>
            Operational Impact
          </Text>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View style={{ flex: 1 }}>
              <Text style={BASE_STYLES.infoLabel}>Crew Affected</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: sevColor }}>{data.affected_count}</Text>
              <Text style={{ fontSize: 8, color: BRAND.lightGray }}>people</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={BASE_STYLES.infoLabel}>Hours Lost</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: sevColor }}>{data.hours_lost}</Text>
              <Text style={{ fontSize: 8, color: BRAND.lightGray }}>hours</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={BASE_STYLES.infoLabel}>Blocking Work</Text>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: data.blocking ? BRAND.red : BRAND.teal }}>
                {data.blocking ? 'YES' : 'NO'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={BASE_STYLES.infoLabel}>Labor Cost Impact</Text>
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: sevColor }}>
                ~${(data.affected_count * data.hours_lost * 89.10).toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </Text>
              <Text style={{ fontSize: 7, color: BRAND.lightGray }}>@$89.10/hr journeyman</Text>
            </View>
          </View>
        </View>

        {/* Evidence */}
        <View style={{ marginBottom: 12 }}>
          <Text style={BASE_STYLES.sectionHeader}>
            Photo Evidence ({data.photos.length} photo{data.photos.length !== 1 ? 's' : ''})
          </Text>
          {data.photos.length === 0 ? (
            <Text style={{ ...BASE_STYLES.bodyTextGray, fontFamily: 'Helvetica-Bold', color: BRAND.red }}>
              ⚠ No photos attached — documentation incomplete
            </Text>
          ) : (
            data.photos.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 4 }}>
                <Text style={{ ...BASE_STYLES.bodyTextGray, width: 20 }}>{i + 1}.</Text>
                <View>
                  <Text style={BASE_STYLES.bodyText}>{p.file_name}</Text>
                  <Text style={BASE_STYLES.bodyTextGray}>Captured: {p.timestamp}  ·  Drive: {p.drive_link}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Immutability notice */}
        <View style={{ padding: '8 12', backgroundColor: '#f0fdfa', border: `0.5 solid ${BRAND.teal}44`, borderRadius: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 7, color: BRAND.teal, lineHeight: 1.5 }}>
            This report is an immutable record generated by BanyanOS at the time of submission.
            Event ID: {data.event_id}  ·  Recorded: {fmtTime(data.recorded_at)}  ·  Source: {data.source_system}
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
