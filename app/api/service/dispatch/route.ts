import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { fireAndForgetCustomerUpdate } from '@/lib/updateCustomerRecord';
import { checkPermission } from '@/lib/permissions';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Service_Work_Orders';

// POST — create new work order row in backend sheet
export async function POST(req: Request) {
  // Permission check — wo:create required (Joey, Sean, Jody)
  const { allowed } = await checkPermission(req, 'wo:create');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:create required' }, { status: 403 });

  try {
    const body = await req.json();
    const {
      customerName, address, city, island,
      contactPerson, contactPhone, contactEmail, contactTitle,
      description, systemType, urgency,
      assignedTo, notes, woNumber, dateReceived,
    } = body;

    if (!customerName || !description) {
      return NextResponse.json(
        { error: 'customerName and description are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const today = dateReceived || now.slice(0, 10);
    const wo = woNumber || `${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random() * 9000) + 1000}`;
    const woId = `WO-${wo.replace(/[^A-Za-z0-9\-]/g, '')}`;
    const name = systemType ? `${customerName} — ${systemType}` : customerName;
    const notesStr = [notes, urgency === 'urgent' ? '⚡ URGENT' : ''].filter(Boolean).join(' | ');

    // Row matches HEADERS order from migration script
    const row = [
      woId,           // wo_id
      wo,             // wo_number
      name,           // name
      description,    // description
      'approved',     // status — new WOs start as approved (need to schedule)
      island || city || '', // island
      island || city || '', // area_of_island
      [address, city].filter(Boolean).join(', '), // address
      contactPerson || '',   // contact_person
      contactTitle || '',    // contact_title
      contactPhone || '',    // contact_phone
      contactEmail || '',    // contact_email
      customerName,          // customer_name
      systemType || '',      // system_type
      assignedTo || '',      // assigned_to
      today,                 // date_received
      '',                    // due_date
      '',                    // scheduled_date
      '',                    // start_date
      '',                    // hours_estimated
      '',                    // hours_actual
      '',                    // men_required
      notesStr,              // comments
      '',                    // folder_url
      '',                    // quote_total
      '',                    // quote_status
      now,                   // created_at
      now,                   // updated_at
      'banyan_dispatch',     // source
    ];

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A:AC`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    // Fire-and-forget customer DB backfeed — never blocks WO creation
    fireAndForgetCustomerUpdate({
      name:           customerName,
      island:         island || city || '',
      address:        address,
      city:           city,
      primaryContact: contactPerson,
      phone:          contactPhone,
    });

    return NextResponse.json({ ok: true, woId, woNumber: wo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
