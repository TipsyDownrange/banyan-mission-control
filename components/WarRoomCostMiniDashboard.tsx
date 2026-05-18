/**
 * WarRoomCostMiniDashboard — BAN-319 v2 Ship's Bridge instrument panel.
 *
 * Replaces the v1 Costmaster mini-dashboard. Three rows per packet §4.2:
 *
 *   Row 1 — Claude Station | ChatGPT Station
 *           (radial quota gauges per provider + state pill)
 *   Row 2 — API Spend strip (today / this week / this month manometer gauges)
 *   Row 3 — Billed To Date strip (30d / this month / trailing 12mo numbers)
 *
 * Mobile: stations stack vertically below 768px.
 */

'use client';

import type {
  WarRoomBilledLaneState,
  WarRoomCostSnapshot,
  WarRoomSpendLaneSnapshot,
  WarRoomUsageLaneSnapshot,
} from '@/lib/war-room/types';
import type { RelayState } from '@/lib/cost/types';
import { RadialQuotaGauge } from './gauges/RadialQuotaGauge';
import { ManometerSpendGauge } from './gauges/ManometerSpendGauge';

interface Props {
  cost: WarRoomCostSnapshot;
}

const PANEL_BG = 'linear-gradient(135deg, var(--color-navy-panel, #0a1e2d), var(--color-navy-panel-soft, #112a3d))';
const PANEL_BORDER = 'var(--color-navy-panel-border, rgba(184, 134, 46, 0.28))';

