import { NextResponse } from 'next/server';
import { getSSToken } from '@/lib/gauth';

const SHEETS = {
  active: '7905619916154756',
  completed: '8935301818148740',
  quoted: '1349614456229764',
};

const STATUS_MAP: Record<string, string> = {
  'REQUESTING A PROPOSAL': 'quote',
  'NEED TO SCHEDULE': 'approved',
  'MEASURED': 'scheduled',
  'FABRICATING': 'in_progress',
  'SCHEDULED': 'dispatched',
  'COMPLETED': 'closed',
  'LOST': 'lost',
  'REJECTED': 'lost',
};

async function fetchSheet(token: string, sheetId: string, lane: string) {
  const res = await fetch(
    `https://api.smartsheet.com/2.0/sheets/${sheetId}?pageSize=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as {
    columns?: { id: number; title: string }[];
    rows?: { cells: { columnId: number; value?: unknown; displayValue?: string }[] }[];
  };
  const cols: Record<number, string> = {};
  for (const c of data.columns || []) cols[c.id] = c.title;

  return (data.rows || []).map(row => {
    const rd: Record<string, string> = {};
    for (const cell of row.cells || []) {
      if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || String(cell.value || '');
    }
    const rawStatus = rd['Status'] || '';
    const status = STATUS_MAP[rawStatus.toUpperCase()] || STATUS_MAP[rawStatus] || 'lead';
    return {
      id: rd['WORK ORDER #'] || rd['Job Name/WO Number'] || '',
      name: (rd['Task Name / Job Name'] || rd['Job Name/WO Number'] || '').split('\n')[0].substring(0, 80),
      description: rd['DESCRIPTION'] || '',
      status,
      rawStatus,
      island: rd['Area of island'] || '',
      assignedTo: rd['Assigned To'] || '',
      dateReceived: rd['DATE RECEIVED'] || '',
      dueDate: rd['Due Date'] || rd['FINISH DATES'] || '',
      scheduledDate: rd['Scheduled Date'] || '',
      hoursEstimated: rd['Hours on project Joey to input'] || '',
      hoursActual: rd['Hours on project'] || '',
      comments: rd['Latest Comment'] || rd['Comments / leave date and hours spent on project'] || '',
      contact: (rd['CONTACT #'] || '').split('\n')[0].substring(0, 60),
      address: (rd['ADDRESS'] || '').substring(0, 60),
      lane,
    };
  }).filter(wo => wo.name);
}

export async function GET() {
  try {
    const token = getSSToken();
    const [active, completed, quoted] = await Promise.all([
      fetchSheet(token, SHEETS.active, 'active'),
      fetchSheet(token, SHEETS.completed, 'completed'),
      fetchSheet(token, SHEETS.quoted, 'quoted'),
    ]);

    const all = [...active, ...quoted, ...completed];

    const byStatus = {
      lead: all.filter(w => w.status === 'lead'),
      quote: all.filter(w => w.status === 'quote'),
      approved: all.filter(w => w.status === 'approved'),
      scheduled: all.filter(w => w.status === 'scheduled' || w.status === 'dispatched'),
      in_progress: all.filter(w => w.status === 'in_progress'),
      closed: all.filter(w => w.status === 'closed').slice(0, 10),
      lost: all.filter(w => w.status === 'lost').slice(0, 5),
    };

    return NextResponse.json({
      workOrders: all,
      byStatus,
      stats: {
        active: active.length + quoted.length,
        completed: completed.length,
        needsScheduling: active.filter(w => w.rawStatus === 'NEED TO SCHEDULE').length,
        inProgress: active.filter(w => ['FABRICATING','MEASURED'].includes(w.rawStatus)).length,
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, workOrders: [], byStatus: {}, stats: {} }, { status: 500 });
  }
}
