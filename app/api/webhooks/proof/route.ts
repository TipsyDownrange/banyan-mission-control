/**
 * BAN-337 Pay Apps v2b — Proof RON webhook stub.
 *
 * Returns 503 until v2.b1 (the Proof Business account hasn't been
 * provisioned, so no webhook subscription exists yet). Any inbound POST is
 * unexpected and is logged for security review.
 */

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // Best-effort capture of source IP + signature header so an unauthorized
  // hit can be triaged out-of-band. We do not parse / trust the body.
  const fwd =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const sig = req.headers.get('x-proof-signature') ?? null;
  console.warn(
    '[BAN-337][proof-webhook] unauthorized hit',
    JSON.stringify({ ip: fwd, has_signature: !!sig }),
  );
  return NextResponse.json(
    {
      error: 'feature_not_available',
      code: 'PROOF_RON_BUSINESS_ACCOUNT_REQUIRED',
      message:
        'Proof RON webhook subscription is not active. v2.b1 will activate this endpoint.',
    },
    { status: 503 },
  );
}
