import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth, getSSToken } from '@/lib/gauth';

const BID_LOG_ID = '18QyNI3JPuUw_nRl2EHSUrlWItOmD8PUlu3fysrwyrcA';

export async function GET() {
  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const today = new Date().toISOString().split('T')[0];
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    const result = await sheets.spreadsheets.values.get({ spreadsheetId: BID_LOG_ID, range: 'Bids!A1:Z200' });
    const rows = result.data.values || [];
    const headers = rows[0] || [];

    const bids_due = rows.slice(1).filter(row => {
      const b: Record<string,string> = {};
      headers.forEach((h,i) => { b[h as string] = row[i] || ''; });
      const due = b['Due Date'] || '';
      return due && today <= due && due <= in3Days && !['Won','Lost','No Bid','Submitted'].includes(b['Status'] || '');
    }).map(row => {
      const b: Record<string,string> = {};
      headers.forEach((h,i) => { b[h as string] = row[i] || ''; });
      return { name: b['Job Name'], due: b['Due Date'], assigned: b['Assigned To'], kID: b['kID'] };
    });

    let active_projects: {name: string; pm: string}[] = [];
    try {
      const token = getSSToken();
      const r = await fetch('https://api.smartsheet.com/2.0/sheets/1291254537080708?pageSize=5', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json() as {columns?: {id:number;title:string}[]; rows?: {cells:{columnId:number;displayValue?:string}[]}[]};
      const cols: Record<number,string> = {};
      for (const c of data.columns || []) cols[c.id] = c.title;
      for (const row of (data.rows || []).slice(0,5)) {
        const rd: Record<string,string> = {};
        for (const cell of row.cells || []) { if (cols[cell.columnId]) rd[cols[cell.columnId]] = cell.displayValue || ''; }
        if (rd['Job Name']) active_projects.push({ name: rd['Job Name'], pm: rd['Project Manager'] || '' });
      }
    } catch { /* optional */ }

    return NextResponse.json({ bids_due, active_projects, date: today });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300), bids_due: [], active_projects: [] });
  }
}
