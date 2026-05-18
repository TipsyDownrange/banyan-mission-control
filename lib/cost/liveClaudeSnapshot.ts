/**
 * Cost & Usage Live Tracking — Phase 1 (v1 alias retained for v2).
 *
 * In-memory cache + best-effort sheet persistence for the live Claude
 * subscription/usage snapshot. v2 adds a dedicated per-provider usage cache
 * in liveUsageSnapshot.ts; this module continues to serve v1 callers that
 * read liveClaudeSession from /api/cost.
 *
 * - Read path (readLatestLiveClaudeSnapshot) is synchronous and serves the
 *   War Room without blocking on Sheets I/O.
 * - Write path (writeLiveClaudeSnapshot) updates the cache immediately and
 *   fires-and-forgets the sheet append. Sheet failure must not break ingest.
 * - Cache TTL is 5 minutes; older snapshots are treated as "not connected".
 */

import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';
import { getBackendSheetId } from '@/lib/backend-config';
import type { LiveClaudeSnapshot } from './types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_TAB = 'Banyan_CostSnapshot';

interface CachedSnapshot {
  snapshot: LiveClaudeSnapshot;
  storedAt: Date;
}

let cached: CachedSnapshot | null = null;

export interface LatestLiveClaudeSnapshot {
  snapshot: LiveClaudeSnapshot;
  storedAt: string;
  ageSeconds: number;
}

export function readLatestLiveClaudeSnapshot(now: Date = new Date()): LatestLiveClaudeSnapshot | null {
  if (!cached) return null;
  const ageMs = now.getTime() - cached.storedAt.getTime();
  if (ageMs > CACHE_TTL_MS) return null;
  return {
    snapshot: cached.snapshot,
    storedAt: cached.storedAt.toISOString(),
    ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
  };
}

export interface WriteResult {
  storedAt: string;
  sheetPersistAttempted: boolean;
}

export async function writeLiveClaudeSnapshot(snapshot: LiveClaudeSnapshot, now: Date = new Date()): Promise<WriteResult> {
  cached = { snapshot, storedAt: now };

  let sheetPersistAttempted = false;
  try {
    await persistSnapshotToSheet(snapshot, now);
    sheetPersistAttempted = true;
  } catch (err) {
    sheetPersistAttempted = true;
    console.warn('[liveClaudeSnapshot] sheet persistence failed (cache still updated):', err instanceof Error ? err.message : String(err));
  }

  return {
    storedAt: now.toISOString(),
    sheetPersistAttempted,
  };
}

export function __resetLiveClaudeSnapshotCacheForTests(): void {
  cached = null;
}

async function persistSnapshotToSheet(snapshot: LiveClaudeSnapshot, storedAt: Date): Promise<void> {
  const sheetId = getBackendSheetId();
  const auth = getGoogleAuth(['https://www.googleapis.com/auth/spreadsheets']);
  const sheets = google.sheets({ version: 'v4', auth });

  const row = [
    snapshot.capturedAt,
    storedAt.toISOString(),
    snapshot.sessionPct,
    snapshot.weeklyPct,
    snapshot.opusPct ?? '',
    snapshot.extraUsageDollars?.used ?? '',
    snapshot.extraUsageDollars?.limit ?? '',
    snapshot.resetSessionAt ?? '',
    snapshot.resetWeeklyAt ?? '',
    snapshot.sourceApp,
    JSON.stringify(snapshot),
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${SNAPSHOT_TAB}!A:K`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}
