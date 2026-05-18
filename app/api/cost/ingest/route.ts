/**
 * POST /api/cost/ingest
 *
 * Cloud relay endpoint. Kai on the Mac mini polls three lanes and POSTs to
 * this endpoint:
 *
 *   - Usage  (60s cron, OAuth)         → snapshot_type: 'usage'
 *   - Spend  (5min cron, Admin API)    → snapshot_type: 'spend'
 *   - Billed (4hr cron, Gmail scrub)   → snapshot_type: 'billed'
 *
 * v1 backward compat: bodies without a snapshot_type field are interpreted
 * as the legacy LiveClaudeSnapshot shape so the v1 relay keeps working
 * during rollout.
 *
 * Auth: Bearer token against BANYAN_COST_INGEST_SECRET. No NextAuth session
 * required — this is a server-to-server channel.
 */

import { NextResponse } from 'next/server';
import { writeLiveClaudeSnapshot } from '@/lib/cost/liveClaudeSnapshot';
import { writeUsageSnapshot } from '@/lib/cost/liveUsageSnapshot';
import { writeSpendSnapshot } from '@/lib/cost/liveSpendSnapshot';
import { writeBilledSnapshot } from '@/lib/cost/liveBilledSnapshot';
import type {
  ApiSpendSnapshot,
  ApiSpendScope,
  BilledSnapshot,
  CostProvider,
  LiveClaudeExtraUsage,
  LiveClaudeSnapshot,
  SnapshotType,
  UsageSnapshot,
  UsageWindow,
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const envelope = body as { snapshot_type?: unknown; payload?: unknown };
  const now = new Date();

  // v2 path — explicit snapshot_type
  if (typeof envelope.snapshot_type === 'string') {
    return handleV2Envelope(envelope.snapshot_type, envelope.payload, now);
  }

  // v1 path — legacy LiveClaudeSnapshot at the body root
  return handleLegacyLiveClaude(body, now);
}

async function handleV2Envelope(
  snapshotType: string,
  payload: unknown,
  now: Date,
): Promise<NextResponse> {
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'envelope payload must be a JSON object' }, { status: 400 });
  }

  if (snapshotType === 'usage') {
    const parsed = parseUsageSnapshot(payload as Record<string, unknown>);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeUsageSnapshot(parsed.snapshot, now);

    // v1 alias: when an Anthropic usage snapshot arrives, also keep the
    // legacy LiveClaudeSnapshot cache hot so existing readers see the same data.
    if (parsed.snapshot.provider === 'anthropic') {
      await writeLiveClaudeSnapshot(toLegacySnapshot(parsed.snapshot), now);
    }

    return NextResponse.json({
      ok: true,
      storedAt: result.storedAt,
      snapshot_type: 'usage' satisfies SnapshotType,
    });
  }

  if (snapshotType === 'spend') {
    const parsed = parseSpendSnapshot(payload as Record<string, unknown>);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeSpendSnapshot(parsed.snapshot, now);
    return NextResponse.json({
      ok: true,
      storedAt: result.storedAt,
      snapshot_type: 'spend' satisfies SnapshotType,
    });
  }

  if (snapshotType === 'billed') {
    const parsed = parseBilledSnapshot(payload as Record<string, unknown>);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const result = await writeBilledSnapshot(parsed.snapshot, now);
    return NextResponse.json({
      ok: true,
      storedAt: result.storedAt,
      snapshot_type: 'billed' satisfies SnapshotType,
      duplicate: result.duplicate,
    });
  }

  return NextResponse.json({ error: `unknown snapshot_type: ${snapshotType}` }, { status: 400 });
}

async function handleLegacyLiveClaude(body: unknown, now: Date): Promise<NextResponse> {
  const parsed = parseLiveClaudeSnapshotBody(body as Record<string, unknown>);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const result = await writeLiveClaudeSnapshot(parsed.snapshot, now);
  return NextResponse.json({ ok: true, storedAt: result.storedAt });
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 parsers
// ─────────────────────────────────────────────────────────────────────────────

type ParseUsage = { snapshot: UsageSnapshot } | { error: string };
type ParseSpend = { snapshot: ApiSpendSnapshot } | { error: string };
type ParseBilled = { snapshot: BilledSnapshot } | { error: string };

function parseUsageSnapshot(payload: Record<string, unknown>): ParseUsage {
  const provider = asProvider(payload.provider);
  if (!provider) return { error: 'provider must be "anthropic" or "openai"' };

  const currentSession = asUsageWindow(payload.currentSession, 'currentSession');
  if ('error' in currentSession) return { error: currentSession.error };

  const weeklyLimit = asUsageWindow(payload.weeklyLimit, 'weeklyLimit');
  if ('error' in weeklyLimit) return { error: weeklyLimit.error };

  let claudeDesign: UsageWindow | null | undefined;
  if (payload.claudeDesign === null || payload.claudeDesign === undefined) {
    claudeDesign = payload.claudeDesign === null ? null : undefined;
  } else {
    const parsed = asUsageWindow(payload.claudeDesign, 'claudeDesign');
    if ('error' in parsed) return { error: parsed.error };
    claudeDesign = parsed.window;
  }

  let extraUsage: LiveClaudeExtraUsage | null | undefined;
  if (payload.extraUsage === null || payload.extraUsage === undefined) {
    extraUsage = payload.extraUsage === null ? null : undefined;
  } else {
    const extra = payload.extraUsage as Record<string, unknown>;
    const used = extra.used;
    const limit = extra.limit;
    if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) {
      return { error: 'extraUsage.used must be a non-negative number' };
    }
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
      return { error: 'extraUsage.limit must be a non-negative number' };
    }
    extraUsage = { used, limit };
  }

  if (typeof payload.fetchedAt !== 'string' || !isIso8601(payload.fetchedAt)) {
    return { error: 'fetchedAt must be ISO 8601' };
  }
  if (typeof payload.sourceApp !== 'string' || payload.sourceApp.trim().length === 0) {
    return { error: 'sourceApp must be a non-empty string' };
  }

  return {
    snapshot: {
      provider,
      currentSession: currentSession.window,
      weeklyLimit: weeklyLimit.window,
      claudeDesign,
      extraUsage,
      fetchedAt: payload.fetchedAt,
      sourceApp: payload.sourceApp.trim(),
    },
  };
}

