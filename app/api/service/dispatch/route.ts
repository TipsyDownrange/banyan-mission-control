import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';

// Smartsheet column IDs for WORK ORDERS sheet (7905619916154756)
const COL = {
  taskName:     5281432546895748,
  address:      2111327923136388,
  contact:      6614927550506884,
  woNumber:     4363127736821636,
  island:       6826033783039876,
  description:  70634341984132,
  status:       8866727364192132,
  startDate:    4574233969354628,
  assignedTo:   1196534248826756,
  comments:     7951933689882500,
  dateReceived: 3153803953786756,
  dueDate:      7657403581157252,
  scheduledDate:198316698324868,
};

const SHEET_ID = '7905619916154756';

// POST — create new work order row
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      customerName, address, city, island,
      contactPerson, contactPhone,
      description, systemType, urgency,
      assignedTo, notes, woNumber, dateReceived,
    } = body;

    if (!customerName || !description || !island) {
      return NextResponse.json({ error: 'customerName, description, and island are required' }, { status: 400 });
    }

    const token = getSSToken();

    const taskName = systemType ? `${customerName} — ${systemType}` : customerName;
    const contactStr = [contactPerson, contactPhone].filter(Boolean).join(' · ');
    const addressStr = [address, city].filter(Boolean).join(', ');
    const today = dateReceived || new Date().toISOString().slice(0, 10);
    const wo = woNumber || `${new Date().getFullYear().toString().slice(-2)}-${Math.floor(Math.random() * 9000) + 1000}`;
    const statusStr = urgency === 'urgent' ? 'REQUESTING A PROPOSAL' : 'REQUESTING A PROPOSAL';
    const notesStr = [notes, urgency === 'urgent' ? '⚡ URGENT' : ''].filter(Boolean).join(' | ');

    const cells = [
      { columnId: COL.taskName,     value: taskName, strict: false },
      { columnId: COL.woNumber,     value: wo, strict: false },
      { columnId: COL.description,  value: description, strict: false },
      { columnId: COL.island,       value: island, strict: false },
      { columnId: COL.address,      value: addressStr, strict: false },
      { columnId: COL.contact,      value: contactStr, strict: false },
      { columnId: COL.status,       value: statusStr, strict: false },
      { columnId: COL.assignedTo,   value: assignedTo || '', strict: false },
      { columnId: COL.dateReceived, value: today, strict: false },
      { columnId: COL.comments,     value: notesStr, strict: false },
    ];

    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}/rows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ toBottom: true, cells }]),
    });

    const data = await res.json() as { result?: { id: number }[]; message?: string };
    if (!res.ok) {
      return NextResponse.json({ error: data.message || 'Smartsheet write failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rowId: data.result?.[0]?.id, woNumber: wo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
