/**
 * Cost & Usage Phase 1 v2 — Billed lane cache + persistence.
 *
 * Receipt-derived $ totals from Gmail scrub (Kai, 4hr cron + backfill).
 * Dedupe key is the Gmail message id. Each accepted receipt appends to
 * Banyan_CostRelayLog for audit + period-aggregation.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { ensureSheetTab } from './ensureSheetTab';
import type { BilledSnapshot, CostProvider, RelayLastError } from './types';

const BILLED_TAB = 'Banyan_CostRelayLog';

const BILLED_HEADER = ['fetchedAt', 'storedAt', 'provider', 'period', 'amountUsd', 'emailId', 'payloadJson'];

const seenEmails = new Map<CostProvider, Set<string>>();
const attemptLog = new Map<CostProvider, { lastAttemptAt: Date; lastError: RelayLastError | null }>();

export interface BilledAttemptStatus {
  lastAttemptAt: string | null;
  lastError: RelayLastError | null;
}

export function getBilledAttemptStatus(provider: CostProvider): BilledAttemptStatus {
  const log = attemptLog.get(provider);
  return {
    lastAttemptAt: log?.lastAttemptAt.toISOString() ?? null,
    lastError: log?.lastError ?? null,
  };
}

export interface WriteBilledResult {
  storedAt: string;
  sheetPersistAttempted: boolean;
  /** True when emailId was already recorded — receipt was a no-op. */
  duplicate: boolean;
}

export async function writeBilledSnapshot(
  snapshot: BilledSnapshot,
  now: Date = new Date(),
): Promise<WriteBilledResult> {
  attemptLog.set(snapshot.provider, { lastAttemptAt: now, lastError: null });

  const seen = seenEmails.get(snapshot.provider) || new Set<string>();
  if (seen.has(snapshot.emailId)) {
    return { storedAt: now.toISOString(), sheetPersistAttempted: false, duplicate: true };
  }
  seen.add(snapshot.emailId);
  seenEmails.set(snapshot.provider, seen);

  let sheetPersistAttempted = false;
  try {
    await persistBilledSnapshot(snapshot, now);
    sheetPersistAttempted = true;
  } catch (err) {
    sheetPersistAttempted = true;
    console.warn('[liveBilledSnapshot] sheet persistence failed (dedupe still applied):',
      err instanceof Error ? err.message : String(err));
  }

  return { storedAt: now.toISOString(), sheetPersistAttempted, duplicate: false };
}

export function recordBilledError(provider: CostProvider, error: RelayLastError): void {
  attemptLog.set(provider, { lastAttemptAt: new Date(error.at), lastError: error });
}

export function __resetBilledSnapshotCacheForTests(): void {
  seenEmails.clear();
  attemptLog.clear();
}

async function persistBilledSnapshot(snapshot: BilledSnapshot, storedAt: Date): Promise<void> {
  const sheetId = getBackendSheetId();
  await ensureSheetTab(sheetId, BILLED_TAB, BILLED_HEADER);

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    snapshot.fetchedAt,
    storedAt.toISOString(),
    snapshot.provider,
    snapshot.period,
    snapshot.amountUsd,
    snapshot.emailId,
    JSON.stringify(snapshot),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${BILLED_TAB}!A:G`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
