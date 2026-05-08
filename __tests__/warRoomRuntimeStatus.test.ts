import {
  buildWarRoomRuntimeHealth,
  mapCostApiDataToWarRoomSnapshot,
  normalizeCrewRuntimeStatus,
} from '../lib/war-room/runtimeStatus';

describe('War Room runtime status normalization', () => {
  it('marks missing auth as blocked and preserves blocker reasons', () => {
    const status = normalizeCrewRuntimeStatus('codex', {
      auth: 'missing',
      runtime: 'ok',
      quota: 'manual',
      blockers: ['Codex ACP token is missing.'],
    }, '2026-05-07T12:00:00.000Z');

    expect(status.health).toBe('blocked');
    expect(status.blockers).toEqual(expect.arrayContaining([
      'Codex ACP token is missing.',
      'Quota is manual-only; no verified quota API is configured.',
    ]));
    expect(status.lastCheckedAt).toBe('2026-05-07T12:00:00.000Z');
  });

  it('uses manual crew posture when no runtime endpoints are configured', async () => {
    const health = await buildWarRoomRuntimeHealth({
      now: new Date('2026-05-07T12:00:00.000Z'),
      env: { NODE_ENV: 'test', VERCEL: '1' },
      costData: null,
      fetchImpl: jest.fn() as unknown as typeof fetch,
    });

    expect(health.kai.health).toBe('ready');
    expect(health.codex.health).toBe('degraded');
    expect(health.codex.quota).toBe('manual');
    expect(health.codex.summary).toContain('manual operator check');
    expect(health.codex.blockers.join(' ')).not.toContain('runtime probe unavailable');
    expect(health.claude.summary).toContain('manual operator check');
    expect(health.recommendation.lane).toBe('kai');
    expect(health.recommendation.confidence).toBe('low');
  });

  it('maps CostPanel API data into the War Room Costmaster snapshot', () => {
    const snapshot = mapCostApiDataToWarRoomSnapshot({
      allInTotal: 123.456,
      todayCost: 5.12345,
      weekCost: 33.333,
      monthlyBurn: 79,
      dailyBudget: 10,
      byProvider: {
        anthropic: { invoicesPaid: 80 },
        openai: { apiCostToDate: 12.5 },
        subscriptions: { totalToDate: 25 },
        vercel: { totalToDate: 5 },
      },
      byDay: {
        '2026-05-07': { cost: 5.12345, anthropic: 3, openai: 2.12345 },
      },
      lastSync: '2026-05-07T12:00:00.000Z',
    });

    expect(snapshot.allInTotal).toBe(123.46);
    expect(snapshot.todayCost).toBe(5.1235);
    expect(snapshot.budgetPct).toBe(51);
    expect(snapshot.providers.map(provider => provider.label)).toEqual(['Anthropic', 'OpenAI', 'Subscriptions', 'Vercel']);
    expect(snapshot.byDay['2026-05-07']).toMatchObject({ cost: 5.1235, openai: 2.1235 });
  });
});