function parseSpendSnapshot(payload: Record<string, unknown>): ParseSpend {
  const provider = asProvider(payload.provider);
  if (!provider) return { error: 'provider must be "anthropic" or "openai"' };

  const scope = payload.scope;
  if (scope !== 'today' && scope !== 'week' && scope !== 'month') {
    return { error: 'scope must be one of "today" | "week" | "month"' };
  }

  if (typeof payload.amountUsd !== 'number' || !Number.isFinite(payload.amountUsd) || payload.amountUsd < 0) {
    return { error: 'amountUsd must be a non-negative number' };
  }
  if (typeof payload.fetchedAt !== 'string' || !isIso8601(payload.fetchedAt)) {
    return { error: 'fetchedAt must be ISO 8601' };
  }

  return {
    snapshot: {
      provider,
      scope: scope as ApiSpendScope,
      amountUsd: payload.amountUsd,
      fetchedAt: payload.fetchedAt,
    },
  };
}

function parseBilledSnapshot(payload: Record<string, unknown>): ParseBilled {
  const provider = asProvider(payload.provider);
  if (!provider) return { error: 'provider must be "anthropic" or "openai"' };

  if (typeof payload.period !== 'string' || payload.period.length === 0) {
    return { error: 'period must be a non-empty string' };
  }
  if (typeof payload.amountUsd !== 'number' || !Number.isFinite(payload.amountUsd) || payload.amountUsd < 0) {
    return { error: 'amountUsd must be a non-negative number' };
  }
  if (payload.source !== 'gmail') {
    return { error: 'source must equal "gmail"' };
  }
  if (typeof payload.emailId !== 'string' || payload.emailId.length === 0) {
    return { error: 'emailId must be a non-empty string' };
  }
  if (typeof payload.fetchedAt !== 'string' || !isIso8601(payload.fetchedAt)) {
    return { error: 'fetchedAt must be ISO 8601' };
  }

  return {
    snapshot: {
      provider,
      period: payload.period,
      amountUsd: payload.amountUsd,
      source: 'gmail',
      emailId: payload.emailId,
      fetchedAt: payload.fetchedAt,
    },
  };
}

function asUsageWindow(value: unknown, field: string): { window: UsageWindow } | { error: string } {
  if (!value || typeof value !== 'object') return { error: `${field} must be an object` };
  const v = value as Record<string, unknown>;
  if (typeof v.pct !== 'number' || !Number.isFinite(v.pct) || v.pct < 0 || v.pct > 100) {
    return { error: `${field}.pct must be a number 0-100` };
  }
  let resetsAt: string | null = null;
  if (v.resetsAt !== null && v.resetsAt !== undefined) {
    if (typeof v.resetsAt !== 'string' || !isIso8601(v.resetsAt)) {
      return { error: `${field}.resetsAt must be ISO 8601 or null` };
    }
    resetsAt = v.resetsAt;
  }
  const label = typeof v.label === 'string' ? v.label : undefined;
  return { window: { pct: v.pct, resetsAt, label } };
}

function asProvider(value: unknown): CostProvider | null {
  return value === 'anthropic' || value === 'openai' ? value : null;
}

function toLegacySnapshot(usage: UsageSnapshot): LiveClaudeSnapshot {
  return {
    sessionPct: usage.currentSession.pct,
    weeklyPct: usage.weeklyLimit.pct,
    opusPct: usage.claudeDesign?.pct ?? null,
    extraUsageDollars: usage.extraUsage ?? null,
    resetSessionAt: usage.currentSession.resetsAt,
    resetWeeklyAt: usage.weeklyLimit.resetsAt,
    sourceApp: usage.sourceApp,
    capturedAt: usage.fetchedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// v1 parser (unchanged behavior — body has no snapshot_type)
// ─────────────────────────────────────────────────────────────────────────────

type ParseLegacyResult = { snapshot: LiveClaudeSnapshot } | { error: string };

function parseLiveClaudeSnapshotBody(body: Record<string, unknown>): ParseLegacyResult {
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
