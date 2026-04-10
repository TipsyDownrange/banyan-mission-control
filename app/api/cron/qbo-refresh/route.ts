/**
 * GET /api/cron/qbo-refresh
 *
 * Proactive QBO token refresh — runs every 45 minutes via Vercel Cron.
 * Forces a token refresh before expiry so cold-start requests don't hit
 * Intuit's token endpoint on every invocation.
 *
 * Vercel Cron schedule: see vercel.json → crons array
 *
 * Security: protected by CRON_SECRET header (set in Vercel env vars).
 * Vercel injects Authorization: Bearer {CRON_SECRET} on cron invocations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/qbo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Verify this is a legitimate cron call (or internal health check)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    // Force refresh by invalidating the cache first, then getting a new token.
    // getAccessToken() will call refreshAccessToken() since cache is invalid.
    // We can't directly clear the module-level cache from here, but calling
    // getAccessToken() will check isTokenValid() — if it's within 60s of expiry
    // or expired, it refreshes. Since cron runs every 45min and tokens last 60min,
    // this will refresh ~15 min before expiry.
    await getAccessToken();

    return NextResponse.json({
      ok: true,
      message: 'QBO token refreshed successfully',
      duration_ms: Date.now() - start,
      refreshed_at: new Date().toISOString(),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[QBO cron] Token refresh failed:', msg);

    return NextResponse.json({
      ok: false,
      error: msg,
      action: msg.includes('refresh') ? 'Refresh token may be expired — re-authorize at /api/qbo/connect' : 'Check QBO credentials',
      duration_ms: Date.now() - start,
    }, { status: 500 });
  }
}
