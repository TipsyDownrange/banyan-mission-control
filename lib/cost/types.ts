/**
 * Cost & Usage Live Tracking
 *
 * v1 (LiveClaudeSnapshot): legacy "Usage for Claude Dashboard" payload retained
 * for backward compat with currently-deployed Mac mini relays.
 *
 * v2: snapshot_type-discriminated payloads. UsageSnapshot is per-provider live
 * subscription utilization; ApiSpendSnapshot is per-provider per-scope
 * cumulative API dollar spend; AggregatedBilled rolls Gmail-scraped subscription
 * invoices into trailing windows.
 */

// ── v1 (legacy) ─────────────────────────────────────────────────────────────

export interface LiveClaudeExtraUsage {
  used: number;
  limit: number;
}

export interface LiveClaudeSnapshot {
  sessionPct: number;
  weeklyPct: number;
  opusPct: number | null;
  extraUsageDollars: LiveClaudeExtraUsage | null;
  resetSessionAt: string | null;
  resetWeeklyAt: string | null;
  sourceApp: string;
  capturedAt: string;
}

// ── v2 usage ────────────────────────────────────────────────────────────────

export type CostProvider = 'anthropic' | 'openai';

export interface QuotaWindow {
  percentage: number;
  resetsAt: string | null;
}

export interface ExtraUsageWindow {
  usedUsd: number;
  budgetUsd: number;
  resetsAt: string | null;
}

export interface UsageSnapshot {
  snapshot_type: 'usage';
  provider: CostProvider;
  currentSession: QuotaWindow;
  weeklyLimit: QuotaWindow;
  claudeDesign?: QuotaWindow | null;
  extraUsage?: ExtraUsageWindow | null;
  fetchedAt: string;
}

// ── v2 spend ────────────────────────────────────────────────────────────────

export type SpendScope = 'today' | 'week' | 'month';

export interface ApiSpendSnapshot {
  snapshot_type: 'spend';
  provider: CostProvider;
  scope: SpendScope;
  amountUsd: number;
  fetchedAt: string;
}

// ── Billed-to-date (Gmail-scraped subscription invoices) ────────────────────

export interface AggregatedBilled {
  last30d: number;
  thisMonth: number;
  trailing12mo: number;
  asOf: string;
}
