/**
 * Cost & Usage v2 — in-memory cache + best-effort sheet persistence for
 * UsageSnapshot (live subscription utilization, per provider). 5-min TTL.
 *
 * Sheet: Banyan_CostSnapshot. v1 schema is preserved; v2 rows carry the
 * additional snapshot_type and provider columns so legacy reads still work.
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import type { CostProvider, UsageSnapshot } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_TAB = 'Banyan_CostSnapshot';

interface Cached {
  snapshot: UsageSnapshot;
  storedAt: Date;
}

const cache = new Map<CostProvider, Cached>();

export interface LatestUsageSnapshot {
  snapshot: UsageSnapshot;
  storedAt: string;
  ageSeconds: number;
}

export function readLatestUsageSnapshot(provider: CostProvider, now: Date = new Date()): LatestUsageSnapshot | null {
  const entry = cache.get(provider);
  if (!entry) return null;
  const ageMs = now.getTime() - entry.storedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null;
  return {
    snapshot: entry.snapshot,
    storedAt: entry.storedAt.toISOString(),
    ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
  };
}

export function readAllLatestUsage(now: Date = new Date()): LatestUsageSnapshot[] {
  const out: LatestUsageSnapshot[] = [];
  for (const provider of cache.keys()) {
    const latest = readLatestUsageSnapshot(provider, now);
    if (latest) out.push(latest);
  }
  return out;
}

export interface WriteUsageResult {
  storedAt: string;
  sheetPersistAttempted: boolean;
}

export async function writeUsageSnapshot(snapshot: UsageSnapshot, now: Date = new Date()): Promise<WriteUsageResult> {
  cache.set(snapshot.provider, { snapshot, storedAt: now });

  let sheetPersistAttempted = false;
  try {
    await persistToSheet(snapshot, now);
    sheetPersistAttempted = true;
  } catch (err) {
    sheetPersistAttempted = true;
    console.warn('[liveUsageSnapshot] sheet persistence failed:', err instanceof Error ? err.message : String(err));
  }

  return { storedAt: now.toISOString(), sheetPersistAttempted };
}

export function __resetUsageSnapshotCacheForTests(): void {
  cache.clear();
}

async function persistToSheet(snapshot: UsageSnapshot, storedAt: Date): Promise<void> {
  const sheetId = getBackendSheetId();
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    snapshot.fetchedAt,
    storedAt.toISOString(),
    snapshot.currentSession.percentage,
    snapshot.weeklyLimit.percentage,
    snapshot.claudeDesign?.percentage ?? '',
    snapshot.extraUsage?.usedUsd ?? '',
    snapshot.extraUsage?.budgetUsd ?? '',
    snapshot.currentSession.resetsAt ?? '',
    snapshot.weeklyLimit.resetsAt ?? '',
    `usage:${snapshot.provider}`,
    JSON.stringify(snapshot),
    'usage',
    snapshot.provider,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SNAPSHOT_TAB}!A:M`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
