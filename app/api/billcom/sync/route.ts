/**
 * GET /api/billcom/sync
 * Login to Bill.com, fetch all bills, write to Project_Costs tab.
 * Same schema as QBO sync but source='billcom'.
 */

import { NextResponse } from 'next/server';
import { checkPermissionServer } from '@/lib/permissions';
import { billcomLogin, getBills, getVendors } from '@/lib/billcom';
import { getGoogleAuth } from '@/lib/gauth';
import { google } from 'googleapis';

const BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
const COSTS_TAB = 'Project_Costs';

const COST_HEADERS = [
  'cost_id', 'kID', 'source', 'source_id', 'vendor_name',
  'cost_description', 'amount', 'bill_date', 'due_date',
  'payment_status', 'payment_date', 'cost_category',
];

function inferCategory(description: string): string {
  const text = (description || '').toLowerCase();
  if (/material|supply|suppli|lumber|concrete|pipe|wire/.test(text)) return 'Material';
  if (/labor|labour|payroll|wage|subcontract/.test(text)) return 'Labor';
  if (/equipment|rental|machine|tool/.test(text)) return 'Equipment';
  if (/subcontract|contractor|outsource/.test(text)) return 'Sub';
  if (/freight|shipping|delivery|truck|haul/.test(text)) return 'Freight';
  return 'Other';
}

export async function GET() {
  const { allowed } = await checkPermissionServer('finance:view');
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden: finance:view required' }, { status: 403 });
  }

  // Login to Bill.com
  const loginResult = await billcomLogin();
  if (!loginResult.ok) {
    return NextResponse.json({ error: loginResult.error }, { status: 503 });
  }
  const { session } = loginResult;

  try {
    // Fetch bills and vendors in parallel
    const [billsResult, vendorsResult] = await Promise.all([
      getBills(session),
      getVendors(session),
    ]);

    if (!billsResult.ok) {
      return NextResponse.json({ error: billsResult.error }, { status: 502 });
    }

    // Build vendor ID → name lookup
    const vendorMap: Record<string, string> = {};
    if (vendorsResult.ok) {
      const vendors = (vendorsResult.data as Record<string, unknown>[]) || [];
      for (const v of vendors) {
        vendorMap[String(v.id || '')] = String(v.name || v.id || '');
      }
    }

    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
    const sheets = google.sheets({ version: 'v4', auth });

    // Load existing source_ids to skip duplicates
    let existingSourceIds = new Set<string>();
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: BACKEND_SHEET_ID,
        range: `${COSTS_TAB}!D2:D5000`,
      });
      existingSourceIds = new Set(
        (existing.data.values || []).map(r => String(r[0] || '')).filter(Boolean)
      );
    } catch { /* tab may not exist yet */ }

    // Ensure header row
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
    } catch { /* swallow */ }

    // Build rows from Bill.com bills
    const bills = (billsResult.data as Record<string, unknown>[]) || [];
    const newRows: string[][] = [];
    let skipped = 0;

    for (const bill of bills) {
      const billId = String(bill.id || '');
      const sourceId = `billcom-${billId}`;

      if (existingSourceIds.has(sourceId)) { skipped++; continue; }

      const vendorName = vendorMap[String(bill.vendorId || '')] || String(bill.vendorId || '');
      const description = String(bill.description || '');
      const amount = String(bill.amount || '');
      const billDate = String(bill.invoiceDate || '');
      const dueDate = String(bill.dueDate || '');
      const paymentStatus = String(bill.paymentStatus || bill.approvalStatus || 'unknown');
      const category = inferCategory(description);

      const row: string[] = [
        sourceId,      // A: cost_id
        '',            // B: kID
        'billcom',     // C: source
        sourceId,      // D: source_id
        vendorName,    // E: vendor_name
        description,   // F: cost_description
        amount,        // G: amount
        billDate,      // H: bill_date
        dueDate,       // I: due_date
        paymentStatus, // J: payment_status
        '',            // K: payment_date
        category,      // L: cost_category
      ];

      newRows.push(row);
      existingSourceIds.add(sourceId);
    }

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
    console.error('[billcom-sync]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
