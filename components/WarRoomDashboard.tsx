'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { buildWarRoomDispatchPrompt, canPrepareWarRoomDispatch } from '@/lib/war-room/dispatchPrompt';
import type { CrewRuntimeStatus, SourceHealthSnapshot, SourceHealthSourceCard, SourceHealthStatus, WarRoomCostSnapshot, WarRoomDashboardData, WarRoomIssue, WarRoomQueueKey, WarRoomRuntimeHealth, WarRoomRuntimeHealthState, WarRoomSpendEntry, WarRoomUsageEntry } from '@/lib/war-room/types';
import type { WarRoomLiveOpsLane } from '@/lib/war-room/liveOps';
import type { CostProvider, SpendScope } from '@/lib/cost/types';
import { resolveState, type CostSourceState } from '@/lib/cost/stateMachine';
import RadialQuotaGauge from '@/components/gauges/RadialQuotaGauge';
import ManometerSpendGauge from '@/components/gauges/ManometerSpendGauge';

const NAV: Array<{ key: WarRoomQueueKey; label: string }> = [
  { key: 'myWatch', label: 'My Watch' },
  { key: 'readyForCodex', label: 'Ready for Codex' },
  { key: 'needsSean', label: 'Needs Sean' },
  { key: 'captainsTriage', label: "Captain's Triage" },
  { key: 'xoReview', label: 'XO Review' },
  { key: 'needsEvidence', label: 'Needs Evidence' },
  { key: 'backlog', label: 'Backlog / Dry Dock' },
  { key: 'closed', label: 'Closed / Logged' },
];

const FILTERS = ['All', 'P0/P1', 'Codex', 'Needs Sean', 'Evidence', 'MC', 'Both'];

function riskColor(risk: WarRoomIssue['risk']) {
  if (risk === 'P0') return '#ef4444';
  if (risk === 'P1') return '#f97316';
  if (risk === 'P2') return '#f59e0b';
  if (risk === 'P3') return '#22c55e';
  return '#38bdf8';
}

function statusTheme(status: string) {
  if (status === 'working') return { label: 'working', color: '#22c55e', glow: 'rgba(34,197,94,0.32)', bg: 'rgba(34,197,94,0.11)' };
  if (status === 'blocked') return { label: 'blocked', color: '#ef4444', glow: 'rgba(239,68,68,0.34)', bg: 'rgba(239,68,68,0.12)' };
  if (status === 'waiting-approval') return { label: 'waiting approval', color: '#f59e0b', glow: 'rgba(245,158,11,0.34)', bg: 'rgba(245,158,11,0.12)' };
  if (status === 'disabled') return { label: 'disabled', color: 'var(--bos-color-ink-tertiary)', glow: 'rgba(148,163,184,0.16)', bg: 'rgba(148,163,184,0.08)' };
  return { label: 'idle', color: '#38bdf8', glow: 'rgba(56,189,248,0.24)', bg: 'rgba(56,189,248,0.1)' };
}

