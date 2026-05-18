/**
 * Cost Relay state machine — per packet §5.1.
 *
 * Six terminal states per provider per lane:
 *   - LIVE            — fresh successful snapshot, no error
 *   - STALE           — snapshot present but past freshness window
 *   - DEGRADED        — no fresh snapshot, but relay attempted recently
 *   - BROKEN_AUTH     — last error indicates auth failure (401/403/oauth)
 *   - BROKEN_SCHEMA   — last error indicates payload/parse failure
 *   - NOT_CONFIGURED  — relay has never attempted ingest
 *
 * Thresholds (overridable for tests):
 *   - liveWindowMs    : how long after lastSuccess a snapshot counts as LIVE
 *   - staleWindowMs   : after which DEGRADED/BROKEN takes priority over STALE
 *   - attemptWindowMs : how long a recent failing attempt keeps the lane DEGRADED
 */

import type { RelayLastError, RelayState } from './types';

export interface ResolveStateInput {
  /** ISO 8601 timestamp of the most recent successful ingest, if any. */
  lastSuccess: string | null;
  /** ISO 8601 timestamp of the most recent ingest attempt (success or failure). */
  lastAttempt: string | null;
  /** Most recent error encountered by this lane, if any. */
  lastError: RelayLastError | null;
  /** Whether a snapshot payload is currently held in cache or sheet. */
  snapshotPresent: boolean;
}

export interface ResolveStateOptions {
  /** Default: 3 × cadence for usage (60s) → 180s. Callers pass per-lane value. */
  liveWindowMs?: number;
  /** Default: 4 × liveWindowMs. */
  staleWindowMs?: number;
  /** Default: 15 minutes — how long a failing attempt keeps us DEGRADED vs. NOT_CONFIGURED. */
  attemptWindowMs?: number;
  /** Injectable clock for tests. */
  now?: Date;
}

const DEFAULT_LIVE_WINDOW_MS = 3 * 60 * 1000;
const DEFAULT_STALE_WINDOW_MS = 4 * DEFAULT_LIVE_WINDOW_MS;
const DEFAULT_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export function resolveState(
  input: ResolveStateInput,
  options: ResolveStateOptions = {},
): RelayState {
  const now = options.now || new Date();
  const liveWindowMs = options.liveWindowMs ?? DEFAULT_LIVE_WINDOW_MS;
  const staleWindowMs = options.staleWindowMs ?? Math.max(liveWindowMs * 4, DEFAULT_STALE_WINDOW_MS);
  const attemptWindowMs = options.attemptWindowMs ?? DEFAULT_ATTEMPT_WINDOW_MS;

  // Never attempted — no env wired, no script running.
  if (!input.lastAttempt && !input.lastSuccess && !input.lastError && !input.snapshotPresent) {
    return 'NOT_CONFIGURED';
  }

  const successAgeMs = ageMs(input.lastSuccess, now);
  const attemptAgeMs = ageMs(input.lastAttempt, now);

  const hasFreshSuccess = successAgeMs !== null && successAgeMs <= liveWindowMs;
  const hasStaleSuccess = successAgeMs !== null && successAgeMs <= staleWindowMs;
  const recentAttempt = attemptAgeMs !== null && attemptAgeMs <= attemptWindowMs;

  // A fresh successful snapshot dominates everything — operator sees LIVE.
  if (hasFreshSuccess && input.snapshotPresent) {
    return 'LIVE';
  }

  // Broken states surface when the most recent attempt failed AND we are
  // outside the LIVE window. Auth and schema beat plain DEGRADED so the
  // operator gets an actionable surface.
  if (input.lastError && !hasFreshSuccess) {
    const errorAgeMs = ageMs(input.lastError.at, now);
    const errorIsRecent = errorAgeMs !== null && errorAgeMs <= attemptWindowMs;
    if (errorIsRecent) {
      if (input.lastError.kind === 'auth') return 'BROKEN_AUTH';
      if (input.lastError.kind === 'schema') return 'BROKEN_SCHEMA';
    }
  }

  // Snapshot is older than fresh but inside the stale window — operator sees
  // a degraded-but-readable instrument.
  if (hasStaleSuccess && input.snapshotPresent) {
    return 'STALE';
  }

  // Relay is still attempting (cron is running) but isn't producing fresh
  // snapshots and no broken error has surfaced — call it DEGRADED.
  if (recentAttempt) {
    return 'DEGRADED';
  }

  // Anything older than attemptWindowMs with no recent error → treat as
  // not configured so we don't show a stale gauge masquerading as live.
  return 'NOT_CONFIGURED';
}

function ageMs(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return now.getTime() - t;
}

/**
 * Returns true when this state should trigger a Linear auto-file.
 * Auto-file only fires on BROKEN_AUTH and BROKEN_SCHEMA per packet §5.2.
 */
export function shouldAutoFileLinear(state: RelayState): state is 'BROKEN_AUTH' | 'BROKEN_SCHEMA' {
  return state === 'BROKEN_AUTH' || state === 'BROKEN_SCHEMA';
}
