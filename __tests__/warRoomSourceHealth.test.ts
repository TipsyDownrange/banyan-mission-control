import { assertCardCompatibility, buildWarRoomSourceHealthSnapshot } from '../lib/war-room/sourceHealth';
import type { SourceHealthSourceCard } from '../lib/war-room/types';

const baseCard: SourceHealthSourceCard = {
  source: 'supabase',
  label: 'Supabase Staging Shadow',
  status: 'degraded',
  authority: 'last_verified_fallback',
  freshness: 'last_verified',
  freshnessLabel: 'Last verified BAN-195 evidence; not live.',
  lastCheckedAt: '2026-05-10T18:00:00.000Z',
  summary: 'Using last-verified BAN-195 evidence; live Supabase row counts unavailable.',
  details: ['service_work_orders: 577'],
  isFallback: true,
  checkedChannels: ['BAN-195 canon evidence'],
  unverifiedChannels: ['rest_row_count_service_work_orders'],
  nonAuthorizationLabel: 'Production authority: NO / Writes allowed: NO / Cutover approved: NO',
};

describe('War Room Source Health snapshot', () => {
  it('uses BAN-195 fallback values as degraded last-verified, never healthy/live, when Supabase row counts are unavailable', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith('/rest/v1/')) return new Response('{}', { status: 200 });
      if (init?.method === 'HEAD') return new Response(null, { status: 403 });
      return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;

    const snapshot = await buildWarRoomSourceHealthSnapshot({
      now: new Date('2026-05-10T18:00:00.000Z'),
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://utsocsidsblmudxyaekm.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-test',
        VERCEL_TARGET_ENV: 'staging',
      } as NodeJS.ProcessEnv,
      fetchImpl,
    });

    const supabase = snapshot.sources.find(card => card.source === 'supabase');
    expect(supabase).toMatchObject({
      status: 'degraded',
      authority: 'last_verified_fallback',
      freshness: 'last_verified',
      isFallback: true,
    });
    expect(snapshot.supabase?.serviceWorkOrdersCount).toBe(577);
    expect(snapshot.supabase?.driftRunCount).toBe(1);
    expect(snapshot.supabase?.driftDiffCount).toBe(6005);
    expect(supabase?.summary).toContain('Using last-verified BAN-195 evidence');
    expect(supabase?.nonAuthorizationLabel).toContain('Production authority: NO');
    expect(supabase?.nonAuthorizationLabel).toContain('Writes allowed: NO');
    expect(supabase?.nonAuthorizationLabel).toContain('Cutover approved: NO');
    expect(supabase?.unverifiedChannels?.length).toBeGreaterThan(0);
    expect(snapshot.environment).toBe('staging');
  });

  it('requires healthy cards to be live and non-fallback', () => {
    expect(() => assertCardCompatibility({ ...baseCard, status: 'healthy' })).toThrow(/cannot be healthy/);
    expect(() => assertCardCompatibility({ ...baseCard, status: 'warning' })).not.toThrow();
  });

  it('requires degraded cards to list unverified channels', () => {
    expect(() => assertCardCompatibility({ ...baseCard, unverifiedChannels: [] })).toThrow(/unverifiedChannels/);
  });

  it('requires non-authorization labels for staging-shadow and last-verified cards', () => {
    expect(() => assertCardCompatibility({ ...baseCard, nonAuthorizationLabel: undefined })).toThrow(/non-authorization/);
  });
});