function agentInitials(title: string) {
  return title
    .split(/[ /]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
}

function gaugePressure(data: WarRoomDashboardData) {
  const warnings = data.kpis.needsSean + data.kpis.needsEvidence + data.kpis.p0p1Risks;
  const total = Math.max(data.issues.length, 1);
  return Math.min(100, Math.round((warnings / total) * 100));
}

function formatDate(value?: string | null) {
  if (!value) return 'No timestamp';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatUsd(value: number | undefined, digits = 2) {
  return `$${(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function healthTheme(health: WarRoomRuntimeHealthState) {
  if (health === 'ready') return { color: '#86efac', border: 'rgba(34,197,94,0.34)', bg: 'rgba(34,197,94,0.09)' };
  if (health === 'manual') return { color: '#67e8f9', border: 'rgba(103,232,249,0.34)', bg: 'rgba(103,232,249,0.08)' };
  if (health === 'degraded') return { color: '#fbbf24', border: 'rgba(245,158,11,0.36)', bg: 'rgba(245,158,11,0.09)' };
  if (health === 'blocked') return { color: '#fca5a5', border: 'rgba(239,68,68,0.38)', bg: 'rgba(239,68,68,0.1)' };
  if (health === 'disabled') return { color: 'var(--bos-color-ink-tertiary)', border: 'rgba(148,163,184,0.24)', bg: 'rgba(148,163,184,0.08)' };
  return { color: '#fcd34d', border: 'rgba(251,191,36,0.34)', bg: 'rgba(251,191,36,0.08)' };
}

function sourceHealthTheme(status: SourceHealthStatus) {
  if (status === 'healthy') return { color: '#86efac', border: 'rgba(34,197,94,0.38)', bg: 'rgba(34,197,94,0.09)' };
  if (status === 'degraded') return { color: '#fbbf24', border: 'rgba(245,158,11,0.42)', bg: 'rgba(245,158,11,0.11)' };
  if (status === 'warning') return { color: '#67e8f9', border: 'rgba(103,232,249,0.32)', bg: 'rgba(103,232,249,0.08)' };
  if (status === 'critical') return { color: '#fca5a5', border: 'rgba(239,68,68,0.44)', bg: 'rgba(239,68,68,0.12)' };
  return { color: '#cbd5e1', border: 'rgba(148,163,184,0.26)', bg: 'rgba(148,163,184,0.08)' };
}

function SourceHealthCard({ card }: { card: SourceHealthSourceCard }) {
  const theme = sourceHealthTheme(card.status);
  const nonAuthorizationLines = card.nonAuthorizationLabel?.split(' / ') || [];
  return (
    <article data-source-health-card={card.source} data-source-health-status={card.status} style={{ border: `1px solid ${theme.border}`, background: theme.bg, borderRadius: 16, padding: 11, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ color: 'var(--color-surface)', fontSize: 12, fontWeight: 950 }}>{card.label}</div>
          <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 10, marginTop: 3 }}>Authority: {card.authority} · Freshness: {card.freshness}</div>
        </div>
        <span style={{ color: theme.color, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 950, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{card.status}</span>
      </div>
      <p style={{ color: 'var(--color-surface-border)', fontSize: 12, lineHeight: 1.4, margin: '8px 0 0' }}>{card.summary}</p>
      <div style={{ color: card.isFallback ? '#fbbf24' : 'var(--bos-color-ink-tertiary)', fontSize: 11, fontWeight: 850, marginTop: 7 }}>{card.freshnessLabel}</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
        {card.isFallback && <span style={{ color: '#fbbf24', border: '1px solid rgba(245,158,11,0.34)', background: 'rgba(245,158,11,0.1)', borderRadius: 999, padding: '3px 6px', fontSize: 10, fontWeight: 950 }}>last verified fallback</span>}
        {(card.checkedChannels || []).slice(0, 3).map(channel => <span key={channel} style={{ color: '#86efac', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 999, padding: '3px 6px', fontSize: 10, fontWeight: 850 }}>{channel}</span>)}
      </div>
      {(card.unverifiedChannels || []).length > 0 && (
        <div style={{ color: '#fbbf24', fontSize: 10, lineHeight: 1.35, marginTop: 8 }}>
          Unverified channels: {(card.unverifiedChannels || []).join(', ')}
        </div>
      )}
      {card.details.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: '#cbd5e1', fontSize: 11, lineHeight: 1.35 }}>
          {card.details.slice(0, 5).map(detail => <li key={detail}>{detail}</li>)}
        </ul>
      )}
      {nonAuthorizationLines.length > 0 && (
        <div style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.09)', borderRadius: 12, padding: 8, color: '#fca5a5', fontSize: 11, fontWeight: 950, lineHeight: 1.45, marginTop: 9 }}>
          {nonAuthorizationLines.map(line => <div key={line}>{line}</div>)}
        </div>
      )}
    </article>
  );
}

function SourceHealthPanel({ snapshot, status }: { snapshot: SourceHealthSnapshot | null; status: 'loading' | 'ready' | 'failed' }) {
  return (
    <section data-source-health-panel="true" style={{ border: '1px solid rgba(251,191,36,0.28)', background: 'linear-gradient(135deg, rgba(69,43,8,0.42), rgba(3,10,20,0.78))', borderRadius: 18, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ color: '#fbbf24', fontSize: 11, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Source Health</div>
          <h2 style={{ color: 'var(--color-surface)', margin: '3px 0 0', fontSize: 15, fontWeight: 950 }}>Truth labels for build sources</h2>
          <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, marginTop: 4 }}>Read-only Mission Control War Room surface. No remediation, sync, fix, cutover, or Field App controls.</div>
        </div>
        <div style={{ color: status === 'ready' ? '#86efac' : status === 'failed' ? '#fca5a5' : '#fbbf24', fontSize: 11, fontWeight: 950, textAlign: 'right' }}>
          {status === 'ready' && snapshot ? `Snapshot ${formatDate(snapshot.generatedAt)}` : status === 'failed' ? 'Snapshot unavailable' : 'Checking sources...'}
        </div>
      </div>
      {snapshot ? (
        <>
          <div className="war-room-source-health-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {snapshot.sources.map(card => <SourceHealthCard key={card.source} card={card} />)}
          </div>
          {snapshot.conflicts.length > 0 && (
            <div style={{ border: '1px solid rgba(239,68,68,0.28)', background: 'rgba(239,68,68,0.08)', borderRadius: 14, padding: 10, marginTop: 10, color: '#fca5a5', fontSize: 11, lineHeight: 1.4 }}>
              <strong>Conflicts / stop signals:</strong> {snapshot.conflicts.map(conflict => `${conflict.id}: ${conflict.recommendedAction}`).join(' ')}
            </div>
          )}
        </>
      ) : (
        <div style={{ border: '1px dashed rgba(251,191,36,0.34)', background: 'rgba(251,191,36,0.07)', borderRadius: 18, padding: 12, color: '#fcd34d', fontSize: 12, lineHeight: 1.45 }}>
          Source Health has not returned yet. The existing War Room queue and runtime panels remain isolated and usable.
        </div>
      )}
    </section>
  );
}

function liveOpsTheme(state: WarRoomLiveOpsLane['state']) {
  if (state === 'working') return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.34)' };
  if (state === 'ready' || state === 'browser-verified' || state === 'deployed') return { color: '#86efac', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.28)' };
  if (state === 'blocked' || state === 'stale') return { color: '#fca5a5', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.34)' };
  if (state === 'waiting' || state === 'returned-unmerged' || state === 'pr-open' || state === 'merged' || state === 'verified-local') return { color: '#fbbf24', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.34)' };
  return { color: '#67e8f9', bg: 'rgba(103,232,249,0.08)', border: 'rgba(103,232,249,0.26)' };
}

function LiveOpsCard({ lane }: { lane: WarRoomLiveOpsLane }) {
  const theme = liveOpsTheme(lane.state);
  return (
    <div data-war-room-live-ops={lane.id} style={{ border: `1px solid ${theme.border}`, background: theme.bg, borderRadius: 14, padding: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ color: 'var(--color-surface)', fontSize: 12, fontWeight: 950 }}>{lane.label}</div>
        <span style={{ color: theme.color, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>{lane.state}</span>
      </div>
      <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.35, marginTop: 7 }}>{lane.active || lane.note}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {[lane.issue, lane.session, lane.pr].filter(Boolean).map(item => (
          <span key={item} style={{ color: '#67e8f9', border: '1px solid rgba(103,232,249,0.2)', borderRadius: 999, padding: '3px 6px', fontSize: 10, fontWeight: 850 }}>{item}</span>
        ))}
      </div>
      <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 10, marginTop: 8 }}>Last activity {formatDate(lane.lastActivityAt)} · {lane.source}</div>
    </div>
  );
}

function crewName(id: CrewRuntimeStatus['id']) {
  if (id === 'kai') return 'Kai / Captain';
  if (id === 'codex') return 'Codex / Build Crew';
  return 'Claude / Audit Crew';
}

function matchesFilter(issue: WarRoomIssue, filter: string) {
  if (filter === 'All') return true;
  if (filter === 'P0/P1') return issue.risk === 'P0' || issue.risk === 'P1';
  if (filter === 'Codex') return issue.lane === 'Codex';
  if (filter === 'Needs Sean') return issue.labels.some(label => label.includes('Needs Sean'));
  if (filter === 'Evidence') return issue.labels.includes('State: Evidence Missing') || issue.latestCommentSummary?.toLowerCase().includes('evidence');
  if (filter === 'MC') return issue.repo === 'MC';
  if (filter === 'Both') return issue.repo === 'Both';
  return true;
}

function IssuePills({ issue }: { issue: WarRoomIssue }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {[issue.status, `Risk ${issue.risk}`, `Repo ${issue.repo}`, `Lane ${issue.lane}`, issue.area].map(item => (
        <span key={item} style={{
          border: item.includes('Risk') ? `1px solid ${riskColor(issue.risk)}66` : '1px solid rgba(94,234,212,0.2)',
          color: item.includes('Risk') ? riskColor(issue.risk) : '#a7f3d0',
          background: item.includes('Risk') ? `${riskColor(issue.risk)}1f` : 'rgba(20,184,166,0.08)',
          padding: '4px 8px',
          borderRadius: 18,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>{item}</span>
      ))}
    </div>
  );
}

function QueueCard({ issue, active, onSelect }: { issue: WarRoomIssue; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        border: active ? '1px solid rgba(94,234,212,0.65)' : '1px solid rgba(148,163,184,0.16)',
        background: active ? 'linear-gradient(135deg, rgba(20,184,166,0.18), rgba(14,165,233,0.08))' : 'rgba(15,23,42,0.58)',
        borderRadius: 18,
        padding: 12,
        color: 'var(--color-surface-border)',
        cursor: 'pointer',
        boxShadow: active ? '0 0 24px rgba(20,184,166,0.12)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{issue.id}</span>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: riskColor(issue.risk), boxShadow: `0 0 10px ${riskColor(issue.risk)}99`, flexShrink: 0 }} />
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.35, fontWeight: 800, marginBottom: 10 }}>{issue.title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', color: 'var(--bos-color-ink-tertiary)', fontSize: 11, fontWeight: 700 }}>
        <span>{issue.status}</span>
        <span>{issue.repo}</span>
        <span>{issue.lane}</span>
      </div>
    </button>
  );
}

function Column({ title, issues, selectedId, onSelect }: { title: string; issues: WarRoomIssue[]; selectedId: string; onSelect: (issue: WarRoomIssue) => void }) {
  return (
    <section style={{
      minWidth: 0,
      border: '1px solid rgba(148,163,184,0.14)',
      background: 'rgba(8,20,32,0.72)',
      borderRadius: 18,
      padding: 12,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, color: 'var(--color-surface)', fontSize: 13, fontWeight: 900 }}>{title}</h2>
        <span style={{ color: '#67e8f9', fontSize: 12, fontWeight: 900 }}>{issues.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {issues.slice(0, 6).map(issue => (
          <QueueCard key={issue.id} issue={issue} active={issue.id === selectedId} onSelect={() => onSelect(issue)} />
        ))}
        {issues.length === 0 && (
          <div style={{ border: '1px dashed rgba(148,163,184,0.2)', borderRadius: 18, padding: 16, color: 'var(--bos-color-ink-disabled)', fontSize: 13 }}>
            Queue clear.
          </div>
        )}
      </div>
    </section>
  );
}

function CrewRuntimeCard({ crew }: { crew: CrewRuntimeStatus }) {
  const theme = healthTheme(crew.health);
  return (
    <div
      data-war-room-runtime-crew={crew.id}
      style={{ border: `1px solid ${theme.border}`, background: theme.bg, borderRadius: 18, padding: 10, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 950 }}>{crewName(crew.id)}</div>
        <span style={{ color: theme.color, border: `1px solid ${theme.border}`, borderRadius: 999, padding: '3px 7px', fontSize: 10, fontWeight: 950, textTransform: 'uppercase' }}>
          {crew.health}
        </span>
      </div>
      <div style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 850, marginTop: 7 }}>
        Auth {crew.auth} / runtime {crew.health === 'manual' ? 'manual standby' : crew.runtime} / quota {crew.quota}
      </div>
      <p style={{ color: 'var(--color-surface-border)', fontSize: 12, lineHeight: 1.4, margin: '8px 0 0' }}>{crew.summary}</p>
      <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, marginTop: 8 }}>Last checked {formatDate(crew.lastCheckedAt)}</div>
      {crew.blockers.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: theme.color, fontSize: 11, lineHeight: 1.35 }}>
          {crew.blockers.slice(0, 3).map(blocker => <li key={blocker}>{blocker}</li>)}
        </ul>
      )}
    </div>
  );
}

// ── Ship's Bridge War Room (BAN-319) ───────────────────────────────────────

function statePillTheme(state: CostSourceState) {
  if (state === 'LIVE') return { color: '#86efac', border: 'rgba(34,197,94,0.4)', bg: 'rgba(34,197,94,0.1)' };
  if (state === 'STALE') return { color: '#fbbf24', border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.1)' };
  if (state === 'DEGRADED') return { color: '#fb923c', border: 'rgba(249,115,22,0.4)', bg: 'rgba(249,115,22,0.1)' };
  if (state === 'BROKEN_AUTH') return { color: '#fca5a5', border: 'rgba(239,68,68,0.45)', bg: 'rgba(239,68,68,0.12)' };
  if (state === 'BROKEN_SCHEMA') return { color: '#fca5a5', border: 'rgba(239,68,68,0.45)', bg: 'rgba(239,68,68,0.12)' };
  return { color: 'var(--bos-color-ink-tertiary)', border: 'rgba(148,163,184,0.34)', bg: 'rgba(148,163,184,0.1)' };
}

function StatePill({ state }: { state: CostSourceState }) {
  const t = statePillTheme(state);
  return (
    <span
      data-state-pill={state}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: t.color, border: `1px solid ${t.border}`, background: t.bg,
        borderRadius: 999, padding: '3px 9px', fontSize: 10, fontWeight: 950,
        textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
      {state}
    </span>
  );
}

function deriveUsageState(entry: WarRoomUsageEntry | undefined): CostSourceState {
  if (!entry) return 'NOT_CONFIGURED';
  return resolveState({
    lastSuccess: entry.storedAt || null,
    lastAttempt: entry.storedAt || null,
    lastError: null,
    snapshotPresent: true,
  });
}

function deriveSpendState(entries: WarRoomSpendEntry[], provider: CostProvider): CostSourceState {
  const providerEntries = entries.filter(e => e.snapshot.provider === provider);
  if (providerEntries.length === 0) return 'NOT_CONFIGURED';
  const newest = providerEntries.reduce((a, b) => (a.ageSeconds <= b.ageSeconds ? a : b));
  return resolveState({
    lastSuccess: newest.storedAt || null,
    lastAttempt: newest.storedAt || null,
    lastError: null,
    snapshotPresent: true,
  });
}

function ClaudeStation({ usage, state }: { usage: WarRoomUsageEntry | undefined; state: CostSourceState }) {
  const snap = usage?.snapshot;
  return (
    <section data-ship-station="claude" style={{ border: '1px solid rgba(176,132,56,0.32)', background: 'linear-gradient(135deg, rgba(20,32,44,0.92), rgba(10,18,28,0.96))', borderRadius: 18, padding: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ color: '#c08838', fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Claude Station</div>
          <div style={{ color: 'var(--color-surface)', fontSize: 14, fontWeight: 950, marginTop: 2 }}>Anthropic Subscription</div>
        </div>
        <StatePill state={state} />
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, justifyItems: 'center' }}>
        <RadialQuotaGauge
          label="Session"
          percentage={snap?.currentSession.percentage ?? 0}
          resetsAt={snap?.currentSession.resetsAt ?? null}
          state={state}
        />
        <RadialQuotaGauge
          label="Weekly"
          percentage={snap?.weeklyLimit.percentage ?? 0}
          resetsAt={snap?.weeklyLimit.resetsAt ?? null}
          state={state}
        />
        <RadialQuotaGauge
          label="Design"
          percentage={snap?.claudeDesign?.percentage ?? 0}
          resetsAt={snap?.claudeDesign?.resetsAt ?? null}
          state={state}
        />
      </div>
      {snap?.extraUsage && (
        <div style={{ marginTop: 10, color: '#cbd5e1', fontSize: 11, textAlign: 'center' }}>
          Extra usage <span style={{ color: 'var(--color-surface)', fontWeight: 900 }}>${snap.extraUsage.usedUsd.toFixed(2)}</span>
          <span style={{ color: 'var(--bos-color-ink-tertiary)' }}> / ${snap.extraUsage.budgetUsd.toFixed(0)}</span>
        </div>
      )}
    </section>
  );
}

function ChatGPTStation({ usage, state }: { usage: WarRoomUsageEntry | undefined; state: CostSourceState }) {
  const snap = usage?.snapshot;
  return (
    <section data-ship-station="chatgpt" style={{ border: '1px solid rgba(176,132,56,0.32)', background: 'linear-gradient(135deg, rgba(20,32,44,0.92), rgba(10,18,28,0.96))', borderRadius: 18, padding: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ color: '#c08838', fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>ChatGPT Station</div>
          <div style={{ color: 'var(--color-surface)', fontSize: 14, fontWeight: 950, marginTop: 2 }}>OpenAI Subscription</div>
        </div>
        <StatePill state={state} />
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, justifyItems: 'center' }}>
        <RadialQuotaGauge
          label="Session"
          percentage={snap?.currentSession.percentage ?? 0}
          resetsAt={snap?.currentSession.resetsAt ?? null}
          state={state}
        />
        <RadialQuotaGauge
          label="Weekly"
          percentage={snap?.weeklyLimit.percentage ?? 0}
          resetsAt={snap?.weeklyLimit.resetsAt ?? null}
          state={state}
        />
      </div>
    </section>
  );
}

function ApiSpendStrip({ spend }: { spend: WarRoomSpendEntry[] }) {
  const scopes: SpendScope[] = ['today', 'week', 'month'];
  const scaleByScope: Record<SpendScope, number> = { today: 50, week: 200, month: 1000 };
  const labelByScope: Record<SpendScope, string> = { today: 'Today', week: 'Week', month: 'Month' };

  function totalFor(scope: SpendScope): { amount: number; state: CostSourceState } {
    const entries = spend.filter(e => e.snapshot.scope === scope);
    if (entries.length === 0) return { amount: 0, state: 'NOT_CONFIGURED' };
    const amount = entries.reduce((s, e) => s + e.snapshot.amountUsd, 0);
    const newest = entries.reduce((a, b) => (a.ageSeconds <= b.ageSeconds ? a : b));
    const state = resolveState({
      lastSuccess: newest.storedAt || null,
      lastAttempt: newest.storedAt || null,
      lastError: null,
      snapshotPresent: true,
    });
    return { amount, state };
  }

  return (
    <section data-ship-strip="api-spend" style={{ border: '1px solid rgba(176,132,56,0.32)', background: 'linear-gradient(135deg, rgba(20,32,44,0.92), rgba(10,18,28,0.96))', borderRadius: 18, padding: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ color: '#c08838', fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>API Spend (Anthropic + OpenAI)</div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, justifyItems: 'center' }}>
        {scopes.map(scope => {
          const { amount, state } = totalFor(scope);
          return (
            <ManometerSpendGauge
              key={scope}
              label={labelByScope[scope]}
              amountUsd={amount}
              scaleMax={scaleByScope[scope]}
              state={state}
            />
          );
        })}
      </div>
    </section>
  );
}

function BilledToDateStrip({ cost }: { cost: WarRoomCostSnapshot }) {
  const billed = cost.billedToDate;
  const cells = [
    { label: 'Last 30 Days', value: billed?.last30d ?? 0 },
    { label: 'This Month', value: billed?.thisMonth ?? 0 },
    { label: 'Trailing 12 mo', value: billed?.trailing12mo ?? 0 },
  ];
  return (
    <section data-ship-strip="billed-to-date" style={{ border: '1px solid rgba(176,132,56,0.32)', background: 'linear-gradient(135deg, rgba(20,32,44,0.92), rgba(10,18,28,0.96))', borderRadius: 18, padding: 14 }}>
      <header style={{ marginBottom: 12 }}>
        <div style={{ color: '#c08838', fontSize: 10, fontWeight: 950, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Billed to Date · Subscription Invoices</div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {cells.map(cell => (
          <div key={cell.label} data-billed-cell={cell.label} style={{ border: '1px solid rgba(176,132,56,0.18)', background: 'rgba(10,20,30,0.6)', borderRadius: 14, padding: 10, textAlign: 'center' }}>
            <div style={{ color: 'var(--color-surface)', fontSize: 22, fontWeight: 950, fontVariantNumeric: 'tabular-nums' }}>{formatUsd(cell.value)}</div>
            <div style={{ color: '#cbd5e1', fontSize: 10, fontWeight: 850, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{cell.label}</div>
          </div>
        ))}
      </div>
      {!billed && (
        <div style={{ marginTop: 8, color: 'var(--bos-color-ink-tertiary)', fontSize: 10, textAlign: 'center' }}>Aggregation pending Gmail spend scrub.</div>
      )}
    </section>
  );
}

function ShipsBridge({ cost }: { cost: WarRoomCostSnapshot }) {
  const usage = cost.usage || [];
  const spend = cost.spend || [];
  const anthropicUsage = usage.find(u => u.snapshot.provider === 'anthropic');
  const openaiUsage = usage.find(u => u.snapshot.provider === 'openai');
  const anthropicState = deriveUsageState(anthropicUsage);
  const openaiState = deriveUsageState(openaiUsage);

  return (
    <div data-war-room-ships-bridge="true" style={{ display: 'grid', gap: 10 }}>
      <div className="war-room-ships-bridge-stations" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <ClaudeStation usage={anthropicUsage} state={anthropicState} />
        <ChatGPTStation usage={openaiUsage} state={openaiState} />
      </div>
      <ApiSpendStrip spend={spend} />
      <BilledToDateStrip cost={cost} />
    </div>
  );
}

function WarRoomCostMiniDashboard({ cost }: { cost: WarRoomCostSnapshot }) {
  const days = Object.entries(cost.byDay || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  const maxCost = Math.max(...days.map(([, day]) => day.cost || 0), 1);
  const providerTotal = Math.max(cost.providers.reduce((sum, provider) => sum + provider.value, 0), cost.allInTotal, 1);

  const hasV2Data = (cost.usage && cost.usage.length > 0) || (cost.spend && cost.spend.length > 0) || cost.billedToDate != null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {hasV2Data ? (
        <ShipsBridge cost={cost} />
      ) : (
        <LiveClaudeSessionPanel
          snapshot={cost.liveClaudeSession ?? null}
          ageSeconds={cost.liveClaudeSessionAgeSeconds ?? null}
        />
      )}
      <section data-war-room-runtime-cost="true" style={{ border: '1px solid rgba(94,234,212,0.18)', background: 'linear-gradient(135deg, rgba(7,23,34,0.94), rgba(12,35,48,0.86))', borderRadius: 18, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12 }}>
        <div>
          <div style={{ color: 'rgba(148,163,184,0.72)', fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Costmaster · Billed to Date</div>
          <div style={{ color: 'var(--color-surface)', fontSize: 30, fontWeight: 950, marginTop: 3 }}>{formatUsd(cost.allInTotal)}</div>
          <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 12, marginTop: 2 }}>All-in tracked spend / monthly burn {formatUsd(cost.monthlyBurn)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: cost.overBudget ? '#fca5a5' : '#86efac', fontSize: 18, fontWeight: 950 }}>{formatUsd(cost.todayCost, 4)}</div>
          <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11 }}>today / {formatUsd(cost.dailyBudget)} budget</div>
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${Math.min(cost.budgetPct, 100)}%`, background: cost.overBudget ? '#ef4444' : 'var(--bos-color-brand-primary)', borderRadius: 999 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(160px, 1fr)', gap: 12 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {cost.providers.map(provider => {
            const pct = providerTotal > 0 ? Math.round((provider.value / providerTotal) * 100) : 0;
            return (
              <div key={provider.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#cbd5e1', fontSize: 11, fontWeight: 850, marginBottom: 4 }}>
                  <span>{provider.label}</span>
                  <span>{formatUsd(provider.value)} ({pct}%)</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: provider.color, borderRadius: 999 }} />
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ height: 82, display: 'flex', gap: 4, alignItems: 'flex-end', overflow: 'hidden' }}>
            {days.length === 0 && <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 12 }}>No daily cost rows available.</div>}
            {days.map(([date, day]) => {
              const height = Math.max(4, Math.round(((day.cost || 0) / maxCost) * 74));
              return (
                <div key={date} title={`${date}: ${formatUsd(day.cost || 0, 4)}`} style={{ flex: 1, minWidth: 8, display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height, borderRadius: '4px 4px 0 0', background: 'linear-gradient(180deg,#67e8f9,#4f46e5)' }} />
                </div>
              );
            })}
          </div>
          <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 10, marginTop: 5 }}>Last sync: {cost.lastSync ? formatDate(cost.lastSync) : 'not connected'}</div>
        </div>
      </div>
      {cost.error && <div style={{ color: '#fca5a5', fontSize: 11, lineHeight: 1.35, marginTop: 10 }}>Cost route reported: {cost.error}</div>}
      </section>
    </div>
  );
}

