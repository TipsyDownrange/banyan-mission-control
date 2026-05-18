/**
 * Cost & Usage v2 — in-memory cache + best-effort sheet persistence for
 * ApiSpendSnapshot (cumulative API dollar spend, per provider per scope).
 * 5-min TTL. Six possible entries: {anthropic,openai} x {today,week,month}.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import type { ApiSpendSnapshot, CostProvider, SpendScope } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_TAB = 'Banyan_CostSnapshot';

type CacheKey = `${CostProvider}:${SpendScope}`;

interface Cached {
  snapshot: ApiSpendSnapshot;
  storedAt: Date;
}

const cache = new Map<CacheKey, Cached>();

export interface LatestSpendSnapshot {
  snapshot: ApiSpendSnapshot;
  storedAt: string;
  ageSeconds: number;
}

function keyOf(provider: CostProvider, scope: SpendScope): CacheKey {
  return `${provider}:${scope}`;
}

export function readLatestSpendSnapshot(
  provider: CostProvider,
  scope: SpendScope,
  now: Date = new Date(),
): LatestSpendSnapshot | null {
  const entry = cache.get(keyOf(provider, scope));
  if (!entry) return null;
  const ageMs = now.getTime() - entry.storedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null;
  return {
    snapshot: entry.snapshot,
    storedAt: entry.storedAt.toISOString(),
    ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
  };
}

export function readAllLatestSpend(now: Date = new Date()): LatestSpendSnapshot[] {
  const out: LatestSpendSnapshot[] = [];
  for (const [, entry] of cache) {
    const ageMs = now.getTime() - entry.storedAt.getTime();
    if (ageMs <= CACHE_TTL_MS) {
      out.push({
        snapshot: entry.snapshot,
        storedAt: entry.storedAt.toISOString(),
        ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
      });
    }
  }
  return out;
}

export interface WriteSpendResult {
  storedAt: string;
  sheetPersistAttempted: boolean;
}

export async function writeSpendSnapshot(snapshot: ApiSpendSnapshot, now: Date = new Date()): Promise<WriteSpendResult> {
  cache.set(keyOf(snapshot.provider, snapshot.scope), { snapshot, storedAt: now });

  let sheetPersistAttempted = false;
  try {
    await persistToSheet(snapshot, now);
    sheetPersistAttempted = true;
  } catch (err) {
    sheetPersistAttempted = true;
    console.warn('[liveSpendSnapshot] sheet persistence failed:', err instanceof Error ? err.message : String(err));
  }

  return { storedAt: now.toISOString(), sheetPersistAttempted };
}

export function __resetSpendSnapshotCacheForTests(): void {
  cache.clear();
}

async function persistToSheet(snapshot: ApiSpendSnapshot, storedAt: Date): Promise<void> {
  const sheetId = getBackendSheetId();
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    snapshot.fetchedAt,
    storedAt.toISOString(),
    '',
    '',
    '',
    snapshot.amountUsd,
    '',
    '',
    '',
    `spend:${snapshot.provider}:${snapshot.scope}`,
    JSON.stringify(snapshot),
    'spend',
    snapshot.provider,
    snapshot.scope,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SNAPSHOT_TAB}!A:N`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
