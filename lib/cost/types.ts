/**
 * Cost & Usage Live Tracking — Phase 1
 *
 * LiveClaudeSnapshot is the live "spend right now" payload that the Mac mini
 * relay (Kai polling the "Usage for Claude Dashboard" app) POSTs to
 * /api/cost/ingest. It is intentionally separate from the invoice-based
 * /api/cost response: invoice data answers "what have I been billed",
 * snapshot data answers "what is the subscription window doing right now".
 */

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