function pctBarColor(pct: number): string {
  if (pct >= 90) return '#fb7185';
  if (pct >= 70) return '#fbbf24';
  return '#5eead4';
}

function formatResetCountdown(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const deltaMs = t - now.getTime();
  if (deltaMs <= 0) return 'resetting now';
  const totalMinutes = Math.round(deltaMs / 60000);
  if (totalMinutes < 60) return `resets in ${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `resets in ${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `resets in ${days}d ${remHours}h`;
}

function LiveClaudePctBar({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = pctBarColor(clamped);
  return (
    <div data-live-claude-bar={label.toLowerCase()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#cbd5e1', fontSize: 11, fontWeight: 850, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color }}>{clamped.toFixed(0)}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function LiveClaudeSessionPanel({ snapshot, ageSeconds }: { snapshot: WarRoomCostSnapshot['liveClaudeSession']; ageSeconds: number | null }) {
  const freshness = computeLiveClaudeFreshness(ageSeconds);
  const now = new Date();
  const sessionReset = snapshot ? formatResetCountdown(snapshot.resetSessionAt, now) : null;
  const weeklyReset = snapshot ? formatResetCountdown(snapshot.resetWeeklyAt, now) : null;
  return (
    <section
      data-war-room-live-claude="true"
      data-live-claude-freshness={freshness.state}
      style={{ border: '1px solid rgba(94,234,212,0.18)', background: 'linear-gradient(135deg, rgba(8,28,38,0.94), rgba(12,40,52,0.86))', borderRadius: 18, padding: 14 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 10 }}>
        <div>
          <div style={{ color: 'rgba(148,163,184,0.72)', fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Live Claude Session</div>
          <div style={{ color: 'var(--color-surface)', fontSize: 14, fontWeight: 850, marginTop: 3 }}>Real-time subscription window from Mac mini relay</div>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: freshness.color,
          border: `1px solid ${freshness.color}55`,
          background: `${freshness.color}18`,
          borderRadius: 999, padding: '3px 9px', fontSize: 10, fontWeight: 950, textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: freshness.color, display: 'inline-block' }} />
          {freshness.label}
        </span>
      </div>
      {snapshot ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <LiveClaudePctBar label="Session" pct={snapshot.sessionPct} />
          {sessionReset && (
            <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 10, marginTop: -6 }}>Session {sessionReset}</div>
          )}
          <LiveClaudePctBar label="Weekly" pct={snapshot.weeklyPct} />
          {weeklyReset && (
            <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 10, marginTop: -6 }}>Weekly {weeklyReset}</div>
          )}
          {typeof snapshot.opusPct === 'number' && (
            <LiveClaudePctBar label="Opus / Design" pct={snapshot.opusPct} />
          )}
          {snapshot.extraUsageDollars && (
            <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 850 }}>
              Extra usage <span style={{ color: 'var(--color-surface)' }}>{formatUsd(snapshot.extraUsageDollars.used)}</span>
              <span style={{ color: 'var(--bos-color-ink-tertiary)' }}> / {formatUsd(snapshot.extraUsageDollars.limit)}</span>
            </div>
          )}
          <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 10 }}>Source: {snapshot.sourceApp} · captured {formatDate(snapshot.capturedAt)}</div>
        </div>
      ) : (
        <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 12, lineHeight: 1.4 }}>
          No live snapshot yet. Confirm the Mac mini relay is running and posting to /api/cost/ingest.
        </div>
      )}
    </section>
  );
}

