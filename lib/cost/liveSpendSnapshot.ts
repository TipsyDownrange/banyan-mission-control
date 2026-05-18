/**
 * Cost & Usage Phase 1 v2 — Spend lane cache + persistence.
 *
 * Per-(provider, scope) in-memory cache for Admin-API-derived $ rollups
 * (today / week / month), 5-minute cron from Kai. Each successful ingest
 * also appends to Banyan_AISpend for the reconciliation aggregator.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { ensureSheetTab } from './ensureSheetTab';
import type { ApiSpendScope, ApiSpendSnapshot, CostProvider, RelayLastError } from './types';

const CACHE_TTL_MS = 15 * 60 * 1000;
const SPEND_TAB = 'Banyan_AISpend';

const SPEND_HEADER = ['fetchedAt', 'storedAt', 'provider', 'scope', 'amountUsd', 'payloadJson'];

type CacheKey = `${CostProvider}::${ApiSpendScope}`;

interface CachedSpend {
  snapshot: ApiSpendSnapshot;
  storedAt: Date;
  lastError: RelayLastError | null;
}

const cache = new Map<CacheKey, CachedSpend>();
const attemptLog = new Map<CostProvider, { lastAttemptAt: Date; lastError: RelayLastError | null }>();

export interface LatestSpendSnapshot {
  snapshot: ApiSpendSnapshot;
  storedAt: string;
  ageSeconds: number;
  lastError: RelayLastError | null;
}

export function readLatestSpendSnapshot(
  provider: CostProvider,
  scope: ApiSpendScope,
  now: Date = new Date(),
): LatestSpendSnapshot | null {
  const entry = cache.get(`${provider}::${scope}`);
  if (!entry) return null;
  const ageMs = now.getTime() - entry.storedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null;
  return {
    snapshot: entry.snapshot,
    storedAt: entry.storedAt.toISOString(),
    ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
    lastError: entry.lastError,
  };
}

export interface SpendAttemptStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: RelayLastError | null;
  snapshotPresent: boolean;
}

export function getSpendAttemptStatus(provider: CostProvider): SpendAttemptStatus {
  const log = attemptLog.get(provider);
  const anyScope = (['today', 'week', 'month'] as ApiSpendScope[])
    .map(s => cache.get(`${provider}::${s}`))
    .find(Boolean);
  return {
    lastAttemptAt: log?.lastAttemptAt.toISOString() ?? anyScope?.storedAt.toISOString() ?? null,
    lastSuccessAt: anyScope?.storedAt.toISOString() ?? null,
    lastError: log?.lastError ?? anyScope?.lastError ?? null,
    snapshotPresent: Boolean(anyScope),
  };
}

export interface WriteSpendResult {
  storedAt: string;
  sheetPersistAttempted: boolean;
}

export async function writeSpendSnapshot(
  snapshot: ApiSpendSnapshot,
  now: Date = new Date(),
): Promise<WriteSpendResult> {
  cache.set(`${snapshot.provider}::${snapshot.scope}`, {
    snapshot,
    storedAt: now,
    lastError: null,
  });
  attemptLog.set(snapshot.provider, { lastAttemptAt: now, lastError: null });

  let sheetPersistAttempted = false;
  try {
    await persistSpendSnapshot(snapshot, now);
    sheetPersistAttempted = true;
  } catch (err) {
    sheetPersistAttempted = true;
    console.warn('[liveSpendSnapshot] sheet persistence failed (cache still updated):',
      err instanceof Error ? err.message : String(err));
  }

  return { storedAt: now.toISOString(), sheetPersistAttempted };
}

export function recordSpendError(provider: CostProvider, error: RelayLastError): void {
  attemptLog.set(provider, { lastAttemptAt: new Date(error.at), lastError: error });
}

export function __resetSpendSnapshotCacheForTests(): void {
  cache.clear();
  attemptLog.clear();
}

async function persistSpendSnapshot(snapshot: ApiSpendSnapshot, storedAt: Date): Promise<void> {
  const sheetId = getBackendSheetId();
  await ensureSheetTab(sheetId, SPEND_TAB, SPEND_HEADER);

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    snapshot.fetchedAt,
    storedAt.toISOString(),
    snapshot.provider,
    snapshot.scope,
    snapshot.amountUsd,
    JSON.stringify(snapshot),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SPEND_TAB}!A:F`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
