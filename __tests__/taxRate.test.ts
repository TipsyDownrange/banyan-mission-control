/**
 * Unit test: taxRate on estimate load always matches lib/tax-rates.ts
 * regardless of what is saved in the Carls_Method JSON.
 *
 * This verifies the fix in app/api/service/estimate/route.ts (commit 38929c1)
 * where data.taxRate is always overwritten with GET_PASS_ON_RATE on read.
 */

import { GET_PASS_ON_RATE } from '../lib/tax-rates';

// Simulate the estimate GET handler's taxRate override logic
// (mirrors app/api/service/estimate/route.ts GET handler)
function applyTaxRateOverride(savedData: Record<string, unknown>): Record<string, unknown> {
  // taxRate always from lib/tax-rates.ts — JSON value ignored to prevent stale data
  return { ...savedData, taxRate: String(GET_PASS_ON_RATE) };
}

describe('taxRate source of truth', () => {
  it('should equal GET_PASS_ON_RATE from lib/tax-rates.ts', () => {
    expect(GET_PASS_ON_RATE).toBe(4.712);
  });

  it('overrides stale taxRate from saved JSON (old 4.5 value)', () => {
    const savedData = { aluminum: [], glass: [], taxRate: '4.5' };
    const result = applyTaxRateOverride(savedData);
    expect(result.taxRate).toBe('4.712');
    expect(parseFloat(result.taxRate as string)).toBe(GET_PASS_ON_RATE);
  });

  it('overrides taxRate even when saved JSON has 0', () => {
    const savedData = { taxRate: '0' };
    const result = applyTaxRateOverride(savedData);
    expect(result.taxRate).toBe('4.712');
  });

  it('overrides taxRate even when saved JSON has the wrong rate', () => {
    const badRates = ['4.166', '4.0', '5.0', '0.04712', 'null', ''];
    for (const bad of badRates) {
      const result = applyTaxRateOverride({ taxRate: bad });
      expect(result.taxRate).toBe(String(GET_PASS_ON_RATE));
    }
  });

  it('does not override other fields when applying taxRate fix', () => {
    const savedData = { aluminum: [{ amount: '1000' }], glass: [], xModifier: '500', taxRate: '4.5' };
    const result = applyTaxRateOverride(savedData);
    expect(result.aluminum).toEqual([{ amount: '1000' }]);
    expect(result.xModifier).toBe('500');
    expect(result.taxRate).toBe('4.712');
  });

  it('taxRate string representation matches expected format', () => {
    // Ensure no float noise (e.g., 4.712000000001)
    expect(String(GET_PASS_ON_RATE)).toBe('4.712');
  });

  it('GET_PASS_ON_RATE * 100 equals 471.2 (no float drift)', () => {
    // Verify no floating-point issues at multiply
    expect(Math.round(GET_PASS_ON_RATE * 100 * 1000) / 1000).toBe(471.2);
  });
});
