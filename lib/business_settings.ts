/**
 * Packet 002.5 — Business Settings Registry
 * Read-only accessor. Writes are business_admin-gated (ADR-006 Amendment 1).
 */

import { db, business_settings } from '@/db';
import { eq, and } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

export class BusinessSettingNotFoundError extends Error {
  constructor(public readonly setting_key: string) {
    super(`No active business setting found for key "${setting_key}"`);
    this.name = 'BusinessSettingNotFoundError';
  }
}

export type SettingValueType = 'boolean' | 'integer' | 'string' | 'object';

export type BusinessSettingResult = {
  setting_id: string;
  kid: string;
  setting_value: unknown;
  value_type: SettingValueType;
};

/**
 * Look up the active business setting for setting_key.
 * Throws BusinessSettingNotFoundError if no match — no silent defaults.
 */
export async function getBusinessSetting(
  setting_key: string,
  tenant_id?: string,
): Promise<BusinessSettingResult> {
  const tid = tenant_id ?? getDefaultTenantId();

  const rows = await db
    .select({
      setting_id: business_settings.setting_id,
      kid: business_settings.kid,
      setting_value: business_settings.setting_value,
      value_type: business_settings.value_type,
    })
    .from(business_settings)
    .where(
      and(
        eq(business_settings.tenant_id, tid),
        eq(business_settings.setting_key, setting_key),
        eq(business_settings.is_active, true),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new BusinessSettingNotFoundError(setting_key);
  }

  const row = rows[0];
  return {
    setting_id: row.setting_id,
    kid: row.kid,
    setting_value: row.setting_value,
    value_type: row.value_type as SettingValueType,
  };
}
