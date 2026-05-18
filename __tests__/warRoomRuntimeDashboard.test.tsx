import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WarRoomDashboard from '../components/WarRoomDashboard';
import { buildWarRoomDashboard } from '../lib/war-room/data';
import type { WarRoomRuntimeHealth } from '../lib/war-room/types';

const runtimeHealth: WarRoomRuntimeHealth = {
  generatedAt: '2026-05-07T12:00:00.000Z',
  kai: {
    id: 'kai',
    health: 'degraded',
    auth: 'ok',
    runtime: 'unknown',
    quota: 'unknown',
    lastCheckedAt: '2026-05-07T12:00:00.000Z',
    summary: 'Mission Control session is authenticated; Kai heartbeat is not verified.',
    blockers: ['runtime probe unavailable in Vercel without a published heartbeat/status endpoint'],
  },
  codex: {
    id: 'codex',
    health: 'blocked',
    auth: 'missing',
    runtime: 'blocked',
    quota: 'manual',
    lastCheckedAt: '2026-05-07T12:00:00.000Z',
    summary: 'Codex ACP token is missing.',
    blockers: ['Codex ACP token is missing.', 'Quota is manual-only; no verified quota API is configured.'],
  },
  claude: {
    id: 'claude',
    health: 'unknown',
    auth: 'unknown',
    runtime: 'unknown',
    quota: 'manual',
    lastCheckedAt: '2026-05-07T12:00:00.000Z',
    summary: 'Claude Code ACP/session status cannot be verified from this deployment.',
    blockers: ['runtime probe unavailable in Vercel without a published heartbeat/status endpoint'],
  },
  cost: {
    allInTotal: 125.25,
    todayCost: 4.125,
    weekCost: 21.5,
    monthlyBurn: 80,
    dailyBudget: 50,
    budgetPct: 8,
    overBudget: false,
    providers: [
      { id: 'anthropic', label: 'Anthropic', value: 75, color: '#4f46e5' },
      { id: 'openai', label: 'OpenAI', value: 20, color: '#059669' },
      { id: 'subscriptions', label: 'Subscriptions', value: 25, color: '#d97706' },
      { id: 'vercel', label: 'Vercel', value: 5.25, color: '#64748b' },
    ],
    byDay: {
      '2026-05-06': { cost: 2, anthropic: 1.5, openai: 0.5 },
      '2026-05-07': { cost: 4.125, anthropic: 3, openai: 1.125 },
    },
    lastSync: '2026-05-07T12:00:00.000Z',
  },
  recommendation: {
    lane: 'kai',
    confidence: 'low',
    summary: 'Keep routing manual until a build crew publishes verified auth/runtime/quota status.',
    reasons: ['Codex ACP token is missing.', 'Claude Code ACP/session status cannot be verified from this deployment.'],
  },
};

describe('War Room runtime dashboard rendering', () => {
  it('renders degraded, blocked, unknown, blocker reasons, and Ship\'s Bridge cost panel (BAN-319 v2)', () => {
    const html = renderToStaticMarkup(
      <WarRoomDashboard initialData={buildWarRoomDashboard([], 'fixture')} initialRuntimeHealth={runtimeHealth} />
    );

    expect(html).toContain('data-war-room-runtime-crew="kai"');
    expect(html).toContain('degraded');
    expect(html).toContain('blocked');
    expect(html).toContain('unknown');
    expect(html).toContain('Codex ACP token is missing.');
    expect(html).toContain('Quota is manual-only; no verified quota API is configured.');
    expect(html).toContain('data-war-room-ships-bridge="true"');
    expect(html).toContain('Claude Station');
    expect(html).toContain('ChatGPT Station');
    expect(html).toContain('Billed To Date');
    expect(html).toContain('Recommendation: kai');
  });
});
