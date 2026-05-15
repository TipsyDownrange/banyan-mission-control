// BAN-76: BACKEND_SHEET_ID must be set via Vercel env — no code fallback.
// Production backend Sheet ends: ...tUZU
// staging  backend Sheet ends: ...nZJ90
// Values must come from Vercel env vars, not code. Do not add fallbacks here.
// Reference only — not used as runtime fallback.
import { isStaging } from './env';

export const PRODUCTION_BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';
export const STAGING_BACKEND_SHEET_ID    = '1DZRiKveSJTbCHxBXdWgl_ZqQCaXOjnv02tFZNmnZJ90';

export function getBackendSheetId(): string {
  const sheetId = process.env.BACKEND_SHEET_ID?.trim();

  if (!sheetId) {
    throw new Error(
      [
        'BACKEND_SHEET_ID is required for BanyanOS Mission Control.',
        'Set BACKEND_SHEET_ID in Vercel for Production and staging.',
        'Production must use the production backend Sheet (ends tUZU).',
        'staging must use the staging backend Sheet (ends nZJ90).',
        'Do not rely on Preview for authenticated Mission Control verification.',
      ].join(' ')
    );
  }

  // BAN-170: fail closed if staging is pointed at the known production backend
  // Sheet ID. Even if the Vercel env var is misconfigured, refuse to write
  // production data from a staging deploy.
  if (isStaging() && sheetId === PRODUCTION_BACKEND_SHEET_ID) {
    throw new Error(
      [
        'BACKEND_SHEET_ID resolves to the production backend Sheet on a staging deploy.',
        'Refusing to write production data from staging.',
        'Set BACKEND_SHEET_ID to the staging backend Sheet (ends nZJ90) on banyan-mission-control-staging.',
      ].join(' ')
    );
  }

  return sheetId;
}
