/**
 * GET /api/qbo/sync-invoices
 * Fetches all QBO invoices, fuzzy-matches to Service_Work_Orders by customer name,
 * writes invoice data to WO columns AA–AE (qbo_invoice_id, invoice_number,
 * invoice_total, invoice_balance, invoice_date).
 * NEVER overwrites any pre-existing WO columns — only writes to AA–AE.
 */

import { NextResponse } from 'next/server';
import { checkPermissionServer } from '@/lib/permissions';
import { qboFetch } from '@/lib/qbo';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { getBackendSheetId } from '@/lib/backend-config';

const BACKEND_SHEET_ID = getBackendSheetId();
const TAB = 'Service_Work_Orders';

// Invoice columns — AD through AH (after existing metadata cols AA–AC)
// 0-based: AD=29, AE=30, AF=31, AG=32, AH=33
const INV_COL = {
  qbo_invoice_id:  29, // AD
  invoice_number:  30, // AE
  invoice_total:   31, // AF
  invoice_balance: 32, // AG
  invoice_date:    33, // AH
};
const CUSTOMER_NAME_COL = 12; // M (0-based)
const WO_ID_COL = 0; // A

function colLetter(idx: number): string {
  let result = '';
  let n = idx;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

/** Normalize a name for fuzzy matching */
function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Simple fuzzy match: score how similar two strings are */
function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // Token overlap
  const tokA = new Set(na.split(' '));
  const tokB = new Set(nb.split(' '));
  const intersect = [...tokA].filter(t => tokB.has(t) && t.length > 2).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union > 0 ? intersect / union : 0;
}

/** Fetch all QBO invoices (paginate up to 1000) */
async function fetchAllInvoices(): Promise<Record<string, unknown>[]> {
  const query = encodeURIComponent(
    `SELECT * FROM Invoice ORDERBY TxnDate DESC MAXRESULTS 1000`
  );
  const res = await qboFetch(`query?query=${query}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO invoice fetch failed: ${err}`);
  }
  const data = await res.json();
  return data.QueryResponse?.Invoice || [];
}

export async function GET() {
  const { allowed } = await checkPermissionServer('finance:view');
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden: finance:view required' }, { status: 403 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // 1. Fetch WO rows from sheet
    const woRes = await sheets.spreadsheets.values.get({
      spreadsheetId: BACKEND_SHEET_ID,
      range: `${TAB}!A2:AH5000`,
    });
    const rows = (woRes.data.values || []) as string[][];

    // 2. Fetch QBO invoices
    const invoices = await fetchAllInvoices();

    // 3. Build WO lookup: normalized customer_name → row index
    const woIndex: { norm: string; original: string; rowIdx: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const customerName = (row[CUSTOMER_NAME_COL] || '').trim();
      if (customerName) {
        woIndex.push({ norm: normalize(customerName), original: customerName, rowIdx: i });
      }
    }

    // 4. Match invoices → WOs
    const matched: { invoiceId: string; invoiceNumber: string; customerName: string; woRowIdx: number; score: number }[] = [];
    const unmatched: { invoiceId: string; invoiceNumber: string; customerName: string }[] = [];

    for (const inv of invoices) {
      const customerRef = inv.CustomerRef as Record<string, string> | undefined;
      const qboCustomerName = customerRef?.name || '';
      const invoiceId = String(inv.Id || '');
      const invoiceNumber = String(inv.DocNumber || '');

      // Find best WO match
      let bestScore = 0;
      let bestRowIdx = -1;
      for (const entry of woIndex) {
        const score = similarityScore(qboCustomerName, entry.original);
        if (score > bestScore) {
          bestScore = score;
          bestRowIdx = entry.rowIdx;
        }
      }

      if (bestScore >= 0.4 && bestRowIdx >= 0) {
        matched.push({
          invoiceId,
          invoiceNumber,
          customerName: qboCustomerName,
          woRowIdx: bestRowIdx,
          score: bestScore,
        });
      } else {
        unmatched.push({ invoiceId, invoiceNumber, customerName: qboCustomerName });
      }
    }

    // 5. Write invoice data to WO rows (only AA–AE)
    //    If multiple invoices match same WO, use the most recent (first in sorted list)
    const writtenRows = new Set<number>();
    const batchData: { range: string; values: string[][] }[] = [];

    for (const match of matched) {
      if (writtenRows.has(match.woRowIdx)) continue; // skip duplicates (keep first/latest)
      writtenRows.add(match.woRowIdx);

      const inv = invoices.find(i => String(i.Id) === match.invoiceId)!;
      const sheetRow = match.woRowIdx + 2; // +1 for 0-base, +1 for header row

      const invoiceTotal = String(inv.TotalAmt ?? '');
      const invoiceBalance = String(inv.Balance ?? '');
      const invoiceDate = String(inv.TxnDate ?? '');

      // Write 5 cells: AA through AE
      batchData.push(
        { range: `${TAB}!${colLetter(INV_COL.qbo_invoice_id)}${sheetRow}`, values: [[match.invoiceId]] },
        { range: `${TAB}!${colLetter(INV_COL.invoice_number)}${sheetRow}`, values: [[match.invoiceNumber]] },
        { range: `${TAB}!${colLetter(INV_COL.invoice_total)}${sheetRow}`, values: [[invoiceTotal]] },
        { range: `${TAB}!${colLetter(INV_COL.invoice_balance)}${sheetRow}`, values: [[invoiceBalance]] },
        { range: `${TAB}!${colLetter(INV_COL.invoice_date)}${sheetRow}`, values: [[invoiceDate]] },
      );
    }

    // Batch write in chunks of 100 to avoid API limits
    for (let i = 0; i < batchData.length; i += 100) {
      const chunk = batchData.slice(i, i + 100);
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: BACKEND_SHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: chunk,
        },
      });
    }

    // 6. Return summary
    const unmatchedCustomers = unmatched.map(u => ({ ...u }));
    return NextResponse.json({
      ok: true,
      summary: {
        totalInvoices: invoices.length,
        matched: matched.length,
        unmatched: unmatched.length,
        wroteToSheet: writtenRows.size,
      },
      unmatchedInvoices: unmatchedCustomers,
      matchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-invoices]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
