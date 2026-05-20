/**
 * BAN-374 P6 — normalizeProjectIsland helper.
 *
 * Maps the marketing-style island string from /api/projects (sheets-backed
 * legacy surface) to the canonical ScheduleTaskIsland enum used by the
 * scheduling spine.  'Hawaii' (sheet) → 'big_island' (enum) is the non-obvious
 * case; everything else lowercases through.
 */

import { normalizeProjectIsland } from '@/lib/schedule/normalize-project-island';

describe('normalizeProjectIsland', () => {
  it('maps the six known marketing names to canonical enum values', () => {
    expect(normalizeProjectIsland('Oahu')).toBe('oahu');
    expect(normalizeProjectIsland('Maui')).toBe('maui');
    expect(normalizeProjectIsland('Kauai')).toBe('kauai');
    expect(normalizeProjectIsland('Hawaii')).toBe('big_island');
    expect(normalizeProjectIsland('Lanai')).toBe('lanai');
    expect(normalizeProjectIsland('Molokai')).toBe('molokai');
  });

  it('is case-insensitive on the input string', () => {
    expect(normalizeProjectIsland('OAHU')).toBe('oahu');
    expect(normalizeProjectIsland('maui')).toBe('maui');
    expect(normalizeProjectIsland('HaWaIi')).toBe('big_island');
  });

  it('accepts the already-canonical big_island spelling', () => {
    expect(normalizeProjectIsland('big_island')).toBe('big_island');
    expect(normalizeProjectIsland('BIG_ISLAND')).toBe('big_island');
  });

  it('trims surrounding whitespace before mapping', () => {
    expect(normalizeProjectIsland('  Maui  ')).toBe('maui');
  });

  it('falls back to unknown for null, undefined, empty, or unrecognized input', () => {
    expect(normalizeProjectIsland(null)).toBe('unknown');
    expect(normalizeProjectIsland(undefined)).toBe('unknown');
    expect(normalizeProjectIsland('')).toBe('unknown');
    expect(normalizeProjectIsland('   ')).toBe('unknown');
    expect(normalizeProjectIsland('Atlantis')).toBe('unknown');
    expect(normalizeProjectIsland('Hawaiian Islands')).toBe('unknown');
  });
});
