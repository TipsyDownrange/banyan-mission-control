/**
 * BAN-337 Pay Apps v2b — Proof RON automated notarization stub.
 *
 * Per Amendment 1, the Proof RON API integration is deferred until the
 * v2.b1 packet (requires a $200/mo Proof Business account that is not
 * currently provisioned). This route returns 503 with a stable code so the
 * UI can detect the feature flag without parsing prose.
 *
 * The PRIMARY notarization path is POST /api/pay-apps/[id]/upload-notarized
 * (manual PDF upload + notary metadata).
 */

import { NextResponse } from 'next/server';

const FORWARD_PATH = '/api/pay-apps/[id]/upload-notarized';

export async function POST() {
  return NextResponse.json(
    {
      error: 'feature_not_available',
      code: 'PROOF_RON_BUSINESS_ACCOUNT_REQUIRED',
      message:
        'Proof RON automated notarization requires a Business account that is not currently provisioned. Use POST /api/pay-apps/[id]/upload-notarized for manual notarization upload.',
      forward_to: FORWARD_PATH,
    },
    { status: 503 },
  );
}
