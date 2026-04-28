import { hawaiiToday } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { generateDispatchWOPDF } from '@/lib/pdf-work-order-dispatch';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

// Column indices in Service_Work_Orders tab (0-based)
const COL = {
  wo_id:          0,
  wo_number:      1,
  name:           2,
  description:    3,
  status:         4,
  island:         5,
  address:        7,
  contact_person: 8,
  contact_phone:  10,
  contact_email:  11,
  assigned_to:    14,
  scheduled_date: 17,
  hours_estimated: 19,
  men_required:   21,
  comments:       22,
  folder_url:     23,
  customer_id:    43, // AR — GC-D053
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const woNumber = searchParams.get('wo') || '';
    if (!woNumber) return NextResponse.json({ error: 'wo required' }, { status: 400 });

    // Fetch from Service_Work_Orders tab
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const [res, custRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Service_Work_Orders!A2:AS2000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Customers!A:N',
      }),
    ]);
    const rows = res.data.values || [];
    const row = rows.find(r =>
      (r[COL.wo_number] || '') === woNumber || (r[COL.wo_id] || '') === woNumber
    );
    if (!row) return NextResponse.json({ error: `WO ${woNumber} not found` }, { status: 404 });

    const g = (i: number) => (row[i] || '') as string;

    // GC-D053: resolve customer_id for fresh address/contact data (GC-D021)
    const customerId = g(COL.customer_id);
    if (!customerId) {
      return NextResponse.json(
        { error: `Cannot generate dispatch PDF: customer_id not resolved on WO ${woNumber} — GC-D053` },
        { status: 400 }
      );
    }
    const custRows = custRes.data.values || [];
    const custHeaders = (custRows[0] || []) as string[];
    const cidIdx = custHeaders.indexOf('Customer_ID');
    const addrIdx = custHeaders.indexOf('Address');
    const contactIdx = custHeaders.indexOf('Contact_Person');
    const phoneIdx = custHeaders.indexOf('Phone');
    let resolvedAddress = g(COL.address);
    let resolvedContact = g(COL.contact_person);
    let resolvedPhone = g(COL.contact_phone);
    if (cidIdx >= 0) {
      const custRow = custRows.slice(1).find(r => (r[cidIdx] || '').trim() === customerId.trim());
      if (!custRow) {
        return NextResponse.json(
          { error: `Cannot generate dispatch PDF: customer_id "${customerId}" not found in Customers table — GC-D053` },
          { status: 400 }
        );
      }
      if (addrIdx >= 0 && custRow[addrIdx]) resolvedAddress = custRow[addrIdx];
      if (contactIdx >= 0 && custRow[contactIdx]) resolvedContact = custRow[contactIdx];
      if (phoneIdx >= 0 && custRow[phoneIdx]) resolvedPhone = custRow[phoneIdx];
    }

    // Parse assigned crew from assigned_to field
    const crewNames = g(COL.assigned_to).split(',').map(s => s.trim()).filter(Boolean);
    const crew = crewNames.map(name => ({ name, role: 'Glazier' }));

    const dispatchData = {
      wo_number:          g(COL.wo_number) || woNumber,
      date:               hawaiiToday(),
      scheduled_date:     g(COL.scheduled_date),
      project_name:       g(COL.name),
      address:            resolvedAddress,
      island:             g(COL.island),
      contact_name:       resolvedContact,
      contact_phone:      resolvedPhone,
      scope_description:  g(COL.description),
      crew,
      foreman:            crewNames[0] || '',
      estimated_hours:    g(COL.hours_estimated),
      men_count:          g(COL.men_required) || String(crewNames.length),
      special_instructions: g(COL.comments),
    };

    const pdfBuffer = await generateDispatchWOPDF(dispatchData);
    const filename = `Dispatch-WO-${woNumber}-${dispatchData.scheduled_date || dispatchData.date}.pdf`;

    // Auto-save copy to WO folder in Drive (non-blocking) + shadow dual-write
    try {
      {
        const { google: _g } = await import('googleapis');
        const driveAuth = getGoogleAuth(['https://www.googleapis.com/auth/drive']);
        const drive = _g.drive({ version: 'v3', auth: driveAuth });
        const { Readable } = await import('stream');
        const folderUrl = g(COL.folder_url);
        if (folderUrl) {
          const folderId = folderUrl.match(/folders\/([^/?]+)/)?.[1];
          if (folderId) {
            // Primary write to WO folder root
            await drive.files.create({
              requestBody: { name: filename, parents: [folderId], mimeType: 'application/pdf' },
              media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
              supportsAllDrives: true,
            }).catch((e: unknown) => console.error('[dispatch-pdf] primary write failed:', e));
            // Shadow write to 10 - AI Project Documents [Kai]/System Generated/ (non-fatal)
            try {
              async function foc(name: string, parentId: string) {
                const safe = name.replace(/'/g, "\\'");
                const res = await drive.files.list({ q: `name='${safe}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, supportsAllDrives:true, includeItemsFromAllDrives:true, fields:'files(id)' });
                if (res.data.files?.length) return res.data.files[0].id!;
                const c = await drive.files.create({ requestBody:{ name, mimeType:'application/vnd.google-apps.folder', parents:[parentId] }, supportsAllDrives:true, fields:'id' });
                return c.data.id!;
              }
              const shadowId = await foc('10 - AI Project Documents [Kai]', folderId);
              const sysGenId = await foc('System Generated', shadowId);
              await drive.files.create({
                requestBody: { name: filename, parents: [sysGenId], mimeType: 'application/pdf' },
                media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
                supportsAllDrives: true,
              });
            } catch (shadowErr) { console.error('[dispatch-pdf] shadow write failed (non-fatal):', shadowErr); }
          }
        }
      }
    } catch { /* non-fatal */ }

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
