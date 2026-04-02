import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';

const COL = {
  taskName:       5281432546895748,
  woNumber:       4363127736821636,
  status:         8866727364192132,
  assignedTo:     1196534248826756,
  description:    70634341984132,
  scheduledDate:  198316698324868,
  comments:       7951933689882500,
  hoursEstimated: 5700133876197252, // "Hours to measure" — closest fit for pre-dispatch estimate
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

// PATCH — update an existing row by work order number or row ID
// Body: { rowId?, woNumber?, stage?, assignedTo?, description?, scheduledDate?, notes? }
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { rowId, woNumber, stage, assignedTo, description, scheduledDate, notes, hoursEstimated } = body;

    if (!rowId && !woNumber) {
      return NextResponse.json({ error: 'rowId or woNumber required' }, { status: 400 });
    }

    const token = getSSToken();

    // If we only have woNumber, find the row first
    let targetRowId = rowId;
    if (!targetRowId && woNumber) {
      const searchRes = await fetch(
        `https://api.smartsheet.com/2.0/sheets/${SHEET_ID}?pageSize=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sheet = await searchRes.json() as {
        columns?: { id: number; title: string }[];
        rows?: { id: number; cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
      };
      const woColId = COL.woNumber;
      const row = sheet.rows?.find(r =>
        r.cells.some(c => c.columnId === woColId && (c.value === woNumber || c.displayValue === woNumber))
      );
      if (!row) return NextResponse.json({ error: `Row not found for WO ${woNumber}` }, { status: 404 });
      targetRowId = row.id;
    }

    const cells: { columnId: number; value: string }[] = [];
    if (stage && STAGE_TO_STATUS[stage]) cells.push({ columnId: COL.status, value: STAGE_TO_STATUS[stage] });
    if (assignedTo !== undefined)   cells.push({ columnId: COL.assignedTo,    value: assignedTo });
    if (description !== undefined)  cells.push({ columnId: COL.description,   value: description });
    if (scheduledDate !== undefined) cells.push({ columnId: COL.scheduledDate, value: scheduledDate });
    if (notes !== undefined)            cells.push({ columnId: COL.comments,        value: notes });
    if (hoursEstimated !== undefined)   cells.push({ columnId: COL.hoursEstimated, value: String(hoursEstimated) });

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

    return NextResponse.json({ ok: true, rowId: targetRowId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
