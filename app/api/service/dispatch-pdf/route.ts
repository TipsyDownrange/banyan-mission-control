import { hawaiiToday } from '@/lib/hawaii-time';
import { NextResponse } from 'next/server';
import { generateDispatchWOPDF } from '@/lib/pdf-work-order-dispatch';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

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
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const woNumber = searchParams.get('wo') || '';
    if (!woNumber) return NextResponse.json({ error: 'wo required' }, { status: 400 });

    // Fetch from Service_Work_Orders tab
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Service_Work_Orders!A2:AB2000',
    });
    const rows = res.data.values || [];
    const row = rows.find(r =>
      (r[COL.wo_number] || '') === woNumber || (r[COL.wo_id] || '') === woNumber
    );
    if (!row) return NextResponse.json({ error: `WO ${woNumber} not found` }, { status: 404 });

    const g = (i: number) => (row[i] || '') as string;

    // Parse assigned crew from assigned_to field
    const crewNames = g(COL.assigned_to).split(',').map(s => s.trim()).filter(Boolean);
    const crew = crewNames.map(name => ({ name, role: 'Glazier' }));

    const dispatchData = {
      wo_number:          g(COL.wo_number) || woNumber,
      date:               hawaiiToday(),
      scheduled_date:     g(COL.scheduled_date),
      project_name:       g(COL.name),
      address:            g(COL.address),
      island:             g(COL.island),
      contact_name:       g(COL.contact_person),
      contact_phone:      g(COL.contact_phone),
      scope_description:  g(COL.description),
      crew,
      foreman:            crewNames[0] || '',
      estimated_hours:    g(COL.hours_estimated),
      men_count:          g(COL.men_required) || String(crewNames.length),
      special_instructions: g(COL.comments),
    };

    const pdfBuffer = await generateDispatchWOPDF(dispatchData);
    const filename = `Dispatch-WO-${woNumber}-${dispatchData.scheduled_date || dispatchData.date}.pdf`;

    // Auto-save copy to WO folder in Drive (non-blocking)
    try {
      const saKeyB64 = process.env.GOOGLE_SA_KEY_B64 || process.env.GOOGLE_SA_KEY_BASE64;
      if (saKeyB64) {
        const keyJson = JSON.parse(Buffer.from(saKeyB64, 'base64').toString('utf-8'));
        const driveAuth = new (await import('googleapis')).google.auth.JWT({
          email: keyJson.client_email, key: keyJson.private_key,
          scopes: ['https://www.googleapis.com/auth/drive'],
        });
        const drive = (await import('googleapis')).google.drive({ version: 'v3', auth: driveAuth });
        const folderUrl = g(COL.folder_url);
        if (folderUrl) {
          const folderId = folderUrl.match(/folders\/([^/?]+)/)?.[1];
          if (folderId) {
            const { Readable } = await import('stream');
            await drive.files.create({
              requestBody: { name: filename, parents: [folderId], mimeType: 'application/pdf' },
              media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
              supportsAllDrives: true,
            }).catch(() => {});
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
