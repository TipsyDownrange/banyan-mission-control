// BAN-170: backend-config must fail closed when staging resolves to the
// known production backend Sheet ID, even if the Vercel env var is set wrong.

import { PRODUCTION_BACKEND_SHEET_ID, STAGING_BACKEND_SHEET_ID } from '@/lib/backend-config';

describe('lib/backend-config — staging fail-closed', () => {
  let prevTargetEnv: string | undefined;
  let prevSheet: string | undefined;

  beforeEach(() => {
    jest.resetModules();
    prevTargetEnv = process.env.VERCEL_TARGET_ENV;
    prevSheet = process.env.BACKEND_SHEET_ID;
  });

  afterEach(() => {
    if (prevTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = prevTargetEnv;
    if (prevSheet === undefined) delete process.env.BACKEND_SHEET_ID;
    else process.env.BACKEND_SHEET_ID = prevSheet;
  });

  it('throws when BACKEND_SHEET_ID is unset (regression)', async () => {
    delete process.env.BACKEND_SHEET_ID;
    const { getBackendSheetId } = await import('@/lib/backend-config');
    expect(() => getBackendSheetId()).toThrow(/BACKEND_SHEET_ID is required/);
  });

  it('throws on staging when BACKEND_SHEET_ID resolves to the production sheet id', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.BACKEND_SHEET_ID = PRODUCTION_BACKEND_SHEET_ID;
    const { getBackendSheetId } = await import('@/lib/backend-config');
    expect(() => getBackendSheetId()).toThrow(/production backend Sheet on a staging deploy/);
  });

  it('returns the staging id on staging when BACKEND_SHEET_ID is the staging sheet', async () => {
    process.env.VERCEL_TARGET_ENV = 'staging';
    process.env.BACKEND_SHEET_ID = STAGING_BACKEND_SHEET_ID;
    const { getBackendSheetId } = await import('@/lib/backend-config');
    expect(getBackendSheetId()).toBe(STAGING_BACKEND_SHEET_ID);
  });

  it('returns the production id on production (unchanged behavior)', async () => {
    delete process.env.VERCEL_TARGET_ENV;
    process.env.BACKEND_SHEET_ID = PRODUCTION_BACKEND_SHEET_ID;
    const { getBackendSheetId } = await import('@/lib/backend-config');
    expect(getBackendSheetId()).toBe(PRODUCTION_BACKEND_SHEET_ID);
  });
});

export {};
