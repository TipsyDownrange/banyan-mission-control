import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WarRoomDashboard from '../components/WarRoomDashboard';
import { buildWarRoomDashboard } from '../lib/war-room/data';
import type { SourceHealthSnapshot } from '../lib/war-room/types';

const sourceHealth: SourceHealthSnapshot = {
  generatedAt: '2026-05-10T18:00:00.000Z',
  environment: 'staging',
  sources: [
    {
      source: 'supabase',
      label: 'Supabase Staging Shadow',
      status: 'degraded',
      authority: 'last_verified_fallback',
      freshness: 'last_verified',
      freshnessLabel: 'Last verified BAN-195 evidence; not live.',
      lastCheckedAt: '2026-05-10T18:00:00.000Z',
      summary: 'Using last-verified BAN-195 evidence; live Supabase row counts unavailable.',
      details: ['service_work_orders: 577', 'wo_drift_runs: 1', 'wo_drift_row_diffs: 6005', 'BAN-195 stop condition evidence is included; BAN-196 remains the remediation rail.'],
      isFallback: true,
      checkedChannels: ['BAN-195 canon evidence'],
      unverifiedChannels: ['rest_row_count_service_work_orders'],
      nonAuthorizationLabel: 'Production authority: NO / Writes allowed: NO / Cutover approved: NO',
    },
    {
      source: 'vercel',
      label: 'Mission Control Vercel Deployment',
      status: 'warning',
      authority: 'read_only_reference',
      freshness: 'manual',
      freshnessLabel: 'No Vercel runtime labels available locally.',
      lastCheckedAt: '2026-05-10T18:00:00.000Z',
      summary: 'Mission Control only. Postgres shadow-read gate resolves closed-or-not-staging.',
      details: ['Field App deployment card intentionally excluded from v1.', 'Resolved WO Postgres gate label: closed-or-not-staging'],
      isFallback: false,
      checkedChannels: ['resolved_postgres_gate_label'],
      unverifiedChannels: ['vercel_deployment_api'],
    },
  ],
  conflicts: [{
    id: 'supabase-row-counts-last-verified',
    severity: 'high',
    sourceA: 'supabase',
    sourceB: 'BAN-195',
    currentA: 'Live row counts unavailable.',
    currentB: 'BAN-195 fallback values 577 / 1 / 6005 are displayed as last verified.',
    recommendedAction: 'Keep remediation in BAN-196; do not treat staging shadow as production authority.',
  }],
};

describe('War Room Source Health panel rendering', () => {
  it('renders degraded last-verified fallback labels and non-authorization labels', () => {
    const html = renderToStaticMarkup(
      <WarRoomDashboard initialData={buildWarRoomDashboard([], 'fixture')} initialRuntimeHealth={null} initialSourceHealth={sourceHealth} />
    );

    expect(html).toContain('data-source-health-panel="true"');
    expect(html).toContain('data-source-health-card="supabase"');
    expect(html).toContain('data-source-health-status="degraded"');
    expect(html).toContain('Supabase Staging Shadow');
    expect(html).toContain('last verified fallback');
    expect(html).toContain('Last verified BAN-195 evidence; not live.');
    expect(html).toContain('service_work_orders: 577');
    expect(html).toContain('wo_drift_runs: 1');
    expect(html).toContain('wo_drift_row_diffs: 6005');
    expect(html).toContain('Unverified channels: rest_row_count_service_work_orders');
    expect(html).toContain('Production authority: NO');
    expect(html).toContain('Writes allowed: NO');
    expect(html).toContain('Cutover approved: NO');
    expect(html).toContain('BAN-196 remains the remediation rail');
  });

  it('keeps the read-only shell free of remediation controls and Field App cards', () => {
    const html = renderToStaticMarkup(
      <WarRoomDashboard initialData={buildWarRoomDashboard([], 'fixture')} initialRuntimeHealth={null} initialSourceHealth={sourceHealth} />
    );

    expect(html).toContain('No remediation, sync, fix, cutover, or Field App controls.');
    expect(html).not.toContain('data-source-health-card="field_app"');
    expect(html).not.toContain('Fix now');
    expect(html).not.toContain('Run sync');
    expect(html).not.toContain('Approve cutover');
  });
});
