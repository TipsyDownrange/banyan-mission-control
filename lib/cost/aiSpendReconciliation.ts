/**
 * Cost & Usage Phase 1 v2 — Billed To Date aggregator.
 *
 * Reads the Banyan_AISpend sheet (Admin-API daily rollups) and the
 * Banyan_CostRelayLog sheet (Gmail-scrubbed receipts) and produces
 * the three numbers shown in the Ship's Bridge "Billed To Date" strip:
 *
 *   - last 30 days
 *   - this calendar month
 *   - trailing 12 months
 *
 * Sheets-of-record are owned by Kai's spend/billed relays; this module
 * is read-only and tolerant of missing tabs (returns zeros).
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';

const SPEND_TAB = 'Banyan_AISpend';
const BILLED_TAB = 'Banyan_CostRelayLog';

export interface BilledAggregate {
  last30d: number;
  thisMonth: number;
  trailing12m: number;
}

export interface AggregatedBilled {
  /** Combined view: receipts where available, fall back to spend rollups. */
  combined: BilledAggregate;
  /** Pure Admin API spend totals. */
  apiSpend: BilledAggregate;
  /** Pure Gmail receipt totals. */
  receipts: BilledAggregate;
  /** ISO 8601 when this aggregate was computed. */
  computedAt: string;
}

export async function readBilledAggregate(now: Date = new Date()): Promise<AggregatedBilled> {
  const computedAt = now.toISOString();
  let apiRows: SpendRow[] = [];
  let receiptRows: ReceiptRow[] = [];

  try {
    const sheetId = getBackendSheetId();
    const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const sheets = google.sheets({ version: 'v4', auth });

    const [spendRes, billedRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${SPEND_TAB}!A2:F10000` }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${BILLED_TAB}!A2:G10000` }).catch(() => ({ data: { values: [] } })),
    ]);

    apiRows = parseSpendRows((spendRes.data.values || []) as string[][]);
    receiptRows = parseReceiptRows((billedRes.data.values || []) as string[][]);
  } catch (err) {
    console.warn('[aiSpendReconciliation] read failed:', err instanceof Error ? err.message : String(err));
  }

  const apiSpend = aggregateSpend(apiRows, now);
  const receipts = aggregateReceipts(receiptRows, now);

  // Combined: prefer receipts (real money) where present, otherwise fall back
  // to API rollups (good enough for in-flight current period).
  const combined: BilledAggregate = {
    last30d: receipts.last30d > 0 ? receipts.last30d : apiSpend.last30d,
    thisMonth: receipts.thisMonth > 0 ? receipts.thisMonth : apiSpend.thisMonth,
    trailing12m: receipts.trailing12m > 0 ? receipts.trailing12m : apiSpend.trailing12m,
  };

  return { combined, apiSpend, receipts, computedAt };
}

interface SpendRow {
  fetchedAt: string;
  scope: string;
  amountUsd: number;
}

interface ReceiptRow {
  period: string;
  amountUsd: number;
}

function parseSpendRows(values: string[][]): SpendRow[] {
  return values
    .filter(r => r.length >= 5 && r[0])
    .map(r => ({
      fetchedAt: r[0] || '',
      scope: r[3] || '',
      amountUsd: parseFloat(r[4]) || 0,
    }));
}

function parseReceiptRows(values: string[][]): ReceiptRow[] {
  return values
    .filter(r => r.length >= 5 && r[0])
    .map(r => ({
      period: r[3] || '',
      amountUsd: parseFloat(r[4]) || 0,
    }));
}

function aggregateSpend(rows: SpendRow[], now: Date): BilledAggregate {
  // Each row is a rolling Admin-API rollup. Use the freshest 'today' /
  // 'month' samples; trailing-12m sums all 'month' samples whose fetchedAt
  // is within the trailing-12mo window, deduped by month bucket.
  const monthBuckets = new Map<string, number>();
  let latestTodayAmount = 0;
  let latestTodayAt = 0;
  let latestMonthAmount = 0;
  let latestMonthAt = 0;

  for (const row of rows) {
    const t = Date.parse(row.fetchedAt);
    if (!Number.isFinite(t)) continue;
    if (row.scope === 'today' && t > latestTodayAt) {
      latestTodayAt = t;
      latestTodayAmount = row.amountUsd;
    }
    if (row.scope === 'month' && t > latestMonthAt) {
      latestMonthAt = t;
      latestMonthAmount = row.amountUsd;
    }
    if (row.scope === 'month') {
      const bucket = row.fetchedAt.slice(0, 7); // YYYY-MM
      // Use the latest-seen month sample per bucket — they're rollups, not deltas.
      const prev = monthBuckets.get(bucket) || 0;
      monthBuckets.set(bucket, Math.max(prev, row.amountUsd));
    }
  }

  const twelveMoCutoff = new Date(now.getTime() - 365 * 86_400_000);
  const trailingCutoffBucket = twelveMoCutoff.toISOString().slice(0, 7);
  let trailing12m = 0;
  for (const [bucket, amount] of monthBuckets.entries()) {
    if (bucket >= trailingCutoffBucket) trailing12m += amount;
  }

  // Last 30d ≈ this-month rollup if no per-day data is available.
  // (Per packet §9: no per-model breakdown / daily drill in v2.)
  return {
    last30d: round2(latestMonthAmount),
    thisMonth: round2(latestMonthAmount),
    trailing12m: round2(trailing12m),
  };
}

function aggregateReceipts(rows: ReceiptRow[], now: Date): BilledAggregate {
  const thisMonthBucket = now.toISOString().slice(0, 7);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const twelveMoAgo = new Date(now.getTime() - 365 * 86_400_000);

  let last30d = 0;
  let thisMonth = 0;
  let trailing12m = 0;

  for (const row of rows) {
    const t = Date.parse(row.period);
    if (!Number.isFinite(t)) continue;
    const periodDate = new Date(t);
    if (periodDate >= thirtyDaysAgo) last30d += row.amountUsd;
    if (row.period.slice(0, 7) === thisMonthBucket) thisMonth += row.amountUsd;
    if (periodDate >= twelveMoAgo) trailing12m += row.amountUsd;
  }

  return {
    last30d: round2(last30d),
    thisMonth: round2(thisMonth),
    trailing12m: round2(trailing12m),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
