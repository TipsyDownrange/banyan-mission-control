/**
 * GET /api/business-settings?setting_key=<required>
 * Packet 002.5 — Business Settings Registry v1 (read-only)
 * Auth: any authenticated session. Writes (not in v1) require business_admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBusinessSetting, BusinessSettingNotFoundError } from '@/lib/business_settings';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const setting_key = searchParams.get('setting_key');

  if (!setting_key) {
    return NextResponse.json({ error: 'setting_key query parameter is required' }, { status: 400 });
  }

  try {
    const result = await getBusinessSetting(setting_key);
    return NextResponse.json({ data: result, fetched_at: new Date().toISOString() });
  } catch (err) {
    if (err instanceof BusinessSettingNotFoundError) {
      return NextResponse.json(
        { error: err.message, setting_key: err.setting_key },
        { status: 404 },
      );
    }
    throw err;
  }
}
