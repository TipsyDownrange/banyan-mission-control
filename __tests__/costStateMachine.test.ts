/**
 * BAN-319 — Cost & Usage v2 — pure state machine transitions.
 */

import { resolveState, type StateMachineInput } from '@/lib/cost/stateMachine';

const NOW = new Date('2026-05-18T12:00:00.000Z');

function input(overrides: Partial<StateMachineInput>): StateMachineInput {
  return {
    lastSuccess: null,
    lastAttempt: null,
    lastError: null,
    snapshotPresent: false,
    now: NOW,
    ...overrides,
  };
}

describe('cost source state machine', () => {
  it('NOT_CONFIGURED when nothing has happened', () => {
    expect(resolveState(input({}))).toBe('NOT_CONFIGURED');
  });

  it('LIVE when fresh snapshot present', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:59:30.000Z',
      lastAttempt: '2026-05-18T11:59:30.000Z',
    }))).toBe('LIVE');
  });

  it('STALE when snapshot is older than freshness threshold', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:50:00.000Z',
      lastAttempt: '2026-05-18T11:50:00.000Z',
    }))).toBe('STALE');
  });

  it('STALE when lastSuccess exists but snapshot is no longer in cache', () => {
    expect(resolveState(input({
      snapshotPresent: false,
      lastSuccess: '2026-05-18T11:59:00.000Z',
      lastAttempt: '2026-05-18T11:59:00.000Z',
    }))).toBe('STALE');
  });

  it('DEGRADED when snapshot fresh but last attempt had a transient error', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:59:30.000Z',
      lastAttempt: '2026-05-18T11:59:50.000Z',
      lastError: 'transient',
    }))).toBe('DEGRADED');
  });

  it('BROKEN_AUTH overrides everything else', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:59:30.000Z',
      lastAttempt: '2026-05-18T11:59:50.000Z',
      lastError: 'auth',
    }))).toBe('BROKEN_AUTH');
  });

  it('BROKEN_SCHEMA overrides everything else', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:59:30.000Z',
      lastAttempt: '2026-05-18T11:59:50.000Z',
      lastError: 'schema',
    }))).toBe('BROKEN_SCHEMA');
  });

  it('DEGRADED when transient error but no successful snapshot', () => {
    expect(resolveState(input({
      lastAttempt: '2026-05-18T11:59:30.000Z',
      lastError: 'transient',
    }))).toBe('DEGRADED');
  });

  it('honors custom freshness threshold', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:59:00.000Z',
      lastAttempt: '2026-05-18T11:59:00.000Z',
      freshnessThresholdSec: 30,
    }))).toBe('STALE');
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:59:50.000Z',
      lastAttempt: '2026-05-18T11:59:50.000Z',
      freshnessThresholdSec: 30,
    }))).toBe('LIVE');
  });

  it('handles boundary at exactly the freshness threshold', () => {
    expect(resolveState(input({
      snapshotPresent: true,
      lastSuccess: '2026-05-18T11:55:00.000Z',
      lastAttempt: '2026-05-18T11:55:00.000Z',
    }))).toBe('LIVE');
  });
});
