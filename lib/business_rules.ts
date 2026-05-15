/**
 * Packet 002.5 — Business Rules Registry
 * Read-only accessor. Writes are business_admin-gated (ADR-006 Amendment 1).
 */

import { db, business_rules } from '@/db';
import { eq, and, lte, or, isNull, gt, desc } from 'drizzle-orm';
import { getDefaultTenantId } from '@/lib/env';

export class BusinessRuleNotFoundError extends Error {
  constructor(
    public readonly rule_key: string,
    public readonly effective_date: string,
  ) {
    super(`No active business rule found for key "${rule_key}" as of ${effective_date}`);
    this.name = 'BusinessRuleNotFoundError';
  }
}

export type RuleValueType = 'numeric' | 'percentage' | 'currency' | 'string' | 'object';

export type BusinessRuleResult = {
  rule_id: string;
  kid: string;
  rule_value: unknown;
  value_type: RuleValueType;
  effective_start: string;
  effective_end: string | null;
};

/**
 * Look up the active business rule for rule_key as of effective_date.
 * Throws BusinessRuleNotFoundError if no match — no silent defaults.
 * Throws if multiple active rules overlap for the same key+date (data hygiene violation).
 */
export async function getBusinessRule(
  rule_key: string,
  effective_date: Date | string,
  tenant_id?: string,
): Promise<BusinessRuleResult> {
  const tid = tenant_id ?? getDefaultTenantId();
  const dateStr =
    typeof effective_date === 'string'
      ? effective_date
      : effective_date.toISOString().slice(0, 10);

  const rows = await db
    .select({
      rule_id: business_rules.rule_id,
      kid: business_rules.kid,
      rule_value: business_rules.rule_value,
      value_type: business_rules.value_type,
      effective_start: business_rules.effective_start,
      effective_end: business_rules.effective_end,
    })
    .from(business_rules)
    .where(
      and(
        eq(business_rules.tenant_id, tid),
        eq(business_rules.rule_key, rule_key),
        eq(business_rules.is_active, true),
        lte(business_rules.effective_start, dateStr),
        or(isNull(business_rules.effective_end), gt(business_rules.effective_end, dateStr)),
      ),
    )
    .orderBy(desc(business_rules.effective_start))
    .limit(2);

  if (rows.length === 0) {
    throw new BusinessRuleNotFoundError(rule_key, dateStr);
  }

  if (rows.length > 1) {
    throw new Error(
      `Multiple active rules found for "${rule_key}" on ${dateStr}. ` +
        `Only one rule should be active per key per date — check effective_date hygiene.`,
    );
  }

  const row = rows[0];
  return {
    rule_id: row.rule_id,
    kid: row.kid,
    rule_value: row.rule_value,
    value_type: row.value_type as RuleValueType,
    effective_start: row.effective_start,
    effective_end: row.effective_end,
  };
}
