/**
 * GET /api/business-rules?rule_key=<required>&effective_date=<optional, default today>
 * Packet 002.5 — Business Rules Registry v1 (read-only)
 * Auth: any authenticated session. Writes (not in v1) require business_admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBusinessRule, BusinessRuleNotFoundError } from '@/lib/business_rules';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rule_key = searchParams.get('rule_key');
  const effective_date = searchParams.get('effective_date') ?? new Date().toISOString().slice(0, 10);

  if (!rule_key) {
    return NextResponse.json({ error: 'rule_key query parameter is required' }, { status: 400 });
  }

  try {
    const result = await getBusinessRule(rule_key, effective_date);
    return NextResponse.json({ data: result, fetched_at: new Date().toISOString() });
  } catch (err) {
    if (err instanceof BusinessRuleNotFoundError) {
      return NextResponse.json(
        { error: err.message, rule_key: err.rule_key, effective_date: err.effective_date },
        { status: 404 },
      );
    }
    throw err;
  }
}
