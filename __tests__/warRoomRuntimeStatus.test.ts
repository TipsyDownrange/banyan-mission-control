import {
  buildWarRoomRuntimeHealth,
  mapCostApiDataToWarRoomSnapshot,
  normalizeCrewRuntimeStatus,
} from '../lib/war-room/runtimeStatus';
import { parseLiveOpsSnapshot } from '../lib/war-room/liveOps';

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
    expect(health.codex.health).toBe('manual');
    expect(health.codex.quota).toBe('manual');
    expect(health.codex.summary).toContain('standby');
    expect(health.codex.blockers.join(' ')).not.toContain('runtime probe unavailable');
    expect(health.claude.summary).toContain('standby');
    expect(health.recommendation.lane).toBe('kai');
    expect(health.recommendation.confidence).toBe('low');
  });

  it('marks live ops heartbeat lanes stale when activity exceeds threshold', () => {
    const snapshot = parseLiveOpsSnapshot(JSON.stringify({
      generatedAt: '2026-05-07T12:05:00.000Z',
      staleAfterSeconds: 60,
      lanes: [{
        id: 'codex',
        label: 'Codex / Build Crew',
        state: 'working',
        active: 'BAN-184 implementation',
        issue: 'BAN-184',
        lastActivityAt: '2026-05-07T12:00:00.000Z',
        source: 'heartbeat',
      }],
    }), new Date('2026-05-07T12:05:00.000Z'));

    expect(snapshot?.lanes[0]).toMatchObject({
      id: 'codex',
      state: 'stale',
      issue: 'BAN-184',
      source: 'heartbeat',
    });
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
    // Cost & Usage Live Tracking Phase 1: defaults when relay has not posted.
    expect(snapshot.liveClaudeSession).toBeNull();
    expect(snapshot.liveClaudeSessionAgeSeconds).toBeNull();
  });

  it('passes live Claude session snapshot through when present in cost API payload', () => {
    const liveClaudeSession = {
      sessionPct: 45,
      weeklyPct: 12,
      opusPct: 8,
      extraUsageDollars: { used: 3.5, limit: 25 },
      resetSessionAt: '2026-05-07T15:00:00.000Z',
      resetWeeklyAt: '2026-05-12T00:00:00.000Z',
      sourceApp: 'usage-for-claude-dashboard',
      capturedAt: '2026-05-07T12:00:30.000Z',
    };
    const snapshot = mapCostApiDataToWarRoomSnapshot({
      allInTotal: 100,
      todayCost: 2,
      liveClaudeSession,
      liveClaudeSessionAgeSeconds: 42,
    });
    expect(snapshot.liveClaudeSession).toEqual(liveClaudeSession);
    expect(snapshot.liveClaudeSessionAgeSeconds).toBe(42);
  });

  it('coerces missing live Claude session fields to null', () => {
    const snapshot = mapCostApiDataToWarRoomSnapshot({});
    expect(snapshot.liveClaudeSession).toBeNull();
    expect(snapshot.liveClaudeSessionAgeSeconds).toBeNull();
  });
});
