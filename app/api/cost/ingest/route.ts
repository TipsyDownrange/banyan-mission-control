/**
 * POST /api/cost/ingest
 *
 * Mac mini relay endpoint. Kai polls the "Usage for Claude Dashboard" app
 * locally every ~60s and POSTs a normalized LiveClaudeSnapshot here. We cache
 * in memory for the War Room and best-effort persist to Sheets for history.
 *
 * Auth: Bearer token against BANYAN_COST_INGEST_SECRET. No NextAuth session
 * required — this is a server-to-server channel.
 */

import { NextResponse } from 'next/server';
import { writeLiveClaudeSnapshot } from '@/lib/cost/liveClaudeSnapshot';
import type { LiveClaudeSnapshot, LiveClaudeExtraUsage } from '@/lib/cost/types';

export const dynamic = 'force-dynamic';

interface IngestBody {
  sessionPct?: unknown;
  weeklyPct?: unknown;
  opusPct?: unknown;
  extraUsageDollars?: unknown;
  resetSessionAt?: unknown;
  resetWeeklyAt?: unknown;
  sourceApp?: unknown;
  capturedAt?: unknown;
}

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

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = parseLiveClaudeSnapshotBody(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const now = new Date();
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

type ParseResult = { snapshot: LiveClaudeSnapshot } | { error: string };

function parseLiveClaudeSnapshotBody(body: IngestBody): ParseResult {
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
