/**
 * POST /api/cost/ingest
 *
 * Mac mini relay endpoint. Three payload shapes are accepted, dispatched on
 * `snapshot_type`:
 *
 *   1. v1 LiveClaudeSnapshot (legacy, no snapshot_type OR "usage_legacy"):
 *        { sessionPct, weeklyPct, opusPct, extraUsageDollars,
 *          resetSessionAt, resetWeeklyAt, sourceApp, capturedAt }
 *
 *   2. v2 usage:
 *        { snapshot_type: "usage", provider: "anthropic"|"openai",
 *          currentSession: { percentage, resetsAt },
 *          weeklyLimit:    { percentage, resetsAt },
 *          claudeDesign?:  { percentage, resetsAt },
 *          extraUsage?:    { usedUsd, budgetUsd, resetsAt },
 *          fetchedAt }
 *
 *   3. v2 spend:
 *        { snapshot_type: "spend", provider: "anthropic"|"openai",
 *          scope: "today"|"week"|"month", amountUsd, fetchedAt }
 *
 * Auth: Bearer BANYAN_COST_INGEST_SECRET (unchanged from v1).
 * Backward compat is P0 — Kai's deployed relays MUST keep getting 200s.
 */

import { NextResponse } from 'next/server';
import { writeLiveClaudeSnapshot } from '@/lib/cost/liveClaudeSnapshot';
import { writeUsageSnapshot } from '@/lib/cost/liveUsageSnapshot';
import { writeSpendSnapshot } from '@/lib/cost/liveSpendSnapshot';
import type {
  ApiSpendSnapshot,
  CostProvider,
  ExtraUsageWindow,
  LiveClaudeExtraUsage,
  LiveClaudeSnapshot,
  QuotaWindow,
  SpendScope,
  UsageSnapshot,
} from '@/lib/cost/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.BANYAN_COST_INGEST_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'BANYAN_COST_INGEST_SECRET not configured' },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match || match[1].trim() !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const snapshotType = typeof body.snapshot_type === 'string' ? body.snapshot_type : undefined;
  const now = new Date();

  if (snapshotType === 'usage') {
    const parsed = parseUsageBody(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeUsageSnapshot(parsed.snapshot, now);
    console.log('[cost/ingest] stored usage', { provider: parsed.snapshot.provider, fetchedAt: parsed.snapshot.fetchedAt, storedAt: result.storedAt });
    return NextResponse.json({ ok: true, snapshotType: 'usage', provider: parsed.snapshot.provider, storedAt: result.storedAt });
  }

  if (snapshotType === 'spend') {
    const parsed = parseSpendBody(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeSpendSnapshot(parsed.snapshot, now);
    console.log('[cost/ingest] stored spend', { provider: parsed.snapshot.provider, scope: parsed.snapshot.scope, amountUsd: parsed.snapshot.amountUsd, storedAt: result.storedAt });
    return NextResponse.json({ ok: true, snapshotType: 'spend', provider: parsed.snapshot.provider, scope: parsed.snapshot.scope, storedAt: result.storedAt });
  }

  if (snapshotType !== undefined && snapshotType !== 'usage_legacy') {
    return NextResponse.json({ error: `Unknown snapshot_type: ${snapshotType}` }, { status: 400 });
  }

  // Fall through to v1 path: legacy or explicit "usage_legacy".
  if (!('sessionPct' in body) && snapshotType !== 'usage_legacy') {
    return NextResponse.json({ error: 'Missing snapshot_type or v1 sessionPct field' }, { status: 400 });
  }

  const parsed = parseLiveClaudeSnapshotBody(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const result = await writeLiveClaudeSnapshot(parsed.snapshot, now);
  console.log('[cost/ingest] stored snapshot', {
    sourceApp: parsed.snapshot.sourceApp,
    capturedAt: parsed.snapshot.capturedAt,
    storedAt: result.storedAt,
    sessionPct: parsed.snapshot.sessionPct,
    weeklyPct: parsed.snapshot.weeklyPct,
  });
  return NextResponse.json({ ok: true, storedAt: result.storedAt });
}

// ── v1 (legacy) parser ──────────────────────────────────────────────────────

type ParseV1Result = { snapshot: LiveClaudeSnapshot } | { error: string };

function parseLiveClaudeSnapshotBody(body: Record<string, unknown>): ParseV1Result {
  const sessionPct = asPercent(body.sessionPct);
  if (sessionPct === null) return { error: 'sessionPct must be a number 0-100' };

  const weeklyPct = asPercent(body.weeklyPct);
  if (weeklyPct === null) return { error: 'weeklyPct must be a number 0-100' };

  const opusPct = body.opusPct === null || body.opusPct === undefined
    ? null
    : asPercent(body.opusPct);
  if (opusPct === null && body.opusPct !== null && body.opusPct !== undefined) {
    return { error: 'opusPct must be a number 0-100 or null' };
  }

  let extraUsageDollars: LiveClaudeExtraUsage | null = null;
  if (body.extraUsageDollars !== null && body.extraUsageDollars !== undefined) {
    const extra = body.extraUsageDollars;
    if (typeof extra !== 'object' || Array.isArray(extra)) {
      return { error: 'extraUsageDollars must be { used, limit } or null' };
    }
    const used = (extra as { used?: unknown }).used;
    const limit = (extra as { limit?: unknown }).limit;
    if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) {
      return { error: 'extraUsageDollars.used must be a non-negative number' };
    }
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
      return { error: 'extraUsageDollars.limit must be a non-negative number' };
    }
    extraUsageDollars = { used, limit };
  }

  const resetSessionAt = asIsoOrNull(body.resetSessionAt);
  if (resetSessionAt === false) return { error: 'resetSessionAt must be ISO 8601 or null' };

  const resetWeeklyAt = asIsoOrNull(body.resetWeeklyAt);
  if (resetWeeklyAt === false) return { error: 'resetWeeklyAt must be ISO 8601 or null' };

  if (typeof body.sourceApp !== 'string' || body.sourceApp.trim().length === 0) {
    return { error: 'sourceApp must be a non-empty string' };
  }

  if (typeof body.capturedAt !== 'string' || !isIso8601(body.capturedAt)) {
    return { error: 'capturedAt must be ISO 8601' };
  }

  return {
    snapshot: {
      sessionPct,
      weeklyPct,
      opusPct,
      extraUsageDollars,
      resetSessionAt,
      resetWeeklyAt,
      sourceApp: body.sourceApp.trim(),
      capturedAt: body.capturedAt,
    },
  };
}

