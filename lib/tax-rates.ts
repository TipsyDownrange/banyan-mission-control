/**
 * Hawaii GET (General Excise Tax) Pass-On Rates
 * Source: tax.hawaii.gov/geninfo/countysurcharge/
 * 
 * ALL counties adopted the 0.5% surcharge = 4.7120% total pass-on rate
 * Effective through December 31, 2030
 * 
 * Maui: adopted 1/1/2024 (was 4.1667% before that)
 * Oahu: since 1/1/2007
 * Kauai: since 1/1/2019
 * Hawaii: since 1/1/2020
 * 
 * This is the SINGLE SOURCE OF TRUTH for GET rates in BanyanOS.
 * All components should import from here.
 */

export const GET_PASS_ON_RATE = 4.712; // percentage (e.g., 4.712 = 4.712%)
export const GET_DECIMAL_RATE = 0.04712; // decimal for multiplication

// Per-island rates (currently all the same, but structured for future changes)
export const GET_RATES_BY_ISLAND: Record<string, number> = {
  Oahu: 4.712,
  Maui: 4.712,
  Kauai: 4.712,
  Hawaii: 4.712,
  Lanai: 4.712,
  Molokai: 4.712,
};

/** Get the GET pass-on rate for an island (percentage, e.g., 4.712) */
export function getGETRate(island: string): number {
  return GET_RATES_BY_ISLAND[island] ?? GET_PASS_ON_RATE;
}
