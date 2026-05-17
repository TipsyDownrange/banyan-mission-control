/**
 * BAN-309 Pass 3a.2 — Unit tests for the canonical Postgres Activity Spine
 * emission helper at lib/activity-spine/emit.ts.
 *
 * The helper is tx-scoped and throws on failure, by design opposite of
 * lib/events.ts:emitMCEvent. Tests use a fake Drizzle tx to verify
 * INSERT shape, validation gates, and error propagation.
 */

jest.mock('@/db', () => ({
  db: {} as Record<string, unknown>,
  field_events: { _name: 'field_events_mock' },
}));

import {
  emitActivitySpineEvent,
  ActivitySpineEmitError,
} from '@/lib/activity-spine/emit';

type FakeTx = {
  insert: jest.Mock;
};

function fakeTxReturning(rows: { event_id: string }[]): FakeTx {
  const returning = jest.fn().mockResolvedValue(rows);
  const values = jest.fn(() => ({ returning }));
  const insert = jest.fn(() => ({ values }));
  // Attach internals for assertions
  (insert as unknown as { __values: jest.Mock }).__values = values;
  (insert as unknown as { __returning: jest.Mock }).__returning = returning;
  return { insert };
}

function fakeTxThrowingInsert(err: Error): FakeTx {
  const returning = jest.fn().mockRejectedValue(err);
  const values = jest.fn(() => ({ returning }));
  const insert = jest.fn(() => ({ values }));
  return { insert };
}

const BASE_INPUT = {
  entity_type: 'project' as const,
  entity_id: '11111111-1111-4111-8111-111111111111',
  aia_entity_kind: 'pay_application' as const,
  aia_entity_id: '22222222-2222-4222-8222-222222222222',
  test_data: false,
};

describe('BAN-309 Pass 3a.2 — emitActivitySpineEvent', () => {
  it('rejects an unknown event_type without touching the tx', async () => {
    const tx = fakeTxReturning([{ event_id: 'evt' }]);
    await expect(
      emitActivitySpineEvent(tx as never, {
        ...BASE_INPUT,
        event_type: 'NOT_A_REAL_EVENT',
        metadata: { from_state: 'a', to_state: 'b' },
      }),
    ).rejects.toMatchObject({
      name: 'ActivitySpineEmitError',
      code: 'UNKNOWN_EVENT_TYPE',
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('rejects a Pattern B payload without from_state / to_state', async () => {
    const tx = fakeTxReturning([{ event_id: 'evt' }]);
    await expect(
      emitActivitySpineEvent(tx as never, {
        ...BASE_INPUT,
        event_type: 'PAY_APP_STATE_CHANGED',
        metadata: { from_state: 'PENDING_DRAFT' }, // missing to_state
      }),
    ).rejects.toMatchObject({
      name: 'ActivitySpineEmitError',
      code: 'INVALID_PAYLOAD',
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('inserts via tx with the validated payload and returns the new event_id', async () => {
    const tx = fakeTxReturning([{ event_id: 'evt-9999' }]);
    const result = await emitActivitySpineEvent(tx as never, {
      ...BASE_INPUT,
      event_type: 'PAY_APP_STATE_CHANGED',
      notes: 'submitted',
      metadata: { from_state: 'READY_FOR_SUBMISSION', to_state: 'SUBMITTED' },
    });
    expect(result).toEqual({ event_id: 'evt-9999' });
    expect(tx.insert).toHaveBeenCalledTimes(1);
    const insertedValues = (tx.insert as unknown as { __values: jest.Mock }).__values.mock.calls[0][0];
    expect(insertedValues).toMatchObject({
      event_type: 'PAY_APP_STATE_CHANGED',
      entity_type: 'project',
      entity_id: BASE_INPUT.entity_id,
      notes: 'submitted',
      test_data: false,
    });
    expect(insertedValues.metadata).toMatchObject({
      from_state: 'READY_FOR_SUBMISSION',
      to_state: 'SUBMITTED',
      aia_entity_kind: 'pay_application',
      aia_entity_id: BASE_INPUT.aia_entity_id,
    });
  });

  it('accepts a Pattern A event with no state keys', async () => {
    const tx = fakeTxReturning([{ event_id: 'evt-1' }]);
    const result = await emitActivitySpineEvent(tx as never, {
      ...BASE_INPUT,
      event_type: 'PAY_APP_NOTARIZED',
      metadata: { session_id: 'NOT-001' },
    });
    expect(result.event_id).toBe('evt-1');
  });

  it('wraps Drizzle INSERT errors as ActivitySpineEmitError INSERT_FAILED', async () => {
    const tx = fakeTxThrowingInsert(new Error('boom from pg'));
    await expect(
      emitActivitySpineEvent(tx as never, {
        ...BASE_INPUT,
        event_type: 'PAY_APP_STATE_CHANGED',
        metadata: { from_state: 'PENDING_DRAFT', to_state: 'READY_FOR_NOTARIZATION' },
      }),
    ).rejects.toMatchObject({
      name: 'ActivitySpineEmitError',
      code: 'INSERT_FAILED',
    });
  });

  it('throws EMPTY_RETURNING when the INSERT succeeds but returns no row', async () => {
    const tx = fakeTxReturning([]);
    await expect(
      emitActivitySpineEvent(tx as never, {
        ...BASE_INPUT,
        event_type: 'PAY_APP_STATE_CHANGED',
        metadata: { from_state: 'PENDING_DRAFT', to_state: 'READY_FOR_NOTARIZATION' },
      }),
    ).rejects.toMatchObject({
      name: 'ActivitySpineEmitError',
      code: 'EMPTY_RETURNING',
    });
  });

  it('ActivitySpineEmitError carries its code on the instance', () => {
    const err = new ActivitySpineEmitError('INVALID_PAYLOAD', 'nope');
    expect(err.code).toBe('INVALID_PAYLOAD');
    expect(err).toBeInstanceOf(Error);
  });
});