// ── v2 usage parser ─────────────────────────────────────────────────────────

type ParseUsageResult = { snapshot: UsageSnapshot } | { error: string };

function parseUsageBody(body: Record<string, unknown>): ParseUsageResult {
  const provider = asProvider(body.provider);
  if (!provider) return { error: 'provider must be "anthropic" or "openai"' };

  const currentSession = asQuotaWindow(body.currentSession);
  if (!currentSession) return { error: 'currentSession must be { percentage:0-100, resetsAt:ISO|null }' };

  const weeklyLimit = asQuotaWindow(body.weeklyLimit);
  if (!weeklyLimit) return { error: 'weeklyLimit must be { percentage:0-100, resetsAt:ISO|null }' };

  let claudeDesign: QuotaWindow | null | undefined = undefined;
  if (body.claudeDesign !== undefined) {
    if (body.claudeDesign === null) {
      claudeDesign = null;
    } else {
      const cd = asQuotaWindow(body.claudeDesign);
      if (!cd) return { error: 'claudeDesign must be { percentage:0-100, resetsAt:ISO|null } or null' };
      claudeDesign = cd;
    }
  }

  let extraUsage: ExtraUsageWindow | null | undefined = undefined;
  if (body.extraUsage !== undefined) {
    if (body.extraUsage === null) {
      extraUsage = null;
    } else {
      const eu = asExtraUsage(body.extraUsage);
      if (!eu) return { error: 'extraUsage must be { usedUsd, budgetUsd, resetsAt:ISO|null } or null' };
      extraUsage = eu;
    }
  }

  if (typeof body.fetchedAt !== 'string' || !isIso8601(body.fetchedAt)) {
    return { error: 'fetchedAt must be ISO 8601' };
  }

  return {
    snapshot: {
      snapshot_type: 'usage',
      provider,
      currentSession,
      weeklyLimit,
      ...(claudeDesign !== undefined ? { claudeDesign } : {}),
      ...(extraUsage !== undefined ? { extraUsage } : {}),
      fetchedAt: body.fetchedAt,
    },
  };
}

// ── v2 spend parser ─────────────────────────────────────────────────────────

type ParseSpendResult = { snapshot: ApiSpendSnapshot } | { error: string };

function parseSpendBody(body: Record<string, unknown>): ParseSpendResult {
  const provider = asProvider(body.provider);
  if (!provider) return { error: 'provider must be "anthropic" or "openai"' };

  const scope = asScope(body.scope);
  if (!scope) return { error: 'scope must be "today", "week", or "month"' };

  if (typeof body.amountUsd !== 'number' || !Number.isFinite(body.amountUsd) || body.amountUsd < 0) {
    return { error: 'amountUsd must be a non-negative number' };
  }

  if (typeof body.fetchedAt !== 'string' || !isIso8601(body.fetchedAt)) {
    return { error: 'fetchedAt must be ISO 8601' };
  }

  return {
    snapshot: {
      snapshot_type: 'spend',
      provider,
      scope,
      amountUsd: body.amountUsd,
      fetchedAt: body.fetchedAt,
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function asProvider(value: unknown): CostProvider | null {
  return value === 'anthropic' || value === 'openai' ? value : null;
}

function asScope(value: unknown): SpendScope | null {
  return value === 'today' || value === 'week' || value === 'month' ? value : null;
}

function asQuotaWindow(value: unknown): QuotaWindow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as { percentage?: unknown; resetsAt?: unknown };
  const pct = asPercent(obj.percentage);
  if (pct === null) return null;
  const resetsAt = asIsoOrNull(obj.resetsAt);
  if (resetsAt === false) return null;
  return { percentage: pct, resetsAt };
}

function asExtraUsage(value: unknown): ExtraUsageWindow | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as { usedUsd?: unknown; budgetUsd?: unknown; resetsAt?: unknown };
  if (typeof obj.usedUsd !== 'number' || !Number.isFinite(obj.usedUsd) || obj.usedUsd < 0) return null;
  if (typeof obj.budgetUsd !== 'number' || !Number.isFinite(obj.budgetUsd) || obj.budgetUsd < 0) return null;
  const resetsAt = asIsoOrNull(obj.resetsAt);
  if (resetsAt === false) return null;
  return { usedUsd: obj.usedUsd, budgetUsd: obj.budgetUsd, resetsAt };
}

function asPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

function asIsoOrNull(value: unknown): string | null | false {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !isIso8601(value)) return false;
  return value;
}

function isIso8601(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false;
  const t = Date.parse(value);
  return Number.isFinite(t);
}
