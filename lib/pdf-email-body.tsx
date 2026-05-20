/**
 * BAN-376 Customer Pipeline P2 — react-pdf component that snapshots an
 * inbound email as a Drive-uploadable PDF. Composes the existing
 * pdf-templates primitives (Letterhead, SectionHead, InfoGrid, DocFooter,
 * S, C, renderToPDF) without modifying them, per protected-surfaces rule.
 *
 * Used by lib/inquiries/email-to-drive.ts when the Outlook webhook fires:
 * the body and headers become the PDF, and the original Outlook
 * attachments are uploaded alongside as their own Drive files.
 */

import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { S, Letterhead, SectionHead, InfoGrid, DocFooter, renderToPDF } from './pdf-templates';

export interface EmailBodyPDFData {
  inquiry_number: string;
  to: string;
  from: string;
  forwarder?: string | null;
  subject: string;
  received_at: string;
  body_text: string;
}

export function EmailBodyPDF({ data }: { data: EmailBodyPDFData }) {
  const receivedLabel = formatReceivedAt(data.received_at);
  const infoRows: [string, string, boolean?][] = [
    ['Inquiry #', data.inquiry_number, true],
    ['Received',  receivedLabel],
    ['From',      data.from],
    ['To',        data.to, true],
  ];
  if (data.forwarder) {
    infoRows.push(['Forwarded by', data.forwarder]);
  }
  infoRows.push(['Subject', data.subject || '(no subject)', true]);

  const bodyText = String(data.body_text || '').trim() || '(no body content)';

  return (
    <Document>
      <Page size="LETTER" style={S.page}>
        <Letterhead docNumber={data.inquiry_number} date={receivedLabel} />

        <View style={S.docTitleRow}>
          <Text style={S.docTitle}>Inbound Email — Customer Inquiry</Text>
        </View>

        <InfoGrid items={infoRows} />

        <SectionHead title="Email Body" />
        {renderBodyLines(bodyText)}

        <DocFooter docNumber={data.inquiry_number} />
      </Page>
    </Document>
  );
}

function formatReceivedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function renderBodyLines(body: string): React.ReactElement {
  const lines = body.split(/\r?\n/);
  return (
    <View style={{ marginBottom: 16 }}>
      {lines.map((line, i) => (
        <Text key={i} style={S.body}>{line.length > 0 ? line : ' '}</Text>
      ))}
    </View>
  );
}

/** Render the EmailBodyPDF to a Buffer ready for Drive upload. */
export async function renderEmailBodyPDF(data: EmailBodyPDFData): Promise<Buffer> {
  return renderToPDF(<EmailBodyPDF data={data} />);
}
