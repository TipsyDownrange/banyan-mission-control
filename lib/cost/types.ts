/**
 * Cost & Usage tracking — Phase 1 v2 (OAuth Cloud Relay)
 *
 * Three snapshot types arrive via /api/cost/ingest from Kai on the Mac mini:
 *
 *   1. UsageSnapshot       — current subscription window utilization
 *                            (Anthropic OAuth /usage, OpenAI Codex equivalent), 60s cron
 *   2. ApiSpendSnapshot    — Admin API rolled-up $ spend (today/week/month), 5min cron
 *   3. BilledSnapshot      — Gmail-scrubbed receipt $ totals, 4hr cron + backfill
 *
 * LiveClaudeSnapshot (v1) is retained as a backward-compat alias of the
 * Anthropic UsageSnapshot lane so existing callers don't break during rollout.
 */

export type CostProvider = 'anthropic' | 'openai';

export type SnapshotType = 'usage' | 'spend' | 'billed';

// ─────────────────────────────────────────────────────────────────────────────
// v1 (retained)
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveClaudeExtraUsage {
  used: number;
  limit: number;
}

export interface LiveClaudeSnapshot {
  /** Session window utilization (0-100). */
  sessionPct: number;
  /** Weekly window utilization (0-100). */
  weeklyPct: number;
  /** Opus / Design model bucket utilization (0-100) when surfaced by the Mac app. */
  opusPct: number | null;
  /** Pay-as-you-go extra usage above the subscription cap. */
  extraUsageDollars: LiveClaudeExtraUsage | null;
  /** ISO 8601 timestamp when the active 5-hour session window resets. */
  resetSessionAt: string | null;
  /** ISO 8601 timestamp when the weekly window resets. */
  resetWeeklyAt: string | null;
  /** Identifier for the upstream Mac app, e.g. "usage-for-claude-dashboard". */
  sourceApp: string;
  /** ISO 8601 timestamp recorded by the Mac app when this sample was taken. */
  capturedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 — Usage lane (subscription window, 60s cron, OAuth)
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageWindow {
  /** Utilization 0-100. */
  pct: number;
  /** ISO 8601 reset timestamp. */
  resetsAt: string | null;
  /** Optional human label for the window. */
  label?: string;
}

export interface UsageSnapshot {
  provider: CostProvider;
  /** Current session window (5h for Anthropic, equivalent for OpenAI). */
  currentSession: UsageWindow;
  /** Weekly subscription limit window. */
  weeklyLimit: UsageWindow;
  /** Anthropic-only: Opus / "Design" model bucket. */
  claudeDesign?: UsageWindow | null;
  /** Pay-as-you-go usage above cap, when surfaced. */
  extraUsage?: LiveClaudeExtraUsage | null;
  /** ISO 8601 when Kai captured the sample. */
  fetchedAt: string;
  /** Identifier for the upstream source app / endpoint. */
  sourceApp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 — Spend lane (Admin API rollups, 5min cron)
// ─────────────────────────────────────────────────────────────────────────────

export type ApiSpendScope = 'today' | 'week' | 'month';

export interface ApiSpendSnapshot {
  provider: CostProvider;
  scope: ApiSpendScope;
  amountUsd: number;
  /** ISO 8601 when Kai captured the sample. */
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 — Billed lane (Gmail scrub, 4hr cron + backfill)
// ─────────────────────────────────────────────────────────────────────────────

export interface BilledSnapshot {
  provider: CostProvider;
  /** ISO 8601 period start (e.g. invoice month start). */
  period: string;
  amountUsd: number;
  source: 'gmail';
  /** Gmail message id the receipt came from (dedupe key). */
  emailId: string;
  /** ISO 8601 when the scrub recorded this receipt. */
  fetchedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingest envelope — POST /api/cost/ingest body shape
// ─────────────────────────────────────────────────────────────────────────────

export interface UsageSnapshotEnvelope {
  snapshot_type: 'usage';
  payload: UsageSnapshot;
}

export interface SpendSnapshotEnvelope {
  snapshot_type: 'spend';
  payload: ApiSpendSnapshot;
}

export interface BilledSnapshotEnvelope {
  snapshot_type: 'billed';
  payload: BilledSnapshot;
}

export type SnapshotEnvelope =
  | UsageSnapshotEnvelope
  | SpendSnapshotEnvelope
  | BilledSnapshotEnvelope;

// ─────────────────────────────────────────────────────────────────────────────
// State machine — per packet §5.1
// ─────────────────────────────────────────────────────────────────────────────

export type RelayState =
  | 'LIVE'
  | 'STALE'
  | 'DEGRADED'
  | 'BROKEN_AUTH'
  | 'BROKEN_SCHEMA'
  | 'NOT_CONFIGURED';

export type RelayErrorKind = 'auth' | 'schema' | 'network' | 'unknown';

export interface RelayLastError {
  kind: RelayErrorKind;
  message: string;
  httpStatus?: number;
  /** Short response body excerpt for diagnostics, capped client-side. */
  responseExcerpt?: string;
  at: string;
}
