/**
 * Hawaii time utilities — all dates/times in BanyanOS use HST.
 * Hawaii does not observe daylight saving time.
 * UTC offset: -10:00 always.
 */

/** Get current date in Hawaii as YYYY-MM-DD */
export function hawaiiToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Honolulu' });
}

/** Get current ISO timestamp in Hawaii */
export function hawaiiNow(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Pacific/Honolulu' }).replace(' ', 'T');
}

/** Get current year in Hawaii (2-digit) */
export function hawaiiYear2(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Honolulu' }).slice(2, 4);
}
