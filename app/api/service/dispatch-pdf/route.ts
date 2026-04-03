import { NextResponse } from 'next/server';
import { generateDispatchWOPDF } from '@/lib/pdf-work-order-dispatch';
import { getSSToken } from '@/lib/gauth';

const SHEET_ID = '7905619916154756';

const COL_MAP: Record<number, string> = {
  5281432546895748: 'name',
  2111327923136388: 'address',
  6614927550506884: 'contact',
  4363127736821636: 'wo_number',
  6826033783039876: 'island',
  70634341984132:   'description',
  8866727364192132: 'status',
  1196534248826756: 'assigned_to',
  3153803953786756: 'date_received',
  198316698324868:  'scheduled_date',
  5700133876197252: 'hours_to_measure',
  3448334062512004: 'hours_estimated',
  4279703860629380: 'men',
  7951933689882500: 'comments',
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const woNumber = searchParams.get('wo') || '';
    if (!woNumber) return NextResponse.json({ error: 'wo required' }, { status: 400 });

    const token = getSSToken();
    const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${SHEET_ID}?pageSize=200`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sheet = await res.json() as { columns?: { id: number; title: string }[]; rows?: { id: number; cells: { columnId: number; value?: unknown; displayValue?: string }[] }[] };

    const woColId = sheet.columns?.find(c => c.title === 'WORK ORDER #')?.id;
    const row = sheet.rows?.find(r => r.cells.some(c => c.columnId === woColId && (c.displayValue === woNumber || c.value === woNumber)));
    if (!row) return NextResponse.json({ error: `WO ${woNumber} not found` }, { status: 404 });

    const rd: Record<string, string> = {};
    for (const cell of row.cells) {
      const key = COL_MAP[cell.columnId];
      if (key) rd[key] = cell.displayValue || String(cell.value ?? '');
    }

    // Parse assigned crew
    const crewNames = (rd.assigned_to || '').split(',').map(s => s.trim()).filter(Boolean);
    const crew = crewNames.map(name => ({ name, role: 'Glazier' }));

    // Parse contact
    const contact = rd.contact || '';
    const phoneMatch = contact.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);

    const dispatchData = {
      wo_number: rd.wo_number || woNumber,
      date: new Date().toISOString().slice(0, 10),
      scheduled_date: rd.scheduled_date || '',
      project_name: rd.name || '',
      address: rd.address || '',
      island: rd.island || '',
      contact_name: contact.replace(/[\d\s\-\.()]+/g, '').trim() || '',
      contact_phone: phoneMatch?.[1] || '',
      scope_description: rd.description || '',
      crew,
      foreman: crewNames[0] || '',
      estimated_hours: rd.hours_estimated || rd.hours_to_measure || '',
      men_count: rd.men || String(crewNames.length) || '',
      special_instructions: rd.comments || '',
    };

    const pdfBuffer = await generateDispatchWOPDF(dispatchData);
    const filename = `Dispatch-WO-${woNumber}-${dispatchData.scheduled_date || dispatchData.date}.pdf`;

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
