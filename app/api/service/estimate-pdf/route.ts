import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { generateEstimatePDF, EstimateData } from '@/lib/pdf-estimate';
import { hawaiiToday } from '@/lib/hawaii-time';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

// Column indices in Service_Work_Orders tab (0-based)
const COL = {
  wo_id:          0,
  wo_number:      1,
  name:           2,
  island:         5,
  address:        7,
  contact_person: 8,
  contact_phone:  10,
  contact_email:  11,
};

function woKey(woId: string): string {
  return woId.startsWith('WO-') ? woId : `WO-${woId}`;
}

async function getSheets() {
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  return google.sheets({ version: 'v4', auth });
}

export async function POST(req: Request) {
  try {
    const { woId } = await req.json();
    if (!woId) {
      return NextResponse.json({ error: 'woId required' }, { status: 400 });
    }

    const bidVersionId = woKey(woId);
    const sheets = await getSheets();

    // Fetch estimate JSON and WO row in parallel
    const [estimateRes, woRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Carls_Method!A2:D2000',
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Service_Work_Orders!A2:AB2000',
      }),
    ]);

    // Find the estimate row
    const estimateRows = (estimateRes.data.values || []) as string[][];
    const estimateRow = estimateRows.find(r => r[1] === bidVersionId);
    if (!estimateRow) {
      return NextResponse.json({ error: `No estimate found for WO ${woId}` }, { status: 404 });
    }

    let estimateData: EstimateData;
    try {
      estimateData = JSON.parse(estimateRow[2] || '{}');
    } catch {
      return NextResponse.json({ error: 'Failed to parse estimate JSON' }, { status: 500 });
    }

    // Find the WO row for customer info
    const woRows = (woRes.data.values || []) as string[][];
    const woRow = woRows.find(r =>
      (r[COL.wo_id] || '') === woId ||
      (r[COL.wo_number] || '') === woId ||
      (r[COL.wo_id] || '') === bidVersionId
    );

    const g = (row: string[], i: number) => (row?.[i] || '') as string;

    const input = {
      wo_number:        woRow ? g(woRow, COL.wo_number) || woId : woId,
      date:             hawaiiToday(),
      island:           woRow ? g(woRow, COL.island) : '',
      customer_name:    woRow ? g(woRow, COL.name) : '',
      customer_phone:   woRow ? g(woRow, COL.contact_phone) : '',
      customer_email:   woRow ? g(woRow, COL.contact_email) : '',
      customer_address: woRow ? g(woRow, COL.address) : '',
      estimate:         estimateData,
    };

    const pdfBuffer = await generateEstimatePDF(input);
    const filename = `Estimate-${input.wo_number}-${input.date}.pdf`;

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