export default function WarRoomCostMiniDashboard({ cost }: Props) {
  const anthropicUsage = findUsage(cost.usage, 'anthropic');
  const openaiUsage = findUsage(cost.usage, 'openai');
  const anthropicSpend = findSpend(cost.spend, 'anthropic');
  const openaiSpend = findSpend(cost.spend, 'openai');
  const billedStates = cost.billedStates || [];
  const billed = cost.billedToDate?.combined ?? { last30d: 0, thisMonth: 0, trailing12m: 0 };

  return (
    <div
      data-war-room-ships-bridge="true"
      style={{ display: 'grid', gap: 12 }}
    >
      {/* Row 1 — Provider stations */}
      <div
        className="war-room-bridge-stations"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
      >
        <ProviderStation
          title="Claude Station"
          provider="anthropic"
          usage={anthropicUsage}
          spend={anthropicSpend}
        />
        <ProviderStation
          title="ChatGPT Station"
          provider="openai"
          usage={openaiUsage}
          spend={openaiSpend}
        />
      </div>

      {/* Row 2 — API Spend strip */}
      <BridgeStrip title="API Spend">
        <div style={{ display: 'flex', gap: 18, justifyContent: 'space-around', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {(['today', 'week', 'month'] as const).map(scope => {
            const merged = mergeSpendByScope(scope, anthropicSpend, openaiSpend);
            const state = degradedOf(anthropicSpend?.state, openaiSpend?.state);
            const scaleMax = scaleForScope(scope, cost);
            return (
              <ManometerSpendGauge
                key={scope}
                amountUsd={merged}
                scaleMax={scaleMax}
                label={scopeLabel(scope)}
                state={state}
              />
            );
          })}
        </div>
      </BridgeStrip>

      {/* Row 3 — Billed To Date strip */}
      <BridgeStrip title="Billed To Date">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <BilledFigure label="Last 30 days" amount={billed.last30d} state={mergeBilledState(billedStates)} />
          <BilledFigure label="This month" amount={billed.thisMonth} state={mergeBilledState(billedStates)} />
          <BilledFigure label="Trailing 12 mo" amount={billed.trailing12m} state={mergeBilledState(billedStates)} />
        </div>
      </BridgeStrip>

      {cost.error && (
        <div role="status" style={{ color: 'var(--color-red-500, #ef4444)', fontSize: 11, lineHeight: 1.35 }}>
          Cost route reported: {cost.error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider station — radial gauges + state pill
// ─────────────────────────────────────────────────────────────────────────────

function ProviderStation({
  title,
  provider,
  usage,
  spend,
}: {
  title: string;
  provider: 'anthropic' | 'openai';
  usage?: WarRoomUsageLaneSnapshot;
  spend?: WarRoomSpendLaneSnapshot;
}) {
  // ChatGPT Station shows two gauges (session + weekly) — no "Design" bucket.
  // Claude Station shows three when claudeDesign is present.
  const session = usage?.snapshot?.currentSession;
  const weekly = usage?.snapshot?.weeklyLimit;
  const design = usage?.snapshot?.claudeDesign ?? null;
  const usageState = usage?.state ?? 'NOT_CONFIGURED';
  const spendState = spend?.state ?? 'NOT_CONFIGURED';
  const overallState = degradedOf(usageState, spendState);

  return (
    <section
      data-war-room-provider-station={provider}
      style={{
        border: `1px solid ${PANEL_BORDER}`,
        background: PANEL_BG,
        borderRadius: 18,
        padding: 14,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#f8fafc', fontSize: 13, fontWeight: 950, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </h3>
        <StatePill state={overallState} />
      </header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'flex-start',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <RadialQuotaGauge
          percentage={session?.pct ?? 0}
          label="Session"
          resetsAt={session?.resetsAt ?? null}
          state={usageState}
        />
        <RadialQuotaGauge
          percentage={weekly?.pct ?? 0}
          label="Weekly"
          resetsAt={weekly?.resetsAt ?? null}
          state={usageState}
        />
        {provider === 'anthropic' && design && (
          <RadialQuotaGauge
            percentage={design.pct}
            label="Design"
            resetsAt={design.resetsAt}
            state={usageState}
          />
        )}
      </div>
      {usage?.snapshot?.extraUsage && (
        <p style={{ margin: '10px 0 0', color: '#cbd5e1', fontSize: 11 }}>
          Extra usage <span style={{ color: '#f8fafc', fontWeight: 850 }}>${usage.snapshot.extraUsage.used.toFixed(2)}</span>
          <span style={{ color: '#94a3b8' }}> / ${usage.snapshot.extraUsage.limit.toFixed(2)} cap</span>
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function BridgeStrip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: `1px solid ${PANEL_BORDER}`,
        background: PANEL_BG,
        borderRadius: 18,
        padding: 14,
      }}
    >
      <h3 style={{ margin: '0 0 10px', color: '#f8fafc', fontSize: 12, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function BilledFigure({ label, amount, state }: { label: string; amount: number; state: RelayState }) {
  return (
    <div data-billed-figure={label.toLowerCase().replace(/\s+/g, '-')} data-state={state} style={{ textAlign: 'center' }}>
      <div style={{ color: 'var(--color-brass-300, #e9d39a)', fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#f8fafc', fontSize: 22, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontVariantNumeric: 'tabular-nums' }}>
        ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}

function StatePill({ state }: { state: RelayState }) {
  const theme = stateTheme(state);
  return (
    <span
      data-state-pill={state}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: theme.color,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 10,
        fontWeight: 950,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: theme.color, display: 'inline-block' }} />
      {stateLabel(state)}
    </span>
  );
}

function stateTheme(state: RelayState): { color: string; bg: string; border: string } {
  if (state === 'LIVE') return { color: '#86efac', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.42)' };
  if (state === 'STALE') return { color: '#fcd34d', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.42)' };
  if (state === 'DEGRADED') return { color: '#fb923c', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.42)' };
  if (state === 'BROKEN_AUTH' || state === 'BROKEN_SCHEMA') return { color: '#fca5a5', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.46)' };
  return { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.28)' };
}

function stateLabel(state: RelayState): string {
  if (state === 'LIVE') return 'Live';
  if (state === 'STALE') return 'Stale';
  if (state === 'DEGRADED') return 'Degraded';
  if (state === 'BROKEN_AUTH') return 'Broken · auth';
  if (state === 'BROKEN_SCHEMA') return 'Broken · schema';
  return 'Not configured';
}

function findUsage(usage: WarRoomUsageLaneSnapshot[] | undefined, provider: 'anthropic' | 'openai'): WarRoomUsageLaneSnapshot | undefined {
  return usage?.find(u => u.provider === provider);
}

function findSpend(spend: WarRoomSpendLaneSnapshot[] | undefined, provider: 'anthropic' | 'openai'): WarRoomSpendLaneSnapshot | undefined {
  return spend?.find(s => s.provider === provider);
}

function mergeSpendByScope(scope: 'today' | 'week' | 'month', ...lanes: Array<WarRoomSpendLaneSnapshot | undefined>): number {
  let total = 0;
  for (const lane of lanes) {
    const match = lane?.scopes.find(s => s.scope === scope);
    if (match?.snapshot) total += match.snapshot.amountUsd;
  }
  return total;
}

function scopeLabel(scope: 'today' | 'week' | 'month'): string {
  if (scope === 'today') return 'Today';
  if (scope === 'week') return 'This week';
  return 'This month';
}

function scaleForScope(scope: 'today' | 'week' | 'month', cost: WarRoomCostSnapshot): number {
  if (scope === 'today') return Math.max(cost.dailyBudget * 1.5, 5);
  if (scope === 'week') return Math.max(cost.dailyBudget * 10, 50);
  return Math.max(cost.dailyBudget * 35, 200);
}

const STATE_ORDER: RelayState[] = ['LIVE', 'STALE', 'DEGRADED', 'BROKEN_SCHEMA', 'BROKEN_AUTH', 'NOT_CONFIGURED'];

function degradedOf(...states: Array<RelayState | undefined>): RelayState {
  // Return the worst (highest-ordered) state across inputs.
  let worst: RelayState = 'LIVE';
  for (const s of states) {
    if (!s) continue;
    if (STATE_ORDER.indexOf(s) > STATE_ORDER.indexOf(worst)) worst = s;
  }
  return worst;
}

function mergeBilledState(states: WarRoomBilledLaneState[]): RelayState {
  return degradedOf(...states.map(s => s.state));
}
