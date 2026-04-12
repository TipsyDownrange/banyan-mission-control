/**
 * /api/tm-tickets
 *
 * GET  — list TM tickets (filter by kID, status)
 * POST — create new TM ticket, generate PDF, store in Drive
 *
 * TM_Tickets sheet tab schema (Amendment 2):
 *   tm_id, tm_number, kID, status, triggering_event_id, description,
 *   labor_estimated, material_estimated, total_estimated,
 *   labor_actual, material_actual, total_actual,
 *   authorization_type, authorized_by, authorized_at,
 *   linked_co, photos, exhibits
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { generateTMTicketPDF } from '@/lib/pdf-tm-ticket';
import type { TMTicketData } from '@/lib/pdf-tm-ticket';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'TM_Tickets';
const DRIVE_ROOT = '0AKSVpf3AnH7CUk9PVA';
const TM_HEADERS = [
  'tm_id', 'tm_number', 'kID', 'status', 'triggering_event_id', 'description',
  'labor_estimated', 'material_estimated', 'total_estimated',
  'labor_actual', 'material_actual', 'total_actual',
  'authorization_type', 'authorized_by', 'authorized_at',
  'linked_co', 'photos', 'exhibits', 'pdf_drive_id', 'created_at',
];

function getAuth(readonly = false) {
  const scopes = readonly
    ? ['https://www.googleapis.com/auth/spreadsheets.readonly']
    : ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
  const saKey = process.env.GOOGLE_SA_KEY_BASE64
    ? JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_BASE64, 'base64').toString())
    : null;
  if (!saKey) throw new Error('GOOGLE_SA_KEY_BASE64 not set');
  return new google.auth.GoogleAuth({ credentials: saKey, scopes });
}

async function ensureTab(sheets: ReturnType<typeof google.sheets>) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [TM_HEADERS] },
    });
  }
}

async function getNextTMNumber(sheets: ReturnType<typeof google.sheets>, kID: string): Promise<string> {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!B2:B1000` });
    const existing = (res.data.values || []).flat().filter(v => v.startsWith(`TM-${kID}-`));
    const nums = existing.map(v => parseInt(v.split('-').pop() || '0')).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `TM-${kID}-${String(next).padStart(3, '0')}`;
  } catch {
    return `TM-${kID}-001`;
  }
}

async function uploadPDFtoDrive(pdfBuffer: Buffer, filename: string, kID: string): Promise<string | null> {
  try {
    const auth = getAuth(false);
    const drive = google.drive({ version: 'v3', auth });
    const { Readable } = await import('stream');
    // Find project folder
    const search = await drive.files.list({
      q: `name contains '${kID}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      driveId: DRIVE_ROOT, corpora: 'drive', supportsAllDrives: true, includeItemsFromAllDrives: true, fields: 'files(id,name)',
    });
    let parentId = DRIVE_ROOT;
    if (search.data.files && search.data.files.length > 0) {
      parentId = search.data.files[0].id!;
    }
    const result = await drive.files.create({
      requestBody: { name: filename, parents: [parentId], mimeType: 'application/pdf' },
      media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
      supportsAllDrives: true, fields: 'id',
    });
    return result.data.id ?? null;
  } catch (e) {
    console.error('[TM Tickets] Drive upload failed:', e);
    return null;
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kID = searchParams.get('kID') || '';
  const status = searchParams.get('status') || '';

  try {
    const auth = getAuth(true);
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TAB}!A2:T1000` });
    const rows = res.data.values || [];
    let tickets = rows.map(r => Object.fromEntries(TM_HEADERS.map((h, i) => [h, r[i] || ''])));
    if (kID) tickets = tickets.filter(t => t.kID === kID);
    if (status) tickets = tickets.filter(t => t.status === status);

    return NextResponse.json({ tickets, total: tickets.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email?.endsWith('@kulaglass.com')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { kID, triggering_event_id, description, authorization_type, authorized_by,
            authorized_at, auth_person_title, verbal_agreement_id, logged_by,
            gc_owner, project_name, labor, materials, equipment, subcontractors,
            photos, linked_co, co_submit_date, signer_name, signer_title } = body;

    if (!kID || !description || !authorization_type || !authorized_by) {
      return NextResponse.json({ error: 'kID, description, authorization_type, authorized_by required' }, { status: 400 });
    }

    const auth = getAuth(false);
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets);

    const tm_id = `tm_${Date.now()}`;
    const tm_number = await getNextTMNumber(sheets, kID);
    const now = new Date().toISOString();
    const date = now.slice(0, 10);

    // Build PDF data
    // Accept optional status override from FA (e.g. 'DRAFTED' for field-originated tickets)
    const ticketStatus = (body.status === 'DRAFTED' ? 'DRAFTED' : 'AUTHORIZED') as 'DRAFTED' | 'AUTHORIZED';
    const pdfData: TMTicketData = {
      tm_number, date, status: ticketStatus, kid: kID, project_name: project_name || kID,
      gc_owner: gc_owner || '', auth_type: authorization_type, auth_person: authorized_by,
      auth_person_title: auth_person_title || '', auth_datetime: authorized_at || now,
      triggered_by: triggering_event_id || '', verbal_agreement_id, logged_by,
      description, labor: labor || [], materials: materials || [],
      equipment: equipment || [], subcontractors: subcontractors || [],
      photos: photos || [], linked_co, co_submit_date, signer_name, signer_title,
    };

    // Generate PDF
    const pdfBuffer = await generateTMTicketPDF(pdfData);
    const pdfFilename = `${tm_number}-TM-Ticket.pdf`;
    const pdfDriveId = await uploadPDFtoDrive(pdfBuffer, pdfFilename, kID);

    // Estimated totals
    const laborEst = (labor || []).reduce((s: number, l: { hours: number; rate_per_hr: number; fringe_per_hr: number }) => s + l.hours * (l.rate_per_hr + l.fringe_per_hr), 0);
    const matEst = (materials || []).reduce((s: number, m: { qty: number; unit_price: number }) => s + m.qty * m.unit_price, 0);
    const photoIds = (photos || []).map((p: { drive_url: string }) => p.drive_url).join(',');

    // Write to sheet
    const row = [
      tm_id, tm_number, kID, ticketStatus, triggering_event_id || '', description,
      laborEst.toFixed(2), matEst.toFixed(2), (laborEst + matEst).toFixed(2),
      '', '', '',
      authorization_type, authorized_by, authorized_at || now,
      linked_co || '', photoIds, '', pdfDriveId || '', now,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${TAB}!A:T`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [row] },
    });

    return NextResponse.json({
      ok: true, tm_id, tm_number,
      pdf_drive_id: pdfDriveId,
      pdf_url: pdfDriveId ? `https://drive.google.com/file/d/${pdfDriveId}/view` : null,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[TM Tickets] POST error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
