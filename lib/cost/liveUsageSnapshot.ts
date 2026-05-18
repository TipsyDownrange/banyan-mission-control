/**
 * Cost & Usage Phase 1 v2 — Usage lane cache + persistence.
 *
 * Per-provider in-memory cache (5-min TTL) for current-window UsageSnapshots
 * pushed by the OAuth cloud relay (Kai on Mac mini). Each successful ingest
 * also appends to Banyan_CostSnapshot for history.
 *
 * Reads are synchronous (used by /api/cost GET path); writes fire-and-forget
 * sheet persistence so a transient Sheets blip never breaks ingest.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import { ensureSheetTab } from './ensureSheetTab';
import type { CostProvider, RelayLastError, UsageSnapshot } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_TAB = 'Banyan_CostSnapshot';

const SNAPSHOT_HEADER = [
  'capturedAt', 'storedAt', 'provider', 'snapshotType',
  'sessionPct', 'weeklyPct', 'designPct',
  'extraUsed', 'extraLimit',
  'resetSessionAt', 'resetWeeklyAt',
  'sourceApp', 'payloadJson',
];

interface CachedUsage {
  snapshot: UsageSnapshot;
  storedAt: Date;
  lastAttemptAt: Date;
  lastError: RelayLastError | null;
}

const cache = new Map<CostProvider, CachedUsage>();
const attemptLog = new Map<CostProvider, { lastAttemptAt: Date; lastError: RelayLastError | null }>();

export interface LatestUsageSnapshot {
  snapshot: UsageSnapshot;
  storedAt: string;
  ageSeconds: number;
  lastAttemptAt: string;
  lastError: RelayLastError | null;
}

export function readLatestUsageSnapshot(
  provider: CostProvider,
  now: Date = new Date(),
): LatestUsageSnapshot | null {
  const entry = cache.get(provider);
  if (!entry) return null;
  const ageMs = now.getTime() - entry.storedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null;
  return {
    snapshot: entry.snapshot,
    storedAt: entry.storedAt.toISOString(),
    ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
    lastAttemptAt: entry.lastAttemptAt.toISOString(),
    lastError: entry.lastError,
  };
}

export interface UsageAttemptStatus {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: RelayLastError | null;
  snapshotPresent: boolean;
}

export function getUsageAttemptStatus(provider: CostProvider): UsageAttemptStatus {
  const entry = cache.get(provider);
  const log = attemptLog.get(provider);
  return {
    lastAttemptAt: log?.lastAttemptAt.toISOString() ?? entry?.lastAttemptAt.toISOString() ?? null,
    lastSuccessAt: entry?.storedAt.toISOString() ?? null,
    lastError: log?.lastError ?? entry?.lastError ?? null,
    snapshotPresent: Boolean(entry),
  };
}

export interface WriteUsageResult {
  storedAt: string;
  sheetPersistAttempted: boolean;
}

export async function writeUsageSnapshot(
  snapshot: UsageSnapshot,
  now: Date = new Date(),
): Promise<WriteUsageResult> {
  cache.set(snapshot.provider, {
    snapshot,
    storedAt: now,
    lastAttemptAt: now,
    lastError: null,
  });
  attemptLog.set(snapshot.provider, { lastAttemptAt: now, lastError: null });

  let sheetPersistAttempted = false;
  try {
    await persistUsageSnapshot(snapshot, now);
    sheetPersistAttempted = true;
  } catch (err) {
    sheetPersistAttempted = true;
    console.warn('[liveUsageSnapshot] sheet persistence failed (cache still updated):',
      err instanceof Error ? err.message : String(err));
  }

  return { storedAt: now.toISOString(), sheetPersistAttempted };
}

export function recordUsageError(provider: CostProvider, error: RelayLastError): void {
  attemptLog.set(provider, { lastAttemptAt: new Date(error.at), lastError: error });
}

export function __resetUsageSnapshotCacheForTests(): void {
  cache.clear();
  attemptLog.clear();
}

async function persistUsageSnapshot(snapshot: UsageSnapshot, storedAt: Date): Promise<void> {
  const sheetId = getBackendSheetId();
  await ensureSheetTab(sheetId, SNAPSHOT_TAB, SNAPSHOT_HEADER);

  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    snapshot.fetchedAt,
    storedAt.toISOString(),
    snapshot.provider,
    'usage',
    snapshot.currentSession.pct,
    snapshot.weeklyLimit.pct,
    snapshot.claudeDesign?.pct ?? '',
    snapshot.extraUsage?.used ?? '',
    snapshot.extraUsage?.limit ?? '',
    snapshot.currentSession.resetsAt ?? '',
    snapshot.weeklyLimit.resetsAt ?? '',
    snapshot.sourceApp,
    JSON.stringify(snapshot),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SNAPSHOT_TAB}!A:M`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
