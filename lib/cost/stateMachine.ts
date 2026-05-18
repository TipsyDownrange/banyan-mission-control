/**
 * Cost & Usage v2 — pure state machine per packet §5.1.
 *
 * Resolves a cost source's display state from its last attempt/success/error.
 * Pure function: no I/O, deterministic, fully unit-testable.
 *
 *   LIVE             snapshot present, fresh, no errors
 *   STALE            snapshot present but past freshness threshold
 *   DEGRADED         snapshot present + recent intermittent error
 *   BROKEN_AUTH      auth-shaped failure (401/403/missing-credentials)
 *   BROKEN_SCHEMA    schema/parse failure
 *   NOT_CONFIGURED   no snapshot, no error history — not wired up yet
 */

export type CostSourceState =
  | 'LIVE'
  | 'STALE'
  | 'DEGRADED'
  | 'BROKEN_AUTH'
  | 'BROKEN_SCHEMA'
  | 'NOT_CONFIGURED';

export type CostErrorKind = 'auth' | 'schema' | 'transient' | null;

export interface StateMachineInput {
  /** ISO timestamp of last successful fetch (snapshot present). */
  lastSuccess: string | null;
  /** ISO timestamp of last attempt (success or failure). */
  lastAttempt: string | null;
  /** Classified last error, or null if last attempt succeeded. */
  lastError: CostErrorKind;
  /** Whether a snapshot is currently cached and within TTL. */
  snapshotPresent: boolean;
  /** Reference "now" for freshness math. */
  now?: Date;
  /** Freshness threshold for LIVE vs STALE in seconds. Defaults to 300 (5min). */
  freshnessThresholdSec?: number;
}

const DEFAULT_FRESHNESS_SEC = 300;

export function resolveState(input: StateMachineInput): CostSourceState {
  const { lastSuccess, lastAttempt, lastError, snapshotPresent } = input;
  const now = input.now || new Date();
  const threshold = input.freshnessThresholdSec ?? DEFAULT_FRESHNESS_SEC;

  if (lastError === 'auth') return 'BROKEN_AUTH';
  if (lastError === 'schema') return 'BROKEN_SCHEMA';

  if (!lastAttempt && !lastSuccess && !snapshotPresent) return 'NOT_CONFIGURED';

  if (snapshotPresent && lastSuccess) {
    const ageSec = (now.getTime() - Date.parse(lastSuccess)) / 1000;
    if (Number.isFinite(ageSec) && ageSec <= threshold) {
      if (lastError === 'transient') return 'DEGRADED';
      return 'LIVE';
    }
    return 'STALE';
  }

  if (lastSuccess && !snapshotPresent) return 'STALE';

  if (lastError === 'transient') return 'DEGRADED';

  return 'NOT_CONFIGURED';
}
