/**
 * POST /api/service/proposal
 * Accepts quote data from QuoteBuilder, generates PDF, uploads to Drive, emails customer
 */
import { NextResponse } from 'next/server';
import { generateServiceWOPDF, type ServiceWOData } from '@/lib/pdf-service-wo';
import { google } from 'googleapis';

async function uploadPDFToDrive(
  pdfBuffer: Buffer,
  filename: string,
  projectName: string
): Promise<string | null> {
  try {
    const keyJson = process.env.GOOGLE_SA_KEY_B64
      ? JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64, 'base64').toString('utf-8'))
      : null;
    if (!keyJson) return null;

    const auth = new google.auth.GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    // Find the SRV-26-0001 Work Orders folder or fallback to AI Command Center
    const search = await drive.files.list({
      q: `name contains 'Work Orders' and mimeType = 'application/vnd.google-apps.folder'`,
      driveId: '0AKSVpf3AnH7CUk9PVA',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: 'drive',
      fields: 'files(id,name)',
    });

    let parentId = '0AKSVpf3AnH7CUk9PVA';
    if (search.data.files && search.data.files.length > 0) {
      parentId = search.data.files[0].id!;
    }

    const { Readable } = await import('stream');
    const result = await drive.files.create({
      requestBody: { name: filename, parents: [parentId], mimeType: 'application/pdf' },
      media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
      supportsAllDrives: true,
      fields: 'id,webViewLink',
    });

    return result.data.webViewLink || null;
  } catch (e) {
    console.error('Drive upload failed:', e);
    return null;
  }
}

async function emailCustomer(params: {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  filename: string;
}): Promise<boolean> {
  try {
    const keyJson = process.env.GOOGLE_SA_KEY_B64
      ? JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64, 'base64').toString('utf-8'))
      : null;
    if (!keyJson) return false;

    const auth = new google.auth.JWT({
      email: keyJson.client_email,
      key: keyJson.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: 'joey@kulaglass.com',
    });
    const gmail = google.gmail({ version: 'v1', auth });

    const boundary = 'boundary_proposal_' + Date.now();
    const raw = Buffer.from([
      `From: Joey Ritthaler <joey@kulaglass.com>`,
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      params.body,
      ``,
      `--${boundary}`,
      `Content-Type: application/pdf; name="${params.filename}"`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="${params.filename}"`,
      ``,
      params.pdfBuffer.toString('base64'),
      ``,
      `--${boundary}--`,
    ].join('\r\n')).toString('base64url');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (e) {
    console.error('Email failed:', e);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { quote, sendEmail = false } = body;

    if (!quote) return NextResponse.json({ error: 'quote object required' }, { status: 400 });

    // Map quote builder output to PDF data model
    const pdfData: ServiceWOData = {
      wo_number:             quote.woNumber || 'DRAFT',
      quote_date:            quote.quoteDate || new Date().toISOString().slice(0, 10),
      customer_name:         quote.customerName || '',
      customer_email:        quote.customerEmail || '',
      customer_phone:        quote.customerPhone || '',
      customer_address:      quote.customerAddress || '',
      project_description:   quote.projectDescription || '',
      site_address:          quote.siteAddress || '',
      island:                quote.island || '',
      scope_narrative:       quote.scopeNarrative || '',
      line_items:            quote.lineItems || [],
      installation_included: quote.installationIncluded ?? true,
      materials_total:       quote.materialsTotal || 0,
      labor_subtotal:        quote.labor?.subtotal || 0,
      equipment_charges:     quote.equipmentCharges || 0,
      additional_charges:    quote.additionalCharges || [],
      site_visit_fee:        quote.siteVisit?.fee,
      site_visit_credit:     quote.siteVisit?.creditApplied,
      subtotal:              quote.subtotal || 0,
      get_amount:            quote.getAmount || 0,
      total:                 quote.total || 0,
      deposit:               quote.deposit || 0,
      exclusions_extra:      [],
      validity_days:         quote.validityDays || 30,
      prepared_by:           quote.preparedBy || {
        name: 'Joey Ritthaler',
        email: 'joey@kulaglass.com',
        phone: '808-242-8999 ext. 22',
      },
    };

    // Generate PDF
    const pdfBuffer = await generateServiceWOPDF(pdfData);
    const filename = `Proposal-WO-${pdfData.wo_number}-${pdfData.quote_date}.pdf`;

    // Upload to Drive
    const driveLink = await uploadPDFToDrive(pdfBuffer, filename, pdfData.project_description);

    // Email customer (optional)
    let emailSent = false;
    if (sendEmail && pdfData.customer_email) {
      emailSent = await emailCustomer({
        to: pdfData.customer_email,
        subject: `Kula Glass Proposal — ${pdfData.project_description} — WO ${pdfData.wo_number}`,
        body: [
          `Hello ${pdfData.customer_name},`,
          ``,
          `Please see the attached proposal for ${pdfData.project_description}.`,
          ``,
          `A 50% deposit of ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pdfData.deposit)} is required to initiate the order.`,
          `This proposal is valid for ${pdfData.validity_days} days from the date above.`,
          ``,
          `Any questions, please call or email me.`,
          ``,
          `Thank you,`,
          ``,
          `Joey Ritthaler`,
          `joey@kulaglass.com`,
          `808-242-8999 ext. 22`,
          `Kula Glass Company Inc.`,
          `289 Pakana St. Wailuku HI 96793`,
        ].join('\n'),
        pdfBuffer,
        filename,
      });
    }

    // Return PDF as download if not emailing
    if (!sendEmail) {
      return new Response(pdfBuffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(pdfBuffer.length),
        },
      });
    }

    return NextResponse.json({
      success: true,
      filename,
      drive_link: driveLink,
      email_sent: emailSent,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Proposal generation error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
