import { NextResponse } from 'next/server';
import { getSSToken, getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const COL = {
  woNumber:       4363127736821636,
  status:         8866727364192132,
  assignedTo:     1196534248826756,
  description:    70634341984132,
  scheduledDate:  198316698324868,
  comments:       7951933689882500,
  hoursEstimated: 5700133876197252, // "Hours to measure"
};

// BanyanOS stage → Smartsheet status string
const STAGE_TO_STATUS: Record<string, string> = {
  lead:        'REQUESTING A PROPOSAL',
  quote:       'REQUESTING A PROPOSAL',
  approved:    'NEED TO SCHEDULE',
  scheduled:   'SCHEDULED',
  in_progress: 'FABRICATING',
  closed:      'COMPLETED',
};

const SHEET_ID = '7905619916154756';

type SheetData = {
  columns?: { id: number; title: string }[];
  rows?: { id: number; cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
};

// PATCH — update an existing row by work order number or row ID
// Body: { rowId?, woNumber?, stage?, assignedTo?, description?, scheduledDate?, notes?, hoursEstimated?, hoursActual? }
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { rowId, woNumber, woName, stage, assignedTo, description, scheduledDate, notes, hoursEstimated, hoursActual } = body;
    let island: string = body.island || '';

    if (!rowId && !woNumber) {
      return NextResponse.json({ error: 'rowId or woNumber required' }, { status: 400 });
    }

    const token = getSSToken();

    // Always fetch sheet when we need to find row by WO# or look up hoursActual column
    const needsSheetFetch = (!rowId && woNumber) || hoursActual !== undefined;
    let targetRowId: number = rowId;
    let hoursActualColId: number | null = null;
    let sheetData: SheetData | null = null;

    if (needsSheetFetch) {
      const searchRes = await fetch(
        `https://api.smartsheet.com/2.0/sheets/${SHEET_ID}?pageSize=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sheet = await searchRes.json() as SheetData;
      sheetData = sheet;

      // Find row by WO number if no rowId
      if (!targetRowId && woNumber) {
        const row = sheet.rows?.find(r =>
          r.cells.some(c => c.columnId === COL.woNumber && (c.value === woNumber || c.displayValue === woNumber))
        );
        if (!row) return NextResponse.json({ error: `Row not found for WO ${woNumber}` }, { status: 404 });
        targetRowId = row.id;
      }

      // Find "Hours on project" column dynamically
      if (hoursActual !== undefined) {
        hoursActualColId = sheet.columns?.find(c =>
          c.title.toLowerCase().includes('hours on project') ||
          c.title.toLowerCase().includes('actual hours') ||
          c.title.toLowerCase() === 'hours'
        )?.id ?? null;
      }
    }

    const cells: { columnId: number; value: string }[] = [];
    if (stage && STAGE_TO_STATUS[stage])   cells.push({ columnId: COL.status,         value: STAGE_TO_STATUS[stage] });
    if (assignedTo !== undefined)          cells.push({ columnId: COL.assignedTo,      value: assignedTo });
    if (description !== undefined)         cells.push({ columnId: COL.description,     value: description });
    if (scheduledDate !== undefined)       cells.push({ columnId: COL.scheduledDate,   value: scheduledDate });
    if (notes !== undefined)               cells.push({ columnId: COL.comments,        value: notes });
    if (hoursEstimated !== undefined)      cells.push({ columnId: COL.hoursEstimated,  value: String(hoursEstimated) });
    if (hoursActual !== undefined && hoursActualColId) {
      cells.push({ columnId: hoursActualColId, value: String(hoursActual) });
    }

    if (cells.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ id: targetRowId, cells }]),
    });

    const data = await res.json() as { message?: string };
    if (!res.ok) {
      return NextResponse.json({ error: data.message || 'Smartsheet update failed' }, { status: 500 });
    }

    // If this is a dispatch (scheduledDate + assignedTo both provided), also write to Dispatch_Schedule
    if (scheduledDate && assignedTo) {
      try {
        const fieldSheetId = process.env.FIELD_BACKEND_SHEET_ID;
        if (fieldSheetId) {
          const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
          const sheets = google.sheets({ version: 'v4', auth });

          const slotId = `SVC-${woNumber || rowId}-${scheduledDate}`;
          const menRequired = body.men || '1';
          const displayName = woName || (woNumber ? `Service WO ${woNumber}` : 'Service Work Order');

          // Try to get island from sheet if not passed in body
          if (!island && sheetData) {
            const woRow = sheetData.rows?.find(r => r.id === targetRowId);
            if (woRow) {
              const islandColId = sheetData.columns?.find(c => c.title.toLowerCase() === 'island' || c.title.toLowerCase().includes('location'))?.id;
              if (islandColId) {
                const cell = woRow.cells.find(c => c.columnId === islandColId);
                island = String(cell?.displayValue || cell?.value || '');
              }
            }
          }

          // Check if slot already exists for this WO + date (avoid duplicates)
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
                  slotId,           // slot_id
                  scheduledDate,    // date
                  `SVC-${woNumber || rowId}`, // kID
                  displayName,      // project_name
                  island,           // island
                  menRequired,      // men_required
                  body.hoursEstimated || '', // hours_estimated
                  assignedTo,       // assigned_crew
                  'Joey Ritthaler', // created_by
                  'filled',         // status
                ]],
              },
            });
          } else {
            // Update existing slot's assigned_crew and status
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
        // Non-fatal: log to console but don't block the WO update response
        console.error('[schedule-sync] Failed to write to Dispatch_Schedule');
      }
    }

    return NextResponse.json({ ok: true, rowId: targetRowId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
