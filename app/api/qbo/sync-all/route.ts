import { NextResponse } from 'next/server';
import { qboFetch } from '@/lib/qbo';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';

const SHEET_ID = getBackendSheetId();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (key !== 'kula-sync-2026') {
    return NextResponse.json({ error: 'Invalid sync key' }, { status: 401 });
  }

  try {
    const invQuery = encodeURIComponent("SELECT * FROM Invoice MAXRESULTS 1000");
    const invRes = await qboFetch(`query?query=${invQuery}`);
    if (!invRes.ok) {
      const err = await invRes.text();
      return NextResponse.json({ error: `QBO query failed: ${err.slice(0, 200)}` }, { status: 500 });
    }
    const invData = await invRes.json();
    const invoices: Record<string, unknown>[] = invData.QueryResponse?.Invoice || [];

    const billQuery = encodeURIComponent("SELECT * FROM Bill MAXRESULTS 1000");
    const billRes = await qboFetch(`query?query=${billQuery}`);
    const billData = await billRes.json();
    const bills: Record<string, unknown>[] = billData.QueryResponse?.Bill || [];

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });
    const woRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Service_Work_Orders!A2:M555' });
    const woRows = woRes.data.values || [];

    const matched: { woId: string; woRow: number; invoiceId: string; invoiceNum: string; amount: number; balance: number }[] = [];
    const unmatched: { customerName: string; invoiceNum: string; amount: number }[] = [];

    for (const inv of invoices) {
      const custRef = inv.CustomerRef as Record<string, string> | undefined;
      const custName = (custRef?.name || '').toLowerCase().trim();
      const invNum = String(inv.DocNumber || '');
      const amount = parseFloat(String(inv.TotalAmt)) || 0;
      const balance = parseFloat(String(inv.Balance)) || 0;

      let bestRow = -1;
      let bestScore = 0;

      for (let i = 0; i < woRows.length; i++) {
        const row = woRows[i];
        if (!row[0]) continue;
        const woCustomer = (row[12] || row[2] || '').toLowerCase().trim();
        if (!woCustomer) continue;
        const ct = custName.split(/\s+/).filter((t: string) => t.length > 2);
        const wt = woCustomer.split(/\s+/).filter((t: string) => t.length > 2);
        if (!ct.length || !wt.length) continue;
        const overlap = ct.filter((t: string) => wt.some((w: string) => w.includes(t) || t.includes(w))).length;
        const score = overlap / Math.max(ct.length, wt.length);
        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestRow = i;
        }
      }

      if (bestRow >= 0) {
        matched.push({ woId: woRows[bestRow][0], woRow: bestRow + 2, invoiceId: String(inv.Id), invoiceNum: invNum, amount, balance });
      } else {
        unmatched.push({ customerName: custName, invoiceNum: invNum, amount });
      }
    }

    let written = 0;
    for (const m of matched) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Service_Work_Orders!AA${m.woRow}:AE${m.woRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[m.invoiceId, m.invoiceNum, String(m.amount), String(m.balance), '']] },
        });
        written++;
      } catch { /* skip individual failures */ }
    }

    let billsWritten = 0;
    const costRows: string[][] = [];
    for (const bill of bills) {
      const vRef = bill.VendorRef as Record<string, string> | undefined;
      costRows.push([
        `QBO-BILL-${bill.Id}`, '', 'qbo', String(bill.Id), vRef?.name || '', '',
        String(parseFloat(String(bill.TotalAmt)) || 0), String(bill.TxnDate || ''),
        String(bill.DueDate || ''), parseFloat(String(bill.Balance)) === 0 ? 'paid' : 'unpaid', '', 'Other',
      ]);
      billsWritten++;
    }
    if (costRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'Project_Costs!A:L',
        valueInputOption: 'RAW', requestBody: { values: costRows },
      });
    }

    const totalInvoiced = invoices.reduce((a, i) => a + (parseFloat(String(i.TotalAmt)) || 0), 0);
    const totalOutstanding = invoices.reduce((a, i) => a + (parseFloat(String(i.Balance)) || 0), 0);
    const totalBilled = bills.reduce((a, b) => a + (parseFloat(String(b.TotalAmt)) || 0), 0);

    return NextResponse.json({
      ok: true,
      invoices: { total: invoices.length, matched: matched.length, unmatched: unmatched.length, written, totalInvoiced, totalOutstanding },
      bills: { total: bills.length, written: billsWritten, totalBilled },
      unmatchedSample: unmatched.slice(0, 10),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
