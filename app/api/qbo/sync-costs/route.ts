/**
 * GET /api/qbo/sync-costs
 * Fetches all QBO bills, writes each bill line as a row in Project_Costs tab.
 * cost_category inferred from QBO account name or line description.
 * Attempts best-effort kID match from project names in Core_Entities.
 */

import { NextResponse } from 'next/server';
import { checkPermissionServer } from '@/lib/permissions';
import { qboFetch } from '@/lib/qbo';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const COSTS_TAB = 'Project_Costs';

// Project_Costs columns A–L (0-based)
// A=cost_id, B=kID, C=source, D=source_id, E=vendor_name, F=cost_description,
// G=amount, H=bill_date, I=due_date, J=payment_status, K=payment_date, L=cost_category

const COST_HEADERS = [
  'cost_id', 'kID', 'source', 'source_id', 'vendor_name',
  'cost_description', 'amount', 'bill_date', 'due_date',
  'payment_status', 'payment_date', 'cost_category',
];

/** Infer cost category from account name or description */
function inferCategory(accountName: string, description: string): string {
  const text = `${accountName} ${description}`.toLowerCase();
  if (/material|material|supply|suppli|lumber|concrete|pipe|wire|equipment purchase/.test(text)) return 'Material';
  if (/labor|labour|payroll|wage|subcontract|sub-contract/.test(text)) return 'Labor';
  if (/equipment|rental|machine|tool/.test(text)) return 'Equipment';
  if (/subcontract|sub contract|contractor|outsource/.test(text)) return 'Sub';
  if (/freight|shipping|delivery|truck|haul/.test(text)) return 'Freight';
  return 'Other';
}

/** Simple normalize */
function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Token overlap score */
function score(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tokA = new Set(na.split(' ').filter(t => t.length > 2));
  const tokB = new Set(nb.split(' ').filter(t => t.length > 2));
  const intersect = [...tokA].filter(t => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union > 0 ? intersect / union : 0;
}

async function fetchAllBills(): Promise<Record<string, unknown>[]> {
  const query = encodeURIComponent(
    `SELECT * FROM Bill ORDERBY TxnDate DESC MAXRESULTS 1000`
  );
  const res = await qboFetch(`query?query=${query}`);
  if (!res.ok) throw new Error(`QBO bills fetch failed: ${await res.text()}`);
  const data = await res.json();
  return data.QueryResponse?.Bill || [];
}

export async function GET() {
  const { allowed } = await checkPermissionServer('finance:view');
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden: finance:view required' }, { status: 403 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Fetch QBO bills
    const bills = await fetchAllBills();

    // 2. Load existing Project_Costs to avoid duplicates
    let existingSourceIds = new Set<string>();
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${COSTS_TAB}!D2:D5000`, // source_id column
      });
      existingSourceIds = new Set(
        (existing.data.values || []).map(r => String(r[0] || '')).filter(Boolean)
      );
    } catch {
      // Tab may not exist yet; we'll create header below
    }

    // 3. Ensure header row exists
    try {
      const headerCheck = await sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${COSTS_TAB}!A1:L1`,
      });
      if (!(headerCheck.data.values || []).length) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: BACKEND_SHEET_ID,
          range: `${COSTS_TAB}!A1:L1`,
          valueInputOption: 'RAW',
          requestBody: { values: [COST_HEADERS] },
        });
      }
    } catch {
      // swallow — tab may already have headers
    }

    // 4. Build rows from bill lines
    const newRows: string[][] = [];
    let skipped = 0;

    for (const bill of bills) {
      const billId = String(bill.Id || '');
      const vendorRef = bill.VendorRef as Record<string, string> | undefined;
      const vendorName = vendorRef?.name || vendorRef?.value || '';
      const billDate = String(bill.TxnDate || '');
      const dueDate = String(bill.DueDate || '');
      const balance = Number(bill.Balance ?? 0);
      const totalAmt = Number(bill.TotalAmt ?? 0);
      const paymentStatus = balance === 0 && totalAmt > 0 ? 'paid' : balance > 0 ? 'unpaid' : 'unknown';

      const lines = (bill.Line as Record<string, unknown>[]) || [];
      let lineNum = 0;

      for (const line of lines) {
        if (!line.Amount) continue;
        lineNum++;

        const lineId = `qbo-bill-${billId}-${lineNum}`;
        if (existingSourceIds.has(lineId)) { skipped++; continue; }

        const desc = String(line.Description || '');
        const amount = String(line.Amount || '');

        // Try to get account name from line detail
        const detail = (line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail) as Record<string, unknown> | undefined;
        const accountRef = detail?.AccountRef as Record<string, string> | undefined;
        const accountName = accountRef?.name || '';

        const category = inferCategory(accountName, desc);

        const row: string[] = [
          lineId,          // A: cost_id
          '',              // B: kID (best-effort below)
          'qbo',           // C: source
          lineId,          // D: source_id
          vendorName,      // E: vendor_name
          desc || accountName, // F: cost_description
          amount,          // G: amount
          billDate,        // H: bill_date
          dueDate,         // I: due_date
          paymentStatus,   // J: payment_status
          '',              // K: payment_date
          category,        // L: cost_category
        ];

        newRows.push(row);
        existingSourceIds.add(lineId);
      }
    }

    // 5. Append new rows
    if (newRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${COSTS_TAB}!A:L`,
        valueInputOption: 'RAW',
        requestBody: { values: newRows },
      });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        totalBills: bills.length,
        newRows: newRows.length,
        skippedDuplicates: skipped,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-costs]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