function computeLiveClaudeFreshness(ageSeconds: number | null): { state: 'live' | 'stale' | 'offline'; label: string; color: string } {
  if (ageSeconds === null || ageSeconds === undefined || ageSeconds > 300) {
    return { state: 'offline', label: 'Not connected', color: '#fb7185' };
  }
  if (ageSeconds < 90) {
    return { state: 'live', label: `Live · ${ageSeconds}s ago`, color: '#86efac' };
  }
  const minutes = Math.max(1, Math.round(ageSeconds / 60));
  return { state: 'stale', label: `Stale · ${minutes}m ago`, color: '#fbbf24' };
}

export default function WarRoomDashboard({ initialData, initialRuntimeHealth = null, initialSourceHealth = null }: { initialData: WarRoomDashboardData; initialRuntimeHealth?: WarRoomRuntimeHealth | null; initialSourceHealth?: SourceHealthSnapshot | null }) {
  const [data] = useState(initialData);
  const [runtimeHealth, setRuntimeHealth] = useState<WarRoomRuntimeHealth | null>(initialRuntimeHealth);
  const [runtimeStatus, setRuntimeStatus] = useState<'loading' | 'ready' | 'failed'>(initialRuntimeHealth ? 'ready' : 'loading');
  const [sourceHealth, setSourceHealth] = useState<SourceHealthSnapshot | null>(initialSourceHealth);
  const [sourceHealthStatus, setSourceHealthStatus] = useState<'loading' | 'ready' | 'failed'>(initialSourceHealth ? 'ready' : 'loading');
  const [selectedId, setSelectedId] = useState(initialData.upNext[0]?.id || initialData.issues[0]?.id || '');
  const [activeQueue, setActiveQueue] = useState<WarRoomQueueKey>('myWatch');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [dispatchIssueId, setDispatchIssueId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [intake, setIntake] = useState({
    title: '',
    description: '',
    priority: 'P2',
    risk: 'P2',
    scopeType: 'audit',
    suggestedLane: 'kai',
    safetyFlags: {
      noExternalWrites: true,
      stagingOnly: true,
      needsApproval: true,
      productionSensitive: false,
    },
  });
  const [intakeStatus, setIntakeStatus] = useState<'idle' | 'submitting' | 'created' | 'preview' | 'failed'>('idle');
  const [intakeMessage, setIntakeMessage] = useState('');
  const selectedIssue = data.issues.find(issue => issue.id === selectedId) || data.issues[0];
  const dispatchIssue = data.issues.find(issue => issue.id === dispatchIssueId) || null;
  const dispatchPrompt = dispatchIssue ? buildWarRoomDispatchPrompt(dispatchIssue) : '';
  const selectedIssueQueueKeys = selectedIssue
    ? data.queues.filter(queueItem => queueItem.issues.some(issue => issue.id === selectedIssue.id)).map(queueItem => queueItem.key)
    : [];
  const dispatchReady = canPrepareWarRoomDispatch(selectedIssue, { queueKeys: selectedIssueQueueKeys });
  const activeQueueMeta = data.queues.find(queueItem => queueItem.key === activeQueue);

  useEffect(() => {
    let active = true;

    async function loadRuntimeHealth() {
      try {
        const response = await fetch('/api/war-room/runtime-status', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'runtime status request failed');
        if (active) {
          setRuntimeHealth(payload);
          setRuntimeStatus('ready');
        }
      } catch {
        if (active) setRuntimeStatus('failed');
      }
    }

    loadRuntimeHealth();
    const interval = setInterval(loadRuntimeHealth, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSourceHealth() {
      try {
        const response = await fetch('/api/war-room/source-health', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'source health request failed');
        if (active) {
          setSourceHealth(payload);
          setSourceHealthStatus('ready');
        }
      } catch {
        if (active) setSourceHealthStatus('failed');
      }
    }

    loadSourceHealth();
    const interval = setInterval(loadSourceHealth, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const filteredIssues = useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeQueueIssues = data.queues.find(queueItem => queueItem.key === activeQueue)?.issues || data.issues;

    return activeQueueIssues.filter(issue => {
      const haystack = [issue.id, issue.title, issue.status, issue.repo, issue.lane, issue.area, issue.risk, ...issue.labels].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) && matchesFilter(issue, filter);
    });
  }, [activeQueue, data.issues, data.queues, filter, search]);

  const queue = (key: WarRoomQueueKey) => data.queues.find(item => item.key === key)?.issues.filter(issue => filteredIssues.some(match => match.id === issue.id)) || [];
  const commandDecision = [...queue('needsSean'), ...queue('needsEvidence')].filter((issue, index, arr) => arr.findIndex(item => item.id === issue.id) === index);
  const triage = queue('captainsTriage');
  const ready = queue('readyForCodex');
  const xoReview = queue('xoReview');
  const warningCount = data.kpis.needsSean + data.kpis.needsEvidence + data.kpis.p0p1Risks;
  const pressure = gaugePressure(data);
  const bridgeMode = warningCount > 0 ? 'Command attention' : 'All clear watch';
  const signalFlags = [
    { label: 'Sean signals', value: data.kpis.needsSean, color: '#f59e0b' },
    { label: 'Evidence gaps', value: data.kpis.needsEvidence, color: '#fb923c' },
    { label: 'P0/P1 risks', value: data.kpis.p0p1Risks, color: '#ef4444' },
    { label: 'Fixture mode', value: data.source === 'fixture' ? 1 : 0, color: '#38bdf8' },
  ];

  function selectIssue(issue: WarRoomIssue) {
    setSelectedId(issue.id);
    setCopyStatus('idle');
  }

  function selectQueue(key: WarRoomQueueKey) {
    const queueIssues = data.queues.find(queueItem => queueItem.key === key)?.issues || [];
    const nextIssues = key === 'myWatch'
      ? queueIssues.length > 0 ? queueIssues : data.upNext.length > 0 ? data.upNext : data.issues
      : queueIssues;

    setActiveQueue(key);
    setFilter('All');
    setCopyStatus('idle');
    setDispatchIssueId(null);
    if (nextIssues[0]) setSelectedId(nextIssues[0].id);
  }

  async function copyDispatchPrompt() {
    if (!dispatchPrompt) return;
    try {
      await navigator.clipboard.writeText(dispatchPrompt);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  async function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntakeStatus('submitting');
    setIntakeMessage('');

    try {
      const response = await fetch('/api/war-room/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intake),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.details?.join?.(', ') || payload?.error || 'War Room intake failed');
      }

      setIntakeStatus(payload.mode === 'linear' ? 'created' : 'preview');
      setIntakeMessage(payload.mode === 'linear'
        ? `Created ${payload.linearIssue?.identifier || 'Linear issue'} from War Room intake.`
        : payload.message || 'Intake validated as a Linear preview.');
      setIntake(previous => ({ ...previous, title: '', description: '' }));
    } catch (error) {
      setIntakeStatus('failed');
      setIntakeMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="war-room-shell" style={{
      minHeight: '100%',
      background: 'radial-gradient(circle at top left, rgba(20,184,166,0.16), transparent 32%), linear-gradient(180deg, #06121f 0%, #071722 38%, #08111d 100%)',
      color: 'var(--color-surface-border)',
      fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
      display: 'block',
    }}>
      <main className="war-room-main" style={{ minWidth: 0, padding: 18, overflow: 'auto', maxWidth: 1500, margin: '0 auto' }}>
        <header className="war-room-header" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(300px, 520px)', gap: 16, alignItems: 'stretch', marginBottom: 12 }}>
          <div style={{ border: '1px solid rgba(94,234,212,0.24)', background: 'linear-gradient(135deg, rgba(8,47,73,0.78), rgba(3,10,20,0.72))', borderRadius: 18, padding: 16, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
            <div style={{ color: '#38bdf8', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
              BanyanOS War Room / Live Command Bridge
            </div>
            <h1 style={{ margin: 0, color: 'var(--color-surface)', fontSize: 36, fontWeight: 950, letterSpacing: -1 }}>Bridge Watch</h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <span style={{ border: warningCount ? '1px solid rgba(245,158,11,0.45)' : '1px solid rgba(34,197,94,0.36)', background: warningCount ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.1)', color: warningCount ? '#fbbf24' : '#86efac', borderRadius: 18, padding: '7px 10px', fontSize: 12, fontWeight: 950 }}>
                {bridgeMode}
              </span>
              <span style={{ border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.58)', color: '#cbd5e1', borderRadius: 18, padding: '7px 10px', fontSize: 12, fontWeight: 850 }}>
                {activeQueueMeta?.label || 'War Room'} / {filteredIssues.length} signals
              </span>
              <span style={{ border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.58)', color: 'var(--bos-color-ink-tertiary)', borderRadius: 18, padding: '7px 10px', fontSize: 12, fontWeight: 850 }}>
                Updated {formatDate(data.generatedAt)}
              </span>
            </div>
            <div className="war-room-signal-strip" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 16 }}>
              {signalFlags.map(flag => (
                <div key={flag.label} style={{ border: `1px solid ${flag.color}55`, background: flag.value ? `${flag.color}1f` : 'rgba(15,23,42,0.48)', borderRadius: 18, padding: '10px 11px' }}>
                  <div style={{ color: flag.color, fontSize: 22, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{flag.value}</div>
                  <div style={{ color: '#cbd5e1', fontSize: 10, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{flag.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search issue IDs, titles, labels, repos, lanes"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(15,23,42,0.82)',
                  color: 'var(--color-surface-border)',
                  border: '1px solid rgba(148,163,184,0.22)',
                  borderRadius: 18,
                  padding: '11px 12px',
                  outline: 'none',
                  fontSize: 13,
                }}
              />
              <div style={{ border: '1px solid rgba(34,197,94,0.32)', background: 'rgba(34,197,94,0.1)', color: '#86efac', borderRadius: 18, padding: '10px 12px', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>
                {data.bridgeStatus}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {FILTERS.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  style={{
                    border: filter === item ? '1px solid rgba(94,234,212,0.55)' : '1px solid rgba(148,163,184,0.16)',
                    background: filter === item ? 'rgba(20,184,166,0.15)' : 'rgba(15,23,42,0.5)',
                    color: filter === item ? '#ccfbf1' : 'var(--bos-color-ink-tertiary)',
                    borderRadius: 18,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="war-room-kpis" aria-label="Bridge console gauges" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
          {[
            ['Ready', data.kpis.readyForCodex, '#22d3ee'],
            ['Needs Sean', data.kpis.needsSean, '#f59e0b'],
            ['P0/P1 Risks', data.kpis.p0p1Risks, '#ef4444'],
            ['Needs Evidence', data.kpis.needsEvidence, '#fb923c'],
            ['Closed / Logged', data.kpis.closedLogged, '#22c55e'],
            ['Codex Active', data.kpis.activeCodex ?? '-', '#a7f3d0'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ border: `1px solid ${color as string}3d`, background: 'linear-gradient(180deg, rgba(15,23,42,0.76), rgba(8,20,32,0.68))', borderRadius: 18, padding: '12px 14px', minHeight: 82 }}>
              <div style={{ color: color as string, fontSize: 24, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</div>
              <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
            </div>
          ))}
        </section>

        {runtimeHealth?.liveOps && (
          <section data-war-room-live-ops-panel="true" style={{ border: '1px solid rgba(103,232,249,0.22)', background: 'linear-gradient(135deg, rgba(8,47,73,0.66), rgba(3,10,20,0.72))', borderRadius: 18, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Live Operations</div>
                <h2 style={{ color: 'var(--color-surface)', margin: '3px 0 0', fontSize: 15, fontWeight: 950 }}>Execution Heartbeat</h2>
              </div>
              <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11 }}>Snapshot {formatDate(runtimeHealth.liveOps.generatedAt)}</div>
            </div>
            <div className="war-room-live-ops-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {runtimeHealth.liveOps.lanes.map(lane => <LiveOpsCard key={lane.id} lane={lane} />)}
            </div>
          </section>
        )}

        <SourceHealthPanel snapshot={sourceHealth} status={sourceHealthStatus} />

        <section className="war-room-command-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.52fr) minmax(520px, 1.48fr)', gap: 10, marginBottom: 12 }}>
          <form onSubmit={submitIntake} style={{ border: '1px solid rgba(94,234,212,0.26)', background: 'linear-gradient(180deg, rgba(3,10,20,0.82), rgba(8,47,73,0.48))', borderRadius: 18, padding: 12, display: 'grid', gap: 8, alignSelf: 'start' }}>
            <div>
              <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Task Intake / Main Bridge</div>
              <h2 style={{ color: 'var(--color-surface)', margin: '3px 0 0', fontSize: 15, fontWeight: 950 }}>New Command</h2>
            </div>
            <input
              value={intake.title}
              onChange={event => setIntake(previous => ({ ...previous, title: event.target.value }))}
              placeholder="Short command title"
              maxLength={140}
              style={{ background: 'rgba(15,23,42,0.82)', color: 'var(--color-surface-border)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 18, padding: '8px 10px', fontSize: 12, outline: 'none' }}
            />
            <textarea
              value={intake.description}
              onChange={event => setIntake(previous => ({ ...previous, description: event.target.value }))}
              placeholder="Drop the plain-English task here. Include acceptance criteria, stop conditions, and source links when known."
              rows={2}
              maxLength={4000}
              style={{ background: 'rgba(15,23,42,0.82)', color: 'var(--color-surface-border)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 18, padding: '8px 10px', fontSize: 12, lineHeight: 1.45, resize: 'vertical', outline: 'none' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <select value={intake.priority} onChange={event => setIntake(previous => ({ ...previous, priority: event.target.value }))} style={{ background: 'var(--color-ink-primary)', color: 'var(--color-surface-border)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 18, padding: '7px 8px' }}>
                {['P0', 'P1', 'P2', 'P3'].map(value => <option key={value} value={value}>Priority {value}</option>)}
              </select>
              <select value={intake.risk} onChange={event => setIntake(previous => ({ ...previous, risk: event.target.value }))} style={{ background: 'var(--color-ink-primary)', color: 'var(--color-surface-border)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 18, padding: '7px 8px' }}>
                {['P0', 'P1', 'P2', 'P3'].map(value => <option key={value} value={value}>Risk {value}</option>)}
              </select>
              <select value={intake.scopeType} onChange={event => setIntake(previous => ({ ...previous, scopeType: event.target.value }))} style={{ background: 'var(--color-ink-primary)', color: 'var(--color-surface-border)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 18, padding: '7px 8px' }}>
                {['audit', 'code', 'verify', 'doc', 'external-action', 'recurring'].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              <select value={intake.suggestedLane} onChange={event => setIntake(previous => ({ ...previous, suggestedLane: event.target.value }))} style={{ background: 'var(--color-ink-primary)', color: 'var(--color-surface-border)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 18, padding: '7px 8px' }}>
                {['kai', 'codex', 'claude', 'sean'].map(value => <option key={value} value={value}>Lane {value}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {[
                ['noExternalWrites', 'No external writes'],
                ['stagingOnly', 'Staging only'],
                ['needsApproval', 'Needs approval'],
                ['productionSensitive', 'Production sensitive'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 12, fontWeight: 800, border: '1px solid rgba(148,163,184,0.14)', borderRadius: 18, padding: '8px 9px', background: 'rgba(15,23,42,0.42)' }}>
                  <input
                    type="checkbox"
                    checked={intake.safetyFlags[key as keyof typeof intake.safetyFlags]}
                    disabled={key === 'noExternalWrites'}
                    onChange={event => setIntake(previous => ({
                      ...previous,
                      safetyFlags: { ...previous.safetyFlags, [key]: event.target.checked },
                    }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={intakeStatus === 'submitting'} style={{ border: '1px solid rgba(94,234,212,0.44)', background: 'linear-gradient(135deg,#67e8f9,#2dd4bf)', color: '#04111f', borderRadius: 18, padding: '8px 10px', fontSize: 12, fontWeight: 950, cursor: intakeStatus === 'submitting' ? 'wait' : 'pointer' }}>
              {intakeStatus === 'submitting' ? 'Submitting...' : 'Go'}
            </button>
            <div style={{ color: intakeStatus === 'failed' ? '#fca5a5' : intakeStatus === 'created' ? '#86efac' : 'var(--bos-color-ink-tertiary)', minHeight: 18, fontSize: 12, lineHeight: 1.4 }}>
              {intakeMessage || 'Authenticated route only. Creates Linear issue when Linear write config exists; otherwise returns a preview.'}
            </div>
          </form>

          <div style={{ display: 'grid', gap: 12 }}>
            <section style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12 }}>
                <div>
                  <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Crew Deck</div>
                  <h2 style={{ margin: '3px 0 0', color: 'var(--color-surface)', fontSize: 16, fontWeight: 950 }}>Bridge Watch</h2>
                  <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, marginTop: 4 }}>
                    {runtimeStatus === 'loading' && 'Checking live runtime and cost signals...'}
                    {runtimeStatus === 'ready' && runtimeHealth && `Generated ${formatDate(runtimeHealth.generatedAt)}`}
                    {runtimeStatus === 'failed' && 'Runtime status request failed; no signal is being inferred.'}
                  </div>
                </div>
                {runtimeHealth ? (
                  <div style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.35, textAlign: 'right', maxWidth: 280 }}>
                    <span style={{ color: '#67e8f9', fontWeight: 950 }}>Recommendation: {runtimeHealth.recommendation.lane}</span>
                    <br />
                    {runtimeHealth.recommendation.summary}
                  </div>
                ) : (
                  <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, fontWeight: 850 }}>Visual status only until runtime signal returns</div>
                )}
              </div>
              <div style={{ marginBottom: 10, border: '1px solid rgba(45,212,191,0.14)', background: 'rgba(20,184,166,0.06)', borderRadius: 18, padding: 10, color: 'var(--bos-color-ink-tertiary)', fontSize: 11, lineHeight: 1.4 }}>
                Crew lanes are operator-routed. Kai is ready; Codex and Claude stay on standby until manually assigned.
              </div>

              {runtimeHealth ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div className="war-room-crew-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    {[runtimeHealth.kai, runtimeHealth.codex, runtimeHealth.claude].map(crew => (
                      <CrewRuntimeCard key={crew.id} crew={crew} />
                    ))}
                  </div>
                  <WarRoomCostMiniDashboard cost={runtimeHealth.cost} />
                </div>
              ) : (
                <div style={{ border: '1px dashed rgba(251,191,36,0.34)', background: 'rgba(251,191,36,0.07)', borderRadius: 18, padding: 12, color: '#fcd34d', fontSize: 12, lineHeight: 1.45 }}>
                  Runtime health and Costmaster data are unavailable. War Room will not infer OK, quota, or dispatch readiness without a verified signal.
                </div>
              )}
            </section>

            <section className="war-room-two-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ border: '1px solid rgba(94,234,212,0.18)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
                <h2 style={{ margin: '0 0 10px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>Command Console</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                  {[
                    ['Signal Pressure', `${pressure}%`, pressure > 50 ? '#f59e0b' : '#67e8f9'],
                    ['Budget Today', runtimeHealth ? formatUsd(runtimeHealth.cost.todayCost, 4) : '$0.0000', '#22c55e'],
                    ['Crew Mode', runtimeHealth ? 'Manual' : 'Standby', '#a78bfa'],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ border: `1px solid ${color}55`, background: `${color}18`, borderRadius: 14, padding: '9px 10px' }}>
                      <div style={{ color: color as string, fontSize: 17, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</div>
                      <div style={{ color: '#cbd5e1', fontSize: 9, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 86, height: 86, borderRadius: 999, background: `conic-gradient(#f59e0b ${pressure * 3.6}deg, rgba(148,163,184,0.16) 0deg)`, padding: 8 }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: 999, background: '#06121f', display: 'grid', placeItems: 'center', border: '1px solid rgba(148,163,184,0.18)' }}>
                      <span style={{ color: pressure > 50 ? '#fbbf24' : '#67e8f9', fontSize: 22, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{pressure}%</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-surface)', fontSize: 12, fontWeight: 950 }}>Budget pressure proxy</div>
                    <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, lineHeight: 1.45, marginTop: 5 }}>Derived from active warnings, evidence gaps, and P0/P1 risk count. This is a visual routing gauge, not a billing system.</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {data.commandBridge.crewLanes.map(lane => (
                        <span key={lane.id} style={{ border: '1px solid rgba(148,163,184,0.16)', borderRadius: 18, padding: '5px 7px', color: lane.health === 'ok' ? '#86efac' : '#fbbf24', background: 'rgba(15,23,42,0.52)', fontSize: 10, fontWeight: 900 }}>
                          {lane.displayName}: {lane.quotaStatus}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
                <h2 style={{ margin: '0 0 10px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>Blockers / Approvals</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.commandBridge.approvalInbox.slice(0, 3).map(item => (
                    <div key={item.id} style={{ border: '1px solid rgba(245,158,11,0.24)', background: 'rgba(245,158,11,0.08)', borderRadius: 18, padding: 9 }}>
                      <div style={{ color: '#fbbf24', fontSize: 11, fontWeight: 950 }}>{item.issueId || item.lane} / {item.risk}</div>
                      <div style={{ color: 'var(--color-surface)', fontSize: 12, fontWeight: 850, marginTop: 3 }}>{item.title}</div>
                      <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.35, marginTop: 4 }}>{item.requestedAction}</div>
                    </div>
                  ))}
                  {data.commandBridge.approvalInbox.length === 0 && <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 12 }}>No command blockers in the current queue.</div>}
                </div>
              </div>
              <div style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
                <h2 style={{ margin: '0 0 10px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>Evidence Receipts</h2>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.commandBridge.receipts.slice(0, 3).map(receipt => (
                    <div key={receipt.taskId} style={{ border: '1px solid rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.07)', borderRadius: 18, padding: 9 }}>
                      <div style={{ color: '#86efac', fontSize: 11, fontWeight: 950 }}>{receipt.taskId} / {receipt.verificationStatus}</div>
                      <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.35, marginTop: 4 }}>{receipt.blockerSummary || 'Receipt shell ready for prompt, commit, tests, and artifact proof.'}</div>
                    </div>
                  ))}
                  {data.commandBridge.receipts.length === 0 && <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 12 }}>No receipts captured yet.</div>}
                </div>
              </div>
            </section>
          </div>
        </section>

        <section className="war-room-catalog-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 10, marginBottom: 12 }}>
          <div style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
            <h2 style={{ margin: '0 0 10px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>Mission Board / Signal Flags</h2>
            <div className="war-room-mission-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {data.commandBridge.missions.map(mission => (
                <details key={mission.id} style={{ border: '1px solid rgba(148,163,184,0.14)', background: mission.enabled ? 'rgba(20,184,166,0.1)' : 'rgba(15,23,42,0.5)', borderRadius: 18, padding: 9 }}>
                  <summary style={{ listStyle: 'none', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <div style={{ color: 'var(--color-surface)', fontSize: 12, fontWeight: 900, lineHeight: 1.25 }}>{mission.name}</div>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: mission.enabled ? '#22c55e' : '#f59e0b', boxShadow: mission.enabled ? '0 0 10px rgba(34,197,94,0.45)' : '0 0 10px rgba(245,158,11,0.35)', flexShrink: 0 }} />
                    </div>
                    <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, marginTop: 4 }}>{mission.schedule}</div>
                  </summary>
                  <div style={{ color: '#fbbf24', fontSize: 11, fontWeight: 900, marginTop: 8 }}>{mission.enabled ? 'Enabled' : 'Disabled / no autonomous execution'}</div>
                  <div style={{ color: 'var(--bos-color-ink-disabled)', fontSize: 11, lineHeight: 1.35, marginTop: 5 }}>Owner: {mission.ownerAgent}. Approval required: {mission.approvalRequired ? 'yes' : 'no'}.</div>
                </details>
              ))}
            </div>
          </div>
          <div style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
            <h2 style={{ margin: '0 0 10px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>Permanent Agents</h2>
            <div className="war-room-agent-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {data.commandBridge.agents.map(agent => (
                <div key={agent.id} style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(15,23,42,0.5)', borderRadius: 18, padding: 9 }}>
                  <div style={{ color: '#67e8f9', fontSize: 12, fontWeight: 950 }}>{agent.title}</div>
                  <div style={{ color: agent.status === 'disabled' ? '#fbbf24' : '#cbd5e1', fontSize: 11, fontWeight: 850, marginTop: 3 }}>{agent.status}</div>
                  <div style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 11, lineHeight: 1.35, marginTop: 5 }}>{agent.currentFocus}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {selectedIssue && (
          <section style={{
            border: '1px solid rgba(94,234,212,0.26)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.88), rgba(8,47,73,0.64))',
            borderRadius: 18,
            padding: 18,
            marginBottom: 12,
            boxShadow: '0 18px 60px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}>
            <div className="war-room-selected-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ color: '#67e8f9', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14, fontWeight: 950 }}>{selectedIssue.id}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: riskColor(selectedIssue.risk), boxShadow: `0 0 16px ${riskColor(selectedIssue.risk)}` }} />
                </div>
                <h2 style={{ color: 'var(--color-surface)', fontSize: 24, lineHeight: 1.15, margin: '0 0 12px', fontWeight: 950 }}>{selectedIssue.title}</h2>
                <IssuePills issue={selectedIssue} />
                <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.55, margin: '16px 0 0', maxWidth: 900 }}>
                  {selectedIssue.latestCommentSummary || 'No comment or evidence summary has been captured for this issue yet.'}
                </p>
              </div>
              <div style={{ display: 'grid', gap: 8, minWidth: 190 }}>
                <a href={selectedIssue.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', textAlign: 'center', borderRadius: 18, padding: '10px 12px', color: '#04111f', background: 'linear-gradient(135deg,#67e8f9,#2dd4bf)', fontWeight: 950, fontSize: 13 }}>Review / Act</a>
                <button
                  type="button"
                  data-war-room-action="prepare-dispatch"
                  disabled={!dispatchReady}
                  onClick={() => {
                    if (!selectedIssue || !dispatchReady) return;
                    setDispatchIssueId(selectedIssue.id);
                    setCopyStatus('idle');
                  }}
                  title={dispatchReady ? 'Generate a copy-ready Codex dispatch prompt' : 'Dispatch prompts are enabled for Ready for Codex issues with complete issue metadata.'}
                  style={{
                    borderRadius: 18,
                    padding: '10px 12px',
                    color: dispatchReady ? '#06121f' : 'var(--bos-color-ink-disabled)',
                    background: dispatchReady ? 'linear-gradient(135deg,var(--color-surface),#a7f3d0)' : 'rgba(148,163,184,0.08)',
                    border: dispatchReady ? '1px solid rgba(167,243,208,0.5)' : '1px solid rgba(148,163,184,0.16)',
                    fontWeight: 900,
                    cursor: dispatchReady ? 'pointer' : 'not-allowed',
                  }}
                >
                  Prepare Dispatch
                </button>
                <a href={selectedIssue.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', textAlign: 'center', borderRadius: 18, padding: '10px 12px', color: '#ccfbf1', background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.28)', fontWeight: 900, fontSize: 13 }}>Open Linear</a>
                <button disabled style={{ borderRadius: 18, padding: '10px 12px', color: 'var(--bos-color-ink-disabled)', background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.16)', fontWeight: 900 }}>Mark Needs Evidence</button>
              </div>
            </div>
          </section>
        )}

        {dispatchIssue && (
          <section style={{
            border: '1px solid rgba(94,234,212,0.28)',
            background: 'rgba(3,10,20,0.82)',
            borderRadius: 18,
            padding: 16,
            marginBottom: 12,
            boxShadow: '0 16px 50px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 12, alignItems: 'start', marginBottom: 12 }}>
              <div>
                <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
                  Codex Dispatch Prompt
                </div>
                <h2 style={{ color: 'var(--color-surface)', margin: 0, fontSize: 18, lineHeight: 1.25, fontWeight: 950 }}>
                  {dispatchIssue.id}: {dispatchIssue.title}
                </h2>
                <p style={{ color: 'var(--bos-color-ink-tertiary)', fontSize: 12, lineHeight: 1.5, margin: '8px 0 0' }}>
                  Read-only prompt generation. Copy this into Codex; BanyanOS does not execute the dispatch or write to Linear.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  onClick={copyDispatchPrompt}
                  style={{
                    border: '1px solid rgba(94,234,212,0.44)',
                    background: 'linear-gradient(135deg,#67e8f9,#2dd4bf)',
                    color: '#04111f',
                    borderRadius: 18,
                    padding: '9px 12px',
                    fontSize: 12,
                    fontWeight: 950,
                    cursor: 'pointer',
                  }}
                >
                  Copy Prompt
                </button>
                <button
                  onClick={() => {
                    setDispatchIssueId(null);
                    setCopyStatus('idle');
                  }}
                  style={{
                    border: '1px solid rgba(148,163,184,0.18)',
                    background: 'rgba(15,23,42,0.66)',
                    color: '#cbd5e1',
                    borderRadius: 18,
                    padding: '9px 12px',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 20, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: copyStatus === 'copied' ? '#22c55e' : copyStatus === 'failed' ? '#f59e0b' : '#38bdf8' }} />
              <span style={{ color: copyStatus === 'failed' ? '#fbbf24' : 'var(--bos-color-ink-tertiary)', fontSize: 12, fontWeight: 800 }}>
                {copyStatus === 'copied' && 'Prompt copied to clipboard.'}
                {copyStatus === 'failed' && 'Clipboard blocked. Select the prompt text below and copy manually.'}
                {copyStatus === 'idle' && 'Fallback copy block is always visible below.'}
              </span>
            </div>
            <textarea
              readOnly
              value={dispatchPrompt}
              aria-label={`Dispatch prompt for ${dispatchIssue.id}`}
              style={{
                width: '100%',
                minHeight: 320,
                resize: 'vertical',
                border: '1px solid rgba(148,163,184,0.2)',
                background: 'rgba(2,6,23,0.82)',
                color: '#dbeafe',
                borderRadius: 18,
                padding: 14,
                fontSize: 12,
                lineHeight: 1.55,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </section>
        )}

        <section className="war-room-column-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
          <Column title="Needs Command Decision" issues={commandDecision} selectedId={selectedId} onSelect={selectIssue} />
          <Column title="Captain's Triage" issues={triage} selectedId={selectedId} onSelect={selectIssue} />
          <Column title="Ready to Execute" issues={ready} selectedId={selectedId} onSelect={selectIssue} />
          <Column title="XO Review" issues={xoReview} selectedId={selectedId} onSelect={selectIssue} />
        </section>

        <section className="war-room-bottom-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12 }}>
          {[
            ['Recently Completed', data.recentlyCompleted],
            ['Up Next', data.upNext],
          ].map(([title, issues]) => (
            <div key={title as string} style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
              <h2 style={{ margin: '0 0 12px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>{title as string}</h2>
              <div style={{ display: 'grid', gap: 9 }}>
                {(issues as WarRoomIssue[]).slice(0, 5).map(issue => (
                  <button key={issue.id} onClick={() => selectIssue(issue)} style={{ textAlign: 'left', background: 'transparent', border: 'none', padding: 0, color: '#cbd5e1', cursor: 'pointer' }}>
                    <span style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{issue.id}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginTop: 2 }}>{issue.title}</span>
                    <span style={{ display: 'block', color: 'var(--bos-color-ink-disabled)', fontSize: 11, marginTop: 2 }}>{formatDate(issue.completedAt || issue.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{ border: '1px solid rgba(148,163,184,0.14)', background: 'rgba(8,20,32,0.72)', borderRadius: 18, padding: 14 }}>
            <h2 style={{ margin: '0 0 12px', color: 'var(--color-surface)', fontSize: 14, fontWeight: 950 }}>Bridge Communications</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {data.bridgeCommunications.map(note => (
                <button key={`${note.issueId}-${note.updatedAt}`} onClick={() => {
                  setSelectedId(note.issueId);
                  setCopyStatus('idle');
                }} style={{ textAlign: 'left', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 18, padding: 10, background: 'rgba(15,23,42,0.5)', color: '#cbd5e1', cursor: 'pointer' }}>
                  <div style={{ color: '#67e8f9', fontSize: 11, fontWeight: 950, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginBottom: 4 }}>{note.issueId}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.45 }}>{note.note}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 18, border: '1px solid rgba(45,212,191,0.16)', background: 'rgba(20,184,166,0.06)', borderRadius: 18, padding: '10px 12px', color: 'var(--bos-color-ink-tertiary)', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>Safe command surface. Visual Acceptance Scan required for War Room UI proof. Intake can create Linear issues only through the authenticated route; no agents, shell commands, or production writes run from War Room.</span>
          <span>Updated {formatDate(data.generatedAt)} from {data.source === 'linear' ? 'Linear' : 'typed fixtures'}.</span>
        </footer>
      </main>
    </div>
  );
}
