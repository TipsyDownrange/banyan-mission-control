/**
 * Dispatch Schedule API
 * GET  - fetch all slots for a date range
 * POST - create a new slot (PM creates the need)
 * PATCH - assign crew to a slot / update status (superintendent fills it)
 * DELETE - remove a slot
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { checkPermission } from '@/lib/permissions';

const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const COLS = ['slot_id','date','kID','project_name','island','men_required','hours_estimated','assigned_crew','created_by','status','confirmations','work_type','notes','start_time','end_time'];

function rowToSlot(row: string[]) {
  const s: Record<string, string> = {};
  COLS.forEach((c, i) => { s[c] = row[i] || ''; });
  return s;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from') || new Date().toISOString().slice(0,10);
    const days = parseInt(searchParams.get('days') || '28');
    const island = searchParams.get('island') || '';

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:O5000',
    });

    const fromDate = new Date(from);
    const toDate = new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000);

    let slots = (res.data.values || [])
      .filter(r => r[0])
      .map(r => rowToSlot(r.map(String)))
      .filter(s => {
        const d = new Date(s.date);
        return d >= fromDate && d <= toDate;
      });

    if (island) slots = slots.filter(s => s.island === island);

    return NextResponse.json({ slots });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), slots: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Permission check — dispatch:create required (Nate, Sean)
  const { allowed } = await checkPermission(req, 'dispatch:create');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: dispatch:create required' }, { status: 403 });

  try {
    const body = await req.json();
    const { date, kID, project_name, island, men_required, hours_estimated, created_by } = body;
    if (!date || !project_name) return NextResponse.json({ error: 'date and project_name required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Generate slot_id
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:A5000' });
    const count = (existing.data.values || []).filter(r => r[0]).length;
    const slot_id = `SLOT-${date.replace(/-/g,'')}-${String(count + 1).padStart(3,'0')}`;

    const row = [slot_id, date, kID||'', project_name, island||'', men_required||'1', hours_estimated||'', '', created_by||'', 'open', '', body.work_type||'', body.notes||'', body.start_time||'', body.end_time||''];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2',
      valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    return NextResponse.json({ ok: true, slot_id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  // Permission check — dispatch:assign required (Nate, Sean)
  const { allowed } = await checkPermission(req, 'dispatch:assign');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: dispatch:assign required' }, { status: 403 });

  try {
    const body = await req.json();
    const { slot_id, assigned_crew, status, ...updates } = body;
    if (!slot_id) return NextResponse.json({ error: 'slot_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:O5000' });
    const rows = res.data.values || [];
    const rowIdx = rows.findIndex(r => r[0] === slot_id);
    if (rowIdx === -1) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

    const existing = rows[rowIdx].map(String);
    // Ensure row is long enough for all 15 cols (including start_time, end_time)
    while (existing.length < 15) existing.push('');
    const updated = [...existing];
    if (assigned_crew !== undefined) updated[7] = Array.isArray(assigned_crew) ? assigned_crew.join(', ') : assigned_crew;
    if (status !== undefined) updated[9] = status;

    // Handle crew confirmation: {name, confirm_status: 'confirmed'|'declined'|'pending'}
    if (body.crew_name && body.confirm_status) {
      const confMap: Record<string, string> = {};
      (existing[10] || '').split(',').forEach((entry: string) => {
        const [n, s] = entry.trim().split(':');
        if (n) confMap[n.trim()] = s?.trim() || 'pending';
      });
      confMap[body.crew_name] = body.confirm_status;
      updated[10] = Object.entries(confMap).map(([n, s]) => `${n}:${s}`).join(', ');
    }

    COLS.forEach((c, i) => { if (updates[c] !== undefined) updated[i] = updates[c]; });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `Dispatch_Schedule!A${rowIdx + 2}:O${rowIdx + 2}`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: [updated] },
    });

    // Send email notifications to newly assigned crew (non-blocking)
    // Set DISABLE_DISPATCH_EMAILS=true in Vercel env to suppress during testing
    if (process.env.DISABLE_DISPATCH_EMAILS !== 'true' && assigned_crew && assigned_crew.length > 0) {
      try {
        const slot = rowToSlot(updated);
        const crewNames: string[] = Array.isArray(assigned_crew) ? assigned_crew : assigned_crew.split(', ').filter(Boolean);
        const prevCrew = existing[7] ? existing[7].split(', ').filter(Boolean) : [];
        const newlyAdded = crewNames.filter(n => !prevCrew.includes(n));

        if (newlyAdded.length > 0) {
          // Fetch users to get emails
          const usersSheet = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID, range: 'Users_Roles!A2:G100',
          });
          const userRows = usersSheet.data.values || [];
          const userMap: Record<string, string> = {};
          userRows.forEach(r => {
            const name = r[1] || '';
            const email = r[3] || '';
            if (name && email) userMap[name.toLowerCase()] = email;
          });

          const dateFormatted = new Date(slot.date + 'T12:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric',
          });

          const gmailAuth = getGoogleAuth(
            ['https://www.googleapis.com/auth/gmail.send'],
            'kai@kulaglass.com'
          );
          const gmail = google.gmail({ version: 'v1', auth: gmailAuth });

          for (const name of newlyAdded) {
            const email = userMap[name.toLowerCase()];
            if (!email) continue;

            const subject = `You're scheduled: ${slot.project_name} — ${dateFormatted}`;
            const body = [
              `Hi ${name.split(' ')[0]},`,
              '',
              `You've been scheduled for the following job:`,
              '',
              `  Job: ${slot.project_name}`,
              `  Date: ${dateFormatted}`,
              `  Island: ${slot.island || 'TBD'}`,
              slot.hours_estimated ? `  Estimated hours: ${slot.hours_estimated}h` : '',
              slot.men_required ? `  Crew size: ${slot.men_required} men` : '',
              '',
              `Full crew assigned: ${crewNames.join(', ')}`,
              '',
              `View your schedule in the BanyanOS Field App:`,
              `https://banyan-field-app-525p.vercel.app/schedule`,
              '',
              `— Kula Glass Company`,
            ].filter(l => l !== null).join('\n');

            const raw = Buffer.from(
              `To: ${email}\r\nFrom: kai@kulaglass.com\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
            ).toString('base64url');

            await gmail.users.messages.send({ userId: 'me', requestBody: { raw } }).catch(() => {});
          }
        }
      } catch {
        // Non-fatal — don't block the response
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const slot_id = searchParams.get('slot_id') || '';
    if (!slot_id) return NextResponse.json({ error: 'slot_id required' }, { status: 400 });

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Dispatch_Schedule!A2:A5000' });
    const rows = res.data.values || [];
    const rowIdx = rows.findIndex(r => r[0] === slot_id);
    if (rowIdx === -1) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

    // Clear the row
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `Dispatch_Schedule!A${rowIdx+2}:O${rowIdx+2}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
