/**
 * AIA Submission Packet Export v1 — canonical cover letter renderer.
 *
 * Pure helper: takes interpolation inputs, returns a Buffer of a 1-page
 * PDF cover letter using the canonical Kula Glass template.  Per-GC
 * override is deferred (no migration this dispatch) — billing_format_config
 * does not yet carry submission_cover_letter_template.  When the engagement
 * has gc_certifier_name / gc_certifier_title populated we open with the
 * named recipient; otherwise the salutation falls back to
 * "To Whom It May Concern" and the contracted GC display name.
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { renderToPDF, Letterhead, DocFooter, C } from '../pdf-templates';

export interface SubmissionBundleCoverLetterInput {
  gc_name: string;
  gc_certifier_name?: string | null;
  gc_certifier_title?: string | null;
  gc_certifier_email?: string | null;
  project_name: string;
  kid: string;
  pay_app_number: number;
  period_start: string;
  period_end: string;
  submitted_by_officer_name: string;
  submission_timestamp: string;
  included_documents: string[];
  current_amount_due?: string | null;
}

const S = StyleSheet.create({
  body: { fontSize: 10, color: C.text, lineHeight: 1.55, marginBottom: 10 },
  recipient: { fontSize: 10, color: C.text, marginBottom: 14, lineHeight: 1.5 },
  recipientName: { fontFamily: 'Helvetica-Bold', color: C.navy },
  subjectLine: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    marginBottom: 14,
    paddingLeft: 8,
    borderLeft: `3 solid ${C.blue}`,
  },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { fontSize: 10, color: C.slate, marginRight: 6, width: 10 },
  bulletText: { fontSize: 10, color: C.text, flex: 1, lineHeight: 1.45 },
  sigBlock: { marginTop: 28 },
  sigLine: { fontSize: 10, color: C.text, marginBottom: 2 },
  sigMuted: { fontSize: 9, color: C.subtext, marginBottom: 1 },
});

export function CoverLetterDocument(input: SubmissionBundleCoverLetterInput) {
  const hasNamedCertifier = !!(input.gc_certifier_name && input.gc_certifier_name.trim());
  const salutation = hasNamedCertifier
    ? `Dear ${input.gc_certifier_name}:`
    : 'To Whom It May Concern:';
  const docNumber = `PA-${String(input.pay_app_number).padStart(3, '0')}-${input.kid}`;
  return (
    <Document>
      <Page size="LETTER" style={{
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: C.text,
        padding: '44 52 52 52',
        lineHeight: 1.5,
        backgroundColor: C.white,
      }}>
        <Letterhead docNumber={docNumber} date={input.submission_timestamp} />

        <View style={S.recipient}>
          <Text style={S.recipientName}>{input.gc_name}</Text>
          {hasNamedCertifier && (
            <Text>
              Attn: {input.gc_certifier_name}
              {input.gc_certifier_title ? `, ${input.gc_certifier_title}` : ''}
            </Text>
          )}
          {input.gc_certifier_email && <Text>{input.gc_certifier_email}</Text>}
        </View>

        <Text style={S.subjectLine}>
          RE: Payment Application No. {input.pay_app_number} —
          {' '}{input.project_name} ({input.kid})
        </Text>

        <Text style={S.body}>{salutation}</Text>

        <Text style={S.body}>
          Please find enclosed Kula Glass Company&apos;s Application and Certificate
          for Payment No. {input.pay_app_number}, covering the billing period
          {' '}{input.period_start} through {input.period_end}.
          {input.current_amount_due
            ? ` The current amount due for this period is ${input.current_amount_due}.`
            : ''}
        </Text>

        <Text style={S.body}>
          This submission packet contains the following enclosures, in the order
          they appear in the merged document:
        </Text>

        <View style={{ marginBottom: 12, marginLeft: 8 }}>
          {input.included_documents.map((d, i) => (
            <View key={i} style={S.bullet}>
              <Text style={S.bulletDot}>•</Text>
              <Text style={S.bulletText}>{d}</Text>
            </View>
          ))}
        </View>

        <Text style={S.body}>
          We respectfully request your review and certification of this
          application in accordance with the contract documents. Should you have
          any questions or require additional supporting information, please
          contact the undersigned at your convenience.
        </Text>

        <Text style={S.body}>
          Thank you for your continued partnership on this project.
        </Text>

        <View style={S.sigBlock}>
          <Text style={S.sigLine}>Sincerely,</Text>
          <Text style={{ ...S.sigLine, marginTop: 24, fontFamily: 'Helvetica-Bold' }}>
            {input.submitted_by_officer_name}
          </Text>
          <Text style={S.sigMuted}>Kula Glass Company, Inc.</Text>
          <Text style={S.sigMuted}>Submitted: {input.submission_timestamp}</Text>
        </View>

        <DocFooter docNumber={`${docNumber} — Cover Letter`} kID={input.kid} />
      </Page>
    </Document>
  );
}

export async function renderSubmissionBundleCoverLetter(
  input: SubmissionBundleCoverLetterInput,
): Promise<Buffer> {
  return renderToPDF(
    CoverLetterDocument(input) as React.ReactElement<import('@react-pdf/renderer').DocumentProps>,
  );
}
