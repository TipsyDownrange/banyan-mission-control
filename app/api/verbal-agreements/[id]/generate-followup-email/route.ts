/**
 * BAN-342 PM-V1.0-C — POST /api/verbal-agreements/[id]/generate-followup-email
 */

import { NextResponse } from 'next/server';
import { passVerbalAgreementWriteGate } from '@/lib/pm/verbal-agreements/api-gate';
import { buildVerbalAgreementFollowupEmail } from '@/lib/pm/verbal-agreements/followup-email';
import { getVerbalAgreementForTenant } from '@/lib/pm/verbal-agreements/route-utils';

const ROUTE_PATH = '/api/verbal-agreements/[id]/generate-followup-email';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await passVerbalAgreementWriteGate(req, ROUTE_PATH);
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const row = await getVerbalAgreementForTenant(gate.tenantId, id);
  if (!row) return NextResponse.json({ error: 'verbal agreement not found' }, { status: 404 });

  const draft = buildVerbalAgreementFollowupEmail(row);
  return NextResponse.json({ ok: true, verbal_agreement_id: id, draft });
}
