/**
 * Packet 002.5: Business Rules Registry Foundation
 * Tests read helper behavior, missing-rule failures, object values, and Packet 005-style snapshot consumption.
 */

let mockRows: unknown[] = [];
const mockLimit = jest.fn(async () => mockRows);
const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
const mockQueryChain = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: mockOrderBy,
  limit: mockLimit,
};

const mockEq = jest.fn((...args: unknown[]) => ({ op: 'eq', args }));
const mockAnd = jest.fn((...args: unknown[]) => ({ op: 'and', args }));
const mockLte = jest.fn((...args: unknown[]) => ({ op: 'lte', args }));
const mockOr = jest.fn((...args: unknown[]) => ({ op: 'or', args }));
const mockIsNull = jest.fn((...args: unknown[]) => ({ op: 'isNull', args }));
const mockGt = jest.fn((...args: unknown[]) => ({ op: 'gt', args }));
const mockDesc = jest.fn((...args: unknown[]) => ({ op: 'desc', args }));

jest.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => mockEq(...args),
  and: (...args: unknown[]) => mockAnd(...args),
  lte: (...args: unknown[]) => mockLte(...args),
  or: (...args: unknown[]) => mockOr(...args),
  isNull: (...args: unknown[]) => mockIsNull(...args),
  gt: (...args: unknown[]) => mockGt(...args),
  desc: (...args: unknown[]) => mockDesc(...args),
}));

jest.mock('@/lib/env', () => ({
  getDefaultTenantId: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

jest.mock('@/db', () => ({
  db: mockQueryChain,
  business_rules: {
    rule_id: 'business_rules.rule_id',
    kid: 'business_rules.kid',
    tenant_id: 'business_rules.tenant_id',
    rule_key: 'business_rules.rule_key',
    rule_value: 'business_rules.rule_value',
    value_type: 'business_rules.value_type',
    effective_start: 'business_rules.effective_start',
    effective_end: 'business_rules.effective_end',
    is_active: 'business_rules.is_active',
  },
  business_settings: {
    setting_id: 'business_settings.setting_id',
    kid: 'business_settings.kid',
    tenant_id: 'business_settings.tenant_id',
    setting_key: 'business_settings.setting_key',
    setting_value: 'business_settings.setting_value',
    value_type: 'business_settings.value_type',
    is_active: 'business_settings.is_active',
  },
}));

import { BusinessRuleNotFoundError, getBusinessRule } from '@/lib/business_rules';
import { BusinessSettingNotFoundError, getBusinessSetting } from '@/lib/business_settings';

describe('Packet 002.5 Business Rules Registry', () => {
  beforeEach(() => {
    mockRows = [];
    jest.clearAllMocks();
  });

  it('returns an active rule by key and effective date', async () => {
    mockRows = [
      {
        rule_id: 'rule-uuid-1',
        kid: 'BRL-00001',
        rule_value: '4.712',
        value_type: 'percentage',
        effective_start: '2026-01-01',
        effective_end: null,
      },
    ];

    await expect(getBusinessRule('default_get_rate_pct', '2026-05-12')).resolves.toEqual({
      rule_id: 'rule-uuid-1',
      kid: 'BRL-00001',
      rule_value: '4.712',
      value_type: 'percentage',
      effective_start: '2026-01-01',
      effective_end: null,
    });

    expect(mockLte).toHaveBeenCalledWith('business_rules.effective_start', '2026-05-12');
    expect(mockGt).toHaveBeenCalledWith('business_rules.effective_end', '2026-05-12');
    expect(mockDesc).toHaveBeenCalledWith('business_rules.effective_start');
    expect(mockLimit).toHaveBeenCalledWith(2);
  });

  it('preserves object value_type payloads for formula-style rules', async () => {
    const formula = {
      type: 'formula',
      expression: 'total_labor_cost',
      tenant_customizable: true,
      alternative_types: ['flat_pct', 'pct_of_total_direct_cost', 'flat_amount'],
    };

    mockRows = [
      {
        rule_id: 'rule-uuid-3',
        kid: 'BRL-00003',
        rule_value: formula,
        value_type: 'object',
        effective_start: '2026-01-01',
        effective_end: null,
      },
    ];

    const result = await getBusinessRule('default_overhead_calculation', '2026-05-12');

    expect(result.value_type).toBe('object');
    expect(result.rule_value).toEqual(formula);
  });

  it('throws a typed missing-rule error instead of falling back silently', async () => {
    mockRows = [];

    await expect(getBusinessRule('glazier_leadman_base_rate_hourly', '2026-05-12')).rejects.toBeInstanceOf(
      BusinessRuleNotFoundError,
    );
  });

  it('throws on overlapping active rows for the same rule/date', async () => {
    mockRows = [
      { rule_id: 'rule-1', kid: 'BRL-00001', rule_value: '4.712', value_type: 'percentage', effective_start: '2026-01-01', effective_end: null },
      { rule_id: 'rule-2', kid: 'BRL-00031', rule_value: '4.8', value_type: 'percentage', effective_start: '2026-03-01', effective_end: null },
    ];

    await expect(getBusinessRule('default_get_rate_pct', '2026-05-12')).rejects.toThrow('Multiple active rules');
  });

  it('supports Packet 005-style snapshot consumers using rule_id + value at version freeze', async () => {
    mockRows = [
      {
        rule_id: 'rule-profit-uuid',
        kid: 'BRL-00004',
        rule_value: '10.0',
        value_type: 'percentage',
        effective_start: '2026-01-01',
        effective_end: null,
      },
    ];

    async function buildEstimateVersionRuleSnapshot(ruleKey: string, estimateDate: string) {
      const rule = await getBusinessRule(ruleKey, estimateDate);
      return {
        rule_key: ruleKey,
        rule_id: rule.rule_id,
        kid: rule.kid,
        value_at_freeze: rule.rule_value,
        value_type: rule.value_type,
        effective_start: rule.effective_start,
      };
    }

    await expect(buildEstimateVersionRuleSnapshot('default_profit_pct', '2026-05-12')).resolves.toEqual({
      rule_key: 'default_profit_pct',
      rule_id: 'rule-profit-uuid',
      kid: 'BRL-00004',
      value_at_freeze: '10.0',
      value_type: 'percentage',
      effective_start: '2026-01-01',
    });
  });

  it('returns active business settings and throws typed setting misses', async () => {
    mockRows = [
      {
        setting_id: 'setting-uuid-4',
        kid: 'BST-00004',
        setting_value: 'reviewer_plus_approver',
        value_type: 'string',
      },
    ];

    await expect(getBusinessSetting('pay_app_approval_workflow')).resolves.toEqual({
      setting_id: 'setting-uuid-4',
      kid: 'BST-00004',
      setting_value: 'reviewer_plus_approver',
      value_type: 'string',
    });

    mockRows = [];
    await expect(getBusinessSetting('tenant_qbo_company_id')).rejects.toBeInstanceOf(BusinessSettingNotFoundError);
  });
});
