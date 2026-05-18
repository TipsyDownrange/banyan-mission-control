/**
 * Cost & Usage v2 — Banyan_AISpend reader + window aggregation.
 *
 * Kai's gmail_spend_scrub.sh populates Banyan_AISpend with one row per
 * billed subscription invoice. This module reads those rows and rolls
 * them into trailing windows for the War Room "Billed to Date" strip.
 *
 * Schema (Kai-side):
 *   A date | B provider | C plan | D period_start | E period_end |
 *   F amount_usd | G source_email_id | H source_email_subject | I ingested_at
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import type { AggregatedBilled } from './types';

const AI_SPEND_TAB = 'Banyan_AISpend';

interface AiSpendRow {
  date: string;
  provider: string;
  plan: string;
  amountUsd: number;
}

export async function readAiSpendRows(): Promise<AiSpendRow[]> {
  const sheetId = getBackendSheetId();
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values
    .get({ spreadsheetId: sheetId, range: `${AI_SPEND_TAB}!A2:F` })
    .catch((err: unknown) => {
      console.warn('[aiSpendReconciliation] read failed:', err instanceof Error ? err.message : String(err));
      return { data: { values: [] as string[][] } };
    });

  const rows = (res.data.values || []) as string[][];
  return rows
    .filter(r => r[0] && r[5])
    .map(r => ({
      date: String(r[0]),
      provider: String(r[1] || ''),
      plan: String(r[2] || ''),
      amountUsd: parseFloat(r[5]) || 0,
    }))
    .filter(r => Number.isFinite(r.amountUsd) && r.amountUsd >= 0);
}

export function aggregateBilled(rows: AiSpendRow[], now: Date = new Date()): AggregatedBilled {
  const nowMs = now.getTime();
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const ms12mo = 365 * 24 * 60 * 60 * 1000;

  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  let last30d = 0;
  let thisMonth = 0;
  let trailing12mo = 0;

  for (const row of rows) {
    const t = Date.parse(row.date);
    if (!Number.isFinite(t)) continue;
    const ageMs = nowMs - t;
    if (ageMs <= ms30d && ageMs >= 0) last30d += row.amountUsd;
    if (row.date.startsWith(ym)) thisMonth += row.amountUsd;
    if (ageMs <= ms12mo && ageMs >= 0) trailing12mo += row.amountUsd;
  }

  return {
    last30d: round2(last30d),
    thisMonth: round2(thisMonth),
    trailing12mo: round2(trailing12mo),
    asOf: now.toISOString(),
  };
}

export async function buildAggregatedBilled(now: Date = new Date()): Promise<AggregatedBilled> {
  try {
    const rows = await readAiSpendRows();
    return aggregateBilled(rows, now);
  } catch (err) {
    console.warn('[aiSpendReconciliation] aggregate failed:', err instanceof Error ? err.message : String(err));
    return { last30d: 0, thisMonth: 0, trailing12mo: 0, asOf: now.toISOString() };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
