import { hawaiiToday } from '@/lib/hawaii-time';
/**
 * POST /api/service/proposal
 * Accepts quote data from QuoteBuilder, generates PDF, uploads to Drive, emails customer
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { generateServiceWOPDF, type ServiceWOData } from '@/lib/pdf-service-wo';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth';
import { getPreparedByUser } from '@/lib/users';

const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

async function uploadPDFToDrive(
  pdfBuffer: Buffer,
  filename: string,
  woId?: string,
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

    let parentId = BANYAN_DRIVE_ID;

    // If we have a WO ID, find the WO folder and place PDF in its Quotes/ subfolder
    if (woId) {
      const woSearch = await drive.files.list({
        q: `name contains '${woId}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        driveId: BANYAN_DRIVE_ID,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: 'drive',
        fields: 'files(id,name)',
      });
      if (woSearch.data.files && woSearch.data.files.length > 0) {
        const woFolderId = woSearch.data.files[0].id!;
        // Look for Quotes/ subfolder
        const quotesSearch = await drive.files.list({
          q: `name = 'Quotes' and mimeType = 'application/vnd.google-apps.folder' and '${woFolderId}' in parents and trashed = false`,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          fields: 'files(id)',
        });
        if (quotesSearch.data.files && quotesSearch.data.files.length > 0) {
          parentId = quotesSearch.data.files[0].id!;
        } else {
          parentId = woFolderId;
        }
      }
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

    const requiredFieldErrors: string[] = [];
    const requiredString = (label: string, value: unknown) => {
      if (typeof value !== 'string' || value.trim() === '') requiredFieldErrors.push(label);
    };
    const requiredNumber = (label: string, value: unknown) => {
      const parsed = Number(value);
      if (value === null || value === undefined || value === '' || Number.isNaN(parsed)) requiredFieldErrors.push(label);
    };

    requiredString('customer_name', quote.customerName);
    requiredNumber('total', quote.total);
    requiredNumber('get_amount', quote.getAmount);
    requiredNumber('get_rate', quote.getRate);
    requiredNumber('deposit', quote.deposit);

    if (requiredFieldErrors.length > 0) {
      return NextResponse.json(
        { error: `Proposal rejected: missing or invalid fields: ${requiredFieldErrors.join(', ')}` },
        { status: 422 }
      );
    }

    // QuoteBuilder already distributes overhead+profit proportionally into
    // materialsTotal and laborSubtotal. DO NOT add them again here.
    // Customer sees: Materials + Labor + GET = Total (markup already baked in)

    const session = await getServerSession(authOptions);
    const preparedByUser = await getPreparedByUser(session?.user?.email);
    const sessionPreparedBy = session?.user?.email ? {
      name: session.user?.name || session.user.email || '',
      email: session.user.email || '',
      phone: '',
    } : null;
    const preparedBy = quote.preparedBy || (preparedByUser ? {
      name: preparedByUser.name,
      email: preparedByUser.email,
      phone: preparedByUser.phone,
    } : sessionPreparedBy);

    if (!preparedBy) {
      return NextResponse.json({ error: 'Proposal rejected: unable to resolve prepared_by from session or Users_Roles' }, { status: 422 });
    }

    const pdfData: ServiceWOData = {
      wo_number:             quote.woNumber || 'DRAFT',
      quote_date:            quote.quoteDate || hawaiiToday(),
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
      labor_subtotal:        quote.laborSubtotal || quote.labor?.subtotal || 0,  // check both paths: direct field or nested labor.subtotal
      equipment_charges:     0, // hidden from proposal — baked into labor
      additional_charges:    [], // hidden from proposal
      site_visit_fee:        undefined, // hidden from proposal
      site_visit_credit:     undefined,
      subtotal:              quote.subtotal || 0,
      get_amount:            quote.getAmount || 0,
      get_rate:              (() => {
        const r = parseFloat(String(quote.getRate || '4.712'));
        // If it looks like a decimal (< 1), convert to percentage
        return String(r < 1 ? Math.round(r * 100 * 1000) / 1000 : r);
      })(),
      total:                 quote.total || 0,
      deposit:               quote.deposit || 0,
      exclusions_extra:      [],
      validity_days:         quote.validityDays || 30,
      prepared_by:           preparedBy,
    };

    // Generate PDF
    const pdfBuffer = await generateServiceWOPDF(pdfData);
    const filename = `Proposal-WO-${pdfData.wo_number}-${pdfData.quote_date}.pdf`;

    // Upload to Drive — use WO ID to place file in the right folder
    const driveLink = await uploadPDFToDrive(pdfBuffer, filename, quote.woId || quote.woNumber ? `WO-${(quote.woId || quote.woNumber || '').replace(/[^A-Za-z0-9\-]/g, '')}` : undefined);

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
