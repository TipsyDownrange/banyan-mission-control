import { NextResponse } from 'next/server';
import { getSSToken, getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

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
      hoursToMeasure: rd['Hours to measure'] || '',
      men: rd['Men'] || '',
      startDate: rd['START DATE'] || '',
      done: rd['Done'] === 'true' || rd['Done'] === '1',
      comments: rd['Latest Comment'] || rd['Comments / leave date and hours spent on project'] || '',
      contact: (rd['CONTACT #'] || '').split('\n')[0].substring(0, 60),
      address: (rd['ADDRESS'] || '').substring(0, 60),
      lane,
    };
  }).filter(wo => wo.name);
}

// Simple in-process cache for folder links (refreshes every 10 minutes)
let folderLinkCache: { data: FolderLink[]; ts: number } | null = null;

type FolderLink = {
  folder_name: string;
  folder_id: string;
  folder_url: string;
  source: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(wo|work order|#|no\.?|job|igu|lami|glass|window|door|shower)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSetRatio(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = [...setA].filter(t => setB.has(t));
  if (!setA.size || !setB.size) return 0;
  const union = new Set([...setA, ...setB]);
  return Math.round((intersection.length / union.size) * 100);
}

async function getFolderLinks(): Promise<FolderLink[]> {
  const now = Date.now();
  if (folderLinkCache && now - folderLinkCache.ts < 10 * 60 * 1000) {
    return folderLinkCache.data;
  }
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });
    const SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'WO_Folder_Links!A:D',
    });
    const rows = res.data.values || [];
    const headers = rows[0] || [];
    const nameIdx = headers.indexOf('folder_name');
    const idIdx = headers.indexOf('folder_id');
    const urlIdx = headers.indexOf('folder_url');
    const srcIdx = headers.indexOf('source');
    const links: FolderLink[] = rows.slice(1).map(row => ({
      folder_name: row[nameIdx] || '',
      folder_id: row[idIdx] || '',
      folder_url: row[urlIdx] || '',
      source: row[srcIdx] || '',
    })).filter(l => l.folder_name && l.folder_url);
    folderLinkCache = { data: links, ts: now };
    return links;
  } catch {
    return folderLinkCache?.data || [];
  }
}

function matchFolderUrl(woName: string, links: FolderLink[]): string {
  if (!woName || !links.length) return '';
  const norm = normalize(woName);
  let best = 0;
  let bestUrl = '';
  for (const link of links) {
    const score = tokenSetRatio(norm, normalize(link.folder_name));
    if (score > best && score >= 45) {
      best = score;
      bestUrl = link.folder_url;
    }
  }
  return bestUrl;
}

export async function GET() {
  try {
    const token = getSSToken();
    const [active, completed, quoted, folderLinks] = await Promise.all([
      fetchSheet(token, SHEETS.active, 'active'),
      fetchSheet(token, SHEETS.completed, 'completed'),
      fetchSheet(token, SHEETS.quoted, 'quoted'),
      getFolderLinks(),
    ]);

    const all = [...active, ...quoted, ...completed].map(wo => ({
      ...wo,
      folderUrl: matchFolderUrl(wo.name, folderLinks),
    }));

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
