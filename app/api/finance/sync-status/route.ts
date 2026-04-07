/**
 * GET /api/finance/sync-status
 * Returns status of all finance sync operations:
 * - QBO invoice sync: last run, invoice count, matched WO count, unmatched
 * - Bill.com sync: last run, bill count
 * - Unmatched invoices that need manual WO linking
 */

import { NextResponse } from 'next/server';
import { checkPermissionServer } from '@/lib/permissions';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';
import { billcomLogin, getBills } from '@/lib/billcom';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const WO_TAB = 'Service_Work_Orders';
const COSTS_TAB = 'Project_Costs';

// WO columns (0-based)
const WO_COL = {
  wo_id:           0,
  name:            2,
  customer_name:   12,
  qbo_invoice_id:  26, // AA
  invoice_number:  27, // AB
  invoice_total:   28, // AC
  invoice_balance: 29, // AD
  invoice_date:    30, // AE
};

export async function GET() {
  const { allowed } = await checkPermissionServer('finance:view');
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden: finance:view required' }, { status: 403 });
  }

  try {
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    // ── QBO Invoice Status ──────────────────────────────────────────────────
    const [woRes, costsRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${WO_TAB}!A2:AE5000`,
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${COSTS_TAB}!A2:L5000`,
      }).catch(() => ({ data: { values: [] } })),
    ]);

    const woRows = (woRes.data.values || []) as string[][];

    // Count WOs with invoice data
    const wosWithInvoice = woRows.filter(r => r[WO_COL.qbo_invoice_id]?.trim());
    const wosWithoutInvoice = woRows.filter(r => !r[WO_COL.qbo_invoice_id]?.trim() && r[WO_COL.wo_id]?.trim());

    // Invoices with zero balance = paid
    const paidInvoices = wosWithInvoice.filter(r => {
      const balance = parseFloat(r[WO_COL.invoice_balance] || '0');
      return balance === 0;
    });
    const outstandingInvoices = wosWithInvoice.filter(r => {
      const balance = parseFloat(r[WO_COL.invoice_balance] || '0');
      return balance > 0;
    });

    // Find last sync time from invoice dates (rough proxy)
    const invoiceDates = wosWithInvoice
      .map(r => r[WO_COL.invoice_date])
      .filter(Boolean)
      .sort()
      .reverse();
    const lastQboSync = invoiceDates[0] || null;

    // ── Project_Costs Status ────────────────────────────────────────────────
    const costsRows = (costsRes.data.values || []) as string[][];
    const qboCostRows = costsRows.filter(r => r[2] === 'qbo');
    const billcomCostRows = costsRows.filter(r => r[2] === 'billcom');

    // Bill.com status
    let billcomStatus: Record<string, unknown> = {
      configured: false,
      error: null,
    };

    const loginResult = await billcomLogin();
    if (!loginResult.ok) {
      billcomStatus = {
        configured: false,
        error: loginResult.error,
        syncedBills: billcomCostRows.length,
      };
    } else {
      const billsResult = await getBills(loginResult.session);
      billcomStatus = {
        configured: true,
        liveBillCount: billsResult.ok ? (billsResult.data as unknown[]).length : 0,
        syncedBills: billcomCostRows.length,
        lastSyncedBill: billcomCostRows.length > 0 ? billcomCostRows[billcomCostRows.length - 1]?.[7] : null,
        error: billsResult.ok ? null : billsResult.error,
      };
    }

    // ── Unmatched WOs (no invoice) ──────────────────────────────────────────
    const unmatchedWos = wosWithoutInvoice
      .slice(0, 50)
      .map(r => ({
        woId: r[WO_COL.wo_id],
        name: r[WO_COL.name],
        customerName: r[WO_COL.customer_name],
      }));

    return NextResponse.json({
      qboInvoices: {
        lastSyncDate: lastQboSync,
        wosWithInvoice: wosWithInvoice.length,
        paidInvoices: paidInvoices.length,
        outstandingInvoices: outstandingInvoices.length,
        wosWithoutInvoice: wosWithoutInvoice.length,
      },
      projectCosts: {
        totalCostRows: costsRows.length,
        qboRows: qboCostRows.length,
        billcomRows: billcomCostRows.length,
      },
      billcom: billcomStatus,
      unmatchedWos,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sync-status]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
