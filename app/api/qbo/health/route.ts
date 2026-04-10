/**
 * GET /api/qbo/health
 *
 * Checks QBO connectivity and token status. Returns a clear status string
 * so the UI can show a meaningful indicator without exposing token details.
 *
 * Status values:
 *   healthy          — access token valid, QBO reachable, company query succeeded
 *   token_expired    — no valid access token but refresh token exists (will auto-fix on next request)
 *   refresh_expired  — refresh token missing or Intuit rejected it (needs re-auth via /api/qbo/connect)
 *   unreachable      — token OK but QBO API returned an error or timed out
 *   unconfigured     — env vars missing (QBO_CLIENT_ID, QBO_CLIENT_SECRET, or QBO_REALM_ID)
 */

import { NextResponse } from 'next/server';
import { getAccessToken, qboFetch } from '@/lib/qbo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // Check env vars first
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET || !process.env.QBO_REALM_ID) {
    return NextResponse.json({
      status: 'unconfigured',
      message: 'QBO environment variables not set (QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REALM_ID)',
      checked_at: new Date().toISOString(),
    }, { status: 200 });
  }

  // Try to get a valid access token
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish between "no refresh token" and "refresh failed"
    const isRefreshExpired = msg.includes('No QBO refresh token') || msg.includes('refresh failed') || msg.includes('401');
    return NextResponse.json({
      status: isRefreshExpired ? 'refresh_expired' : 'token_expired',
      message: msg,
      action: isRefreshExpired ? 'Re-authorize at /api/qbo/connect' : 'Will auto-retry on next request',
      checked_at: new Date().toISOString(),
    }, { status: 200 });
  }

  // Token exists — try a lightweight company info query to confirm QBO is reachable
  try {
    const res = await qboFetch('companyinfo/' + process.env.QBO_REALM_ID);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return NextResponse.json({
        status: 'unreachable',
        message: `QBO returned ${res.status}: ${body.slice(0, 200)}`,
        checked_at: new Date().toISOString(),
      }, { status: 200 });
    }

    const data = await res.json();
    const company = data?.CompanyInfo;

    return NextResponse.json({
      status: 'healthy',
      company_name: company?.CompanyName || 'Unknown',
      company_id: company?.Id || process.env.QBO_REALM_ID,
      checked_at: new Date().toISOString(),
    }, { status: 200 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      status: 'unreachable',
      message: msg,
      checked_at: new Date().toISOString(),
    }, { status: 200 });
  }
}
