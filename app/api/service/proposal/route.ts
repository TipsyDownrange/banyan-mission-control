import { hawaiiToday } from '@/lib/hawaii-time';
/**
 * POST /api/service/proposal
 * Accepts quote data from QuoteBuilder, generates PDF, uploads to Drive, emails customer.
 * DATA FRESHNESS RULE: Customer fields are always read fresh from Service_Work_Orders at
 * generation time. The POST body provides pricing data only. Never trust component state
 * for customer identity data.
 */
import { NextResponse } from 'next/server';
import { generateServiceWOPDF, type ServiceWOData } from '@/lib/pdf-service-wo';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const WO_COL = { wo_id: 0, wo_number: 1, name: 2, description: 3, status: 4, island: 5, area: 6, address: 7, contact_person: 8, assigned_to: 9, contact_phone: 10, contact_email: 11, customer_name: 12 };

/** Read WO customer data fresh from Service_Work_Orders. Returns null if not found. */
async function readWOCustomerData(woNumber: string): Promise<{ customerName: string; customerEmail: string; customerPhone: string; customerAddress: string; island: string; projectDescription: string; contactPerson: string } | null> {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:M2000' });
    const rows = res.data.values || [];
    const g = (r: string[], col: number) => (r[col] || '').trim();
    const row = rows.find(r => g(r, WO_COL.wo_number) === woNumber || g(r, WO_COL.wo_id) === woNumber);
    if (!row) return null;
    return {
      customerName:       g(row, WO_COL.customer_name) || g(row, WO_COL.contact_person),
      customerEmail:      g(row, WO_COL.contact_email),
      customerPhone:      g(row, WO_COL.contact_phone),
      customerAddress:    g(row, WO_COL.address),
      island:             g(row, WO_COL.island),
      projectDescription: g(row, WO_COL.name),
      contactPerson:      g(row, WO_COL.contact_person),
    };
  } catch {
    return null; // non-fatal — fall back to POST body values
  }
}

const BANYAN_DRIVE_ID = '0AKSVpf3AnH7CUk9PVA';

function asRequiredNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

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
  senderEmail?: string;
  senderName?: string;
}): Promise<boolean> {
  try {
    // Fix: correct env var name (was GOOGLE_SA_KEY_B64 — missing ASE64)
    const keyJson = process.env.GOOGLE_SA_KEY_BASE64
      ? JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_BASE64, 'base64').toString('utf-8'))
      : null;
    if (!keyJson) return false;

    // Sender: use the prepared_by email if it's a kulaglass.com address, otherwise joey@
    const senderEmail = (params.senderEmail && params.senderEmail.endsWith('@kulaglass.com'))
      ? params.senderEmail
      : 'joey@kulaglass.com';

    const auth = new google.auth.JWT({
      email: keyJson.client_email,
      key: keyJson.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: senderEmail,
    });
    const gmail = google.gmail({ version: 'v1', auth });

    const boundary = 'boundary_proposal_' + Date.now();
    const raw = Buffer.from([
      `From: ${params.senderName || 'Kula Glass'} <${senderEmail}>`,
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

    // DATA FRESHNESS: read customer identity fields fresh from Service_Work_Orders
    const woNumber = quote.woNumber || quote.woId || '';
    const freshWO = woNumber ? await readWOCustomerData(woNumber) : null;

    // Normalize wo_number: strip WO- prefix since PDF template adds 'WO ' prefix itself
    const normalizedWoNumber = (woNumber || 'DRAFT').replace(/^WO-/i, '');

    const pdfData: ServiceWOData = {
      wo_number:             normalizedWoNumber,
      quote_date:            quote.quoteDate || hawaiiToday(),
      // Customer identity: always prefer fresh WO data over POST body
      customer_name:         freshWO?.customerName || quote.customerName || '',
      customer_email:        freshWO?.customerEmail || quote.customerEmail || '',
      customer_phone:        freshWO?.customerPhone || quote.customerPhone || '',
      customer_address:      freshWO?.customerAddress || quote.customerAddress || '',
      project_description:   freshWO?.projectDescription || quote.projectDescription || '',
      site_address:          freshWO?.customerAddress || quote.siteAddress || '',
      island:                freshWO?.island || quote.island || '',
      scope_narrative:       quote.scopeNarrative || '',
      line_items:            quote.lineItems || [],
      installation_included: quote.installationIncluded ?? true,
      materials_total:       quote.materialsTotal || 0,
      labor_subtotal:        quote.laborSubtotal || quote.labor?.subtotal || 0,
      equipment_charges:     0,
      additional_charges:    [],
      site_visit_fee:        undefined,
      site_visit_credit:     undefined,
      subtotal:              quote.subtotal || 0,
      get_amount:            quote.getAmount || 0,
      get_rate:              (() => {
        const r = parseFloat(String(quote.getRate || '4.712'));
        return String(r < 1 ? Math.round(r * 100 * 1000) / 1000 : r);
      })(),
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

    const validationErrors: string[] = [];
    if (!String(pdfData.customer_name || '').trim()) validationErrors.push('customer_name is required');

    const requiredNumbers = [
      ['total', pdfData.total],
      ['get_amount', pdfData.get_amount],
      ['get_rate', pdfData.get_rate],
      ['deposit', pdfData.deposit],
    ] as const;

    for (const [field, value] of requiredNumbers) {
      const parsed = asRequiredNumber(value);
      if (!Number.isFinite(parsed)) validationErrors.push(`${field} must be present and numeric`);
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({ error: 'Proposal validation failed', details: validationErrors }, { status: 400 });
    }

    const pdfBuffer = await generateServiceWOPDF(pdfData);
    const filename = `Proposal-WO-${pdfData.wo_number}-${pdfData.quote_date}.pdf`;

    const driveLink = await uploadPDFToDrive(
      pdfBuffer,
      filename,
      (() => { const raw = (quote.woId || quote.woNumber || '').replace(/[^A-Za-z0-9\-]/g, ''); return raw ? (raw.startsWith('WO-') ? raw : `WO-${raw}`) : undefined; })(),
    );

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
          `${pdfData.prepared_by?.name || 'Kula Glass'}`,
          `${pdfData.prepared_by?.email || 'info@kulaglass.com'}`,
          `${pdfData.prepared_by?.phone || '808-242-8999'}`,
          `Kula Glass Company Inc.`,
          `289 Pakana St. Wailuku HI 96793`,
        ].join('\n'),
        pdfBuffer,
        filename,
        senderEmail: pdfData.prepared_by?.email,
        senderName: pdfData.prepared_by?.name,
      });
    }

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
