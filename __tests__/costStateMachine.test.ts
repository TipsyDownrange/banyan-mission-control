/**
 * Cost & Usage Phase 1 v2 — state machine tests.
 *
 * Covers all six transitions per packet §5.1:
 *   LIVE / STALE / DEGRADED / BROKEN_AUTH / BROKEN_SCHEMA / NOT_CONFIGURED
 */

import { resolveState, shouldAutoFileLinear } from '@/lib/cost/stateMachine';
import type { RelayLastError } from '@/lib/cost/types';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

function authError(at: string): RelayLastError {
  return { kind: 'auth', message: 'OAuth token expired', httpStatus: 401, at };
}

function schemaError(at: string): RelayLastError {
  return { kind: 'schema', message: 'unexpected field shape', at };
}

describe('resolveState', () => {
  it('returns NOT_CONFIGURED when relay has never attempted', () => {
    expect(resolveState({
      lastSuccess: null,
      lastAttempt: null,
      lastError: null,
      snapshotPresent: false,
    }, { now: NOW })).toBe('NOT_CONFIGURED');
  });

  it('returns LIVE when a fresh snapshot is present', () => {
    expect(resolveState({
      lastSuccess: iso(-30_000), // 30s ago
      lastAttempt: iso(-30_000),
      lastError: null,
      snapshotPresent: true,
    }, { now: NOW })).toBe('LIVE');
  });

  it('returns STALE when snapshot is past live window but inside stale window', () => {
    expect(resolveState({
      lastSuccess: iso(-5 * 60_000), // 5min ago, live window is 3min
      lastAttempt: iso(-5 * 60_000),
      lastError: null,
      snapshotPresent: true,
    }, { now: NOW })).toBe('STALE');
  });

  it('returns DEGRADED when no fresh snapshot but relay attempted recently', () => {
    expect(resolveState({
      lastSuccess: null,
      lastAttempt: iso(-2 * 60_000), // 2min ago
      lastError: null,
      snapshotPresent: false,
    }, { now: NOW })).toBe('DEGRADED');
  });

  it('returns BROKEN_AUTH when recent error is auth-related', () => {
    expect(resolveState({
      lastSuccess: iso(-60 * 60_000), // 1h ago — outside live window
      lastAttempt: iso(-60_000),
      lastError: authError(iso(-60_000)),
      snapshotPresent: true,
    }, { now: NOW })).toBe('BROKEN_AUTH');
  });

  it('returns BROKEN_SCHEMA when recent error is schema-related', () => {
    expect(resolveState({
      lastSuccess: null,
      lastAttempt: iso(-60_000),
      lastError: schemaError(iso(-60_000)),
      snapshotPresent: false,
    }, { now: NOW })).toBe('BROKEN_SCHEMA');
  });

  it('prefers LIVE over BROKEN_AUTH when a fresh snapshot is present', () => {
    // Edge case: auth blip happened but a fresh snapshot followed.
    expect(resolveState({
      lastSuccess: iso(-30_000),
      lastAttempt: iso(-30_000),
      lastError: authError(iso(-2 * 60_000)),
      snapshotPresent: true,
    }, { now: NOW })).toBe('LIVE');
  });

  it('falls back to NOT_CONFIGURED when last attempt is far past attemptWindow', () => {
    expect(resolveState({
      lastSuccess: null,
      lastAttempt: iso(-60 * 60_000), // 1h ago, attempt window is 15min
      lastError: null,
      snapshotPresent: false,
    }, { now: NOW })).toBe('NOT_CONFIGURED');
  });

  it('does not surface a stale auth error as BROKEN_AUTH', () => {
    // Error happened 1h ago, no recent attempt → not actionable as broken.
    expect(resolveState({
      lastSuccess: null,
      lastAttempt: iso(-60 * 60_000),
      lastError: authError(iso(-60 * 60_000)),
      snapshotPresent: false,
    }, { now: NOW })).toBe('NOT_CONFIGURED');
  });

  it('respects custom live/stale windows for lanes with different cadence', () => {
    // Spend lane has 5min cron — liveWindowMs should be ~15min.
    const fifteenMin = 15 * 60_000;
    expect(resolveState({
      lastSuccess: iso(-10 * 60_000),
      lastAttempt: iso(-10 * 60_000),
      lastError: null,
      snapshotPresent: true,
    }, { now: NOW, liveWindowMs: fifteenMin })).toBe('LIVE');
  });
});

describe('shouldAutoFileLinear', () => {
  it('returns true only for BROKEN_AUTH and BROKEN_SCHEMA', () => {
    expect(shouldAutoFileLinear('BROKEN_AUTH')).toBe(true);
    expect(shouldAutoFileLinear('BROKEN_SCHEMA')).toBe(true);
    expect(shouldAutoFileLinear('LIVE')).toBe(false);
    expect(shouldAutoFileLinear('STALE')).toBe(false);
    expect(shouldAutoFileLinear('DEGRADED')).toBe(false);
    expect(shouldAutoFileLinear('NOT_CONFIGURED')).toBe(false);
  });
});
