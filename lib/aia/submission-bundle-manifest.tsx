/**
 * AIA Submission Packet Export v1 — manifest page renderer.
 *
 * Pure helper: takes the assembled section descriptors + GC-required-docs
 * checklist booleans, returns a 1-page PDF that enumerates every section
 * included in the submission bundle along with its source, page count, and
 * signed/notarized status.  Final page of the merged PDF bundle.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { renderToPDF, Letterhead, DocFooter, C } from '../pdf-templates';

export interface ManifestSection {
  title: string;
  source: string;
  page_count: number;
  signed_status: 'NOTARIZED' | 'SIGNED' | 'UNSIGNED' | 'GENERATED' | 'NOT_APPLICABLE';
}

export interface SubmissionBundleManifestInput {
  kid: string;
  project_name: string;
  pay_app_number: number;
  period_start: string;
  period_end: string;
  submission_timestamp: string;
  submitted_by_officer_name: string;
  sections: ManifestSection[];
  gc_required_docs_checklist?: ManifestChecklistRow[] | null;
}

export interface ManifestChecklistRow {
  label: string;
  required: boolean;
}

const S = StyleSheet.create({
  meta: {
    backgroundColor: C.bg,
    border: `1 solid ${C.border}`,
    borderRadius: 10,
    padding: '10 14',
    marginBottom: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: { width: '50%', marginBottom: 4 },
  metaLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: C.slateLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: { fontSize: 10, color: C.text },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.blue,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 10,
    marginBottom: 4,
    paddingLeft: 8,
    borderLeft: `3 solid ${C.blue}`,
  },
  table: { border: `1 solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
  thRow: { flexDirection: 'row', backgroundColor: C.navy, padding: '6 10' },
  thCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white, textTransform: 'uppercase' },
  row: { flexDirection: 'row', padding: '6 10', borderTop: `1 solid ${C.border}` },
  rowAlt: { flexDirection: 'row', padding: '6 10', borderTop: `1 solid ${C.border}`, backgroundColor: C.bg },
  cell: { fontSize: 9, color: C.text },
  cellMuted: { fontSize: 9, color: C.subtext },
  badgeNot: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: C.teal, backgroundColor: C.tealBg,
    padding: '2 6', borderRadius: 999, alignSelf: 'flex-start',
  },
  badgeSigned: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: C.blue, backgroundColor: C.blueBg,
    padding: '2 6', borderRadius: 999, alignSelf: 'flex-start',
  },
  badgeGen: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: C.slate, backgroundColor: C.bg,
    padding: '2 6', borderRadius: 999, alignSelf: 'flex-start',
  },
  badgeWarn: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    color: C.amber, backgroundColor: '#fef3c7',
    padding: '2 6', borderRadius: 999, alignSelf: 'flex-start',
  },
  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: '8 12', marginTop: 4,
    backgroundColor: C.blueBg, borderRadius: 8,
  },
  totalsLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy },
  totalsValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy },
  checklistNote: {
    fontSize: 8,
    color: C.subtext,
    fontStyle: 'italic',
    marginBottom: 6,
  },
});

function statusBadge(status: ManifestSection['signed_status']) {
  switch (status) {
    case 'NOTARIZED': return S.badgeNot;
    case 'SIGNED':    return S.badgeSigned;
    case 'GENERATED': return S.badgeGen;
    case 'UNSIGNED':  return S.badgeWarn;
    case 'NOT_APPLICABLE': return S.badgeGen;
  }
}

export function ManifestDocument(input: SubmissionBundleManifestInput) {
  const totalPages = input.sections.reduce((s, x) => s + x.page_count, 0);
  const docNumber = `PA-${String(input.pay_app_number).padStart(3, '0')}-${input.kid}`;
  return (
    <Document>
      <Page size="LETTER" style={{
        fontFamily: 'Helvetica',
        fontSize: 9,
        color: C.text,
        padding: '44 52 52 52',
        lineHeight: 1.45,
        backgroundColor: C.white,
      }}>
        <Letterhead docNumber={docNumber} date={input.submission_timestamp} />

        <Text style={{
          fontSize: 18,
          fontFamily: 'Helvetica-Bold',
          color: C.navy,
          marginBottom: 12,
          letterSpacing: -0.3,
        }}>
          Submission Bundle Manifest
        </Text>

        <View style={S.meta}>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Project</Text>
            <Text style={S.metaValue}>{input.project_name}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>kID</Text>
            <Text style={S.metaValue}>{input.kid}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Pay App #</Text>
            <Text style={S.metaValue}>{input.pay_app_number}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Period</Text>
            <Text style={S.metaValue}>{input.period_start} → {input.period_end}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Submitted</Text>
            <Text style={S.metaValue}>{input.submission_timestamp}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>By</Text>
            <Text style={S.metaValue}>{input.submitted_by_officer_name}</Text>
          </View>
        </View>

        <Text style={S.sectionTitle}>Enclosures in this bundle</Text>
        <View style={S.table}>
          <View style={S.thRow}>
            <View style={{ width: 24 }}><Text style={S.thCell}>#</Text></View>
            <View style={{ flex: 2 }}><Text style={S.thCell}>Section</Text></View>
            <View style={{ flex: 2 }}><Text style={S.thCell}>Source</Text></View>
            <View style={{ width: 50 }}><Text style={S.thCell}>Pages</Text></View>
            <View style={{ width: 70 }}><Text style={S.thCell}>Status</Text></View>
          </View>
          {input.sections.map((s, i) => (
            <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt}>
              <View style={{ width: 24 }}><Text style={S.cell}>{i + 1}</Text></View>
              <View style={{ flex: 2 }}><Text style={S.cell}>{s.title}</Text></View>
              <View style={{ flex: 2 }}><Text style={S.cellMuted}>{s.source}</Text></View>
              <View style={{ width: 50 }}><Text style={S.cell}>{s.page_count}</Text></View>
              <View style={{ width: 70 }}>
                <Text style={statusBadge(s.signed_status)}>{s.signed_status}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={S.totalsRow}>
          <Text style={S.totalsLabel}>Total enclosures: {input.sections.length}</Text>
          <Text style={S.totalsValue}>Total pages (excl. this manifest): {totalPages}</Text>
        </View>

        {input.gc_required_docs_checklist && input.gc_required_docs_checklist.length > 0 && (
          <>
            <Text style={S.sectionTitle}>GC-required documents (informational)</Text>
            <Text style={S.checklistNote}>
              The following items are flagged on the engagement&apos;s GC-required-docs
              checklist. Artifacts for these items are not bundled in this v1
              packet — see the lien-waiver section above for the waivers that
              are included.
            </Text>
            <View style={S.table}>
              <View style={S.thRow}>
                <View style={{ flex: 1 }}><Text style={S.thCell}>Requirement</Text></View>
                <View style={{ width: 60 }}><Text style={S.thCell}>Required?</Text></View>
              </View>
              {input.gc_required_docs_checklist.map((row, i) => (
                <View key={i} style={i % 2 === 0 ? S.row : S.rowAlt}>
                  <View style={{ flex: 1 }}><Text style={S.cell}>{row.label}</Text></View>
                  <View style={{ width: 60 }}>
                    <Text style={row.required ? S.badgeSigned : S.badgeGen}>
                      {row.required ? 'YES' : 'no'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <DocFooter docNumber={`${docNumber} — Manifest`} kID={input.kid} />
      </Page>
    </Document>
  );
}

export async function renderSubmissionBundleManifest(
  input: SubmissionBundleManifestInput,
): Promise<Buffer> {
  return renderToPDF(
    ManifestDocument(input) as React.ReactElement<import('@react-pdf/renderer').DocumentProps>,
  );
}
