// BAN-76: BACKEND_SHEET_ID must be set via Vercel env — no code fallback.
// Production backend Sheet ends: ...tUZU
// staging  backend Sheet ends: ...nZJ90
// Values must come from Vercel env vars, not code. Do not add fallbacks here.
// Reference only — not used as runtime fallback.
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

  return sheetId;
}
