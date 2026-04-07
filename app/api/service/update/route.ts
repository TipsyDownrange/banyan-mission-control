import { NextResponse } from 'next/server';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { checkPermission } from '@/lib/permissions';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const TAB = 'Service_Work_Orders';

// Column index map (0-based, must match migration HEADERS)
const COL_IDX: Record<string, number> = {
  wo_id:           0,
  wo_number:       1,
  name:            2,
  description:     3,
  status:          4,
  island:          5,
  area_of_island:  6,
  address:         7,
  contact_person:  8,
  contact_title:   9,
  contact_phone:   10,
  contact_email:   11,
  customer_name:   12,
  system_type:     13,
  assigned_to:     14,
  date_received:   15,
  due_date:        16,
  scheduled_date:  17,
  start_date:      18,
  hours_estimated: 19,
  hours_actual:    20,
  men_required:    21,
  comments:        22,
  folder_url:      23,
  quote_total:     24,
  quote_status:    25,
  created_at:      26,
  updated_at:      27,
  source:          28,
};

function colLetter(idx: number): string {
  // 0-based index → spreadsheet column letter (A, B, ... Z, AA, ...)
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

// PATCH — update an existing WO row by wo_id or wo_number
// Body: { woId?, woNumber?, stage?, status?, assignedTo?, description?,
//         scheduledDate?, startDate?, notes?, hoursEstimated?, hoursActual?,
//         men?, contactPhone?, contactEmail?, contactPerson?, folderUrl?, island? }
export async function PATCH(req: Request) {
  // Permission check — wo:edit required (Joey, Nate, Sean, Jody)
  const { allowed } = await checkPermission(req, 'wo:edit');
  if (!allowed) return NextResponse.json({ error: 'Forbidden: wo:edit required' }, { status: 403 });

  try {
    const body = await req.json();
    const { woId, woNumber, stage, status } = body;

    if (!woId && !woNumber) {
      return NextResponse.json({ error: 'woId or woNumber required' }, { status: 400 });
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch all rows to find the target
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A2:AC5000`,
    });

    const rows = res.data.values || [];
    let targetRowIdx = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as string[];
      const rowWoId = (row[COL_IDX.wo_id] || '').trim();
      const rowWoNum = (row[COL_IDX.wo_number] || '').trim();
      if (woId && rowWoId === woId) { targetRowIdx = i; break; }
      if (woNumber && (rowWoNum === woNumber || rowWoId === `WO-${woNumber}`)) {
        targetRowIdx = i;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return NextResponse.json(
        { error: `WO not found: ${woId || woNumber}` },
        { status: 404 }
      );
    }

    // Sheet row number: data starts at row 2 (header is row 1)
    const sheetRow = targetRowIdx + 2;
    const now = new Date().toISOString();

    // Build field updates
    const updates: { col: string; value: string }[] = [];

    const fieldMap: Record<string, string> = {
      status:          'status',
      assignedTo:      'assigned_to',
      description:     'description',
      scheduledDate:   'scheduled_date',
      startDate:       'start_date',
      notes:           'comments',
      hoursEstimated:  'hours_estimated',
      hoursActual:     'hours_actual',
      men:             'men_required',
      contactPhone:    'contact_phone',
      contactEmail:    'contact_email',
      contactPerson:   'contact_person',
      contactTitle:    'contact_title',
      customerName:    'customer_name',
      folderUrl:       'folder_url',
      island:          'island',
      quoteTotal:      'quote_total',
      quoteStatus:     'quote_status',
    };

    // Handle stage → status mapping (legacy frontend compat)
    const stageToStatus: Record<string, string> = {
      lead:        'lead',
      quote:       'quote',
      quoted:      'quoted',
      accepted:    'accepted',
      approved:    'approved',
      scheduled:   'scheduled',
      in_progress: 'in_progress',
      closed:      'closed',
      lost:        'lost',
    };

    const resolvedStatus = status || (stage ? stageToStatus[stage] : undefined);
    if (resolvedStatus) {
      updates.push({
        col: colLetter(COL_IDX.status),
        value: resolvedStatus,
      });
    }

    // Map all other fields
    for (const [bodyKey, colKey] of Object.entries(fieldMap)) {
      if (bodyKey === 'status') continue; // handled above
      if (body[bodyKey] !== undefined) {
        updates.push({
          col: colLetter(COL_IDX[colKey]),
          value: String(body[bodyKey]),
        });
      }
    }

    // Always update updated_at
    updates.push({
      col: colLetter(COL_IDX.updated_at),
      value: now,
    });

    if (updates.length === 1) {
      // Only updated_at — nothing else changed
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Write each updated cell individually (avoids range conflicts)
    const requests = updates.map(({ col, value }) => ({
      range: `${TAB}!${col}${sheetRow}`,
      values: [[value]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: BACKEND_SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: requests,
      },
    });

    // If this is a dispatch update (scheduledDate + assignedTo both provided),
    // also write to Dispatch_Schedule for the field crew calendar
    const { scheduledDate, assignedTo } = body;
    const resolvedWoNumber = woNumber || rows[targetRowIdx]?.[COL_IDX.wo_number] || woId;
    const woName = rows[targetRowIdx]?.[COL_IDX.name] || '';
    const woIsland = body.island || rows[targetRowIdx]?.[COL_IDX.island] || '';

    if (scheduledDate && assignedTo) {
      try {
        const fieldSheetId = process.env.FIELD_BACKEND_SHEET_ID;
        if (fieldSheetId) {
          const slotId = `SVC-${resolvedWoNumber}-${scheduledDate}`;
          const menRequired = body.men || '1';
          const displayName = woName || `Service WO ${resolvedWoNumber}`;

          const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: fieldSheetId,
            range: 'Dispatch_Schedule!A2:J5000',
          });
          const existingRows = existing.data.values || [];
          const alreadyExists = existingRows.some(r => r[0] === slotId);

          if (!alreadyExists) {
            await sheets.spreadsheets.values.append({
              spreadsheetId: fieldSheetId,
              range: 'Dispatch_Schedule!A:J',
              valueInputOption: 'RAW',
              requestBody: {
                values: [[
                  slotId, scheduledDate, `SVC-${resolvedWoNumber}`,
                  displayName, woIsland, menRequired,
                  body.hoursEstimated || '', assignedTo,
                  'Joey Ritthaler', 'filled',
                ]],
              },
            });
          } else {
            const rowIndex = existingRows.findIndex(r => r[0] === slotId);
            if (rowIndex >= 0) {
              await sheets.spreadsheets.values.update({
                spreadsheetId: fieldSheetId,
                range: `Dispatch_Schedule!H${rowIndex + 2}:J${rowIndex + 2}`,
                valueInputOption: 'RAW',
                requestBody: { values: [[assignedTo, 'Joey Ritthaler', 'filled']] },
              });
            }
          }
        }
      } catch {
        console.error('[schedule-sync] Failed to write to Dispatch_Schedule');
      }
    }

    return NextResponse.json({ ok: true, sheetRow, woId: woId || resolvedWoNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
