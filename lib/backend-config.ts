// Production backend Sheet ID — single source of truth for all routes.
// Override via BACKEND_SHEET_ID env var (or legacy GOOGLE_SHEET_ID) to point
// a staging/preview deployment at a non-production sheet without code changes.
// Staging sheet: BanyanOS_Field_V1_Backend_STAGING_VERIFICATION
//   ID: 1DZRiKveSJTbCHxBXdWgl_ZqQCaXOjnv02tFZNmnZJ90
export const PRODUCTION_BACKEND_SHEET_ID = '137IKVjyiIAAMmQmt84SgrJxpTcQ_JIh53PCvZiOtUZU';

export function getBackendSheetId(): string {
  return (
    process.env.BACKEND_SHEET_ID ||
    process.env.GOOGLE_SHEET_ID ||
    PRODUCTION_BACKEND_SHEET_ID
  );
}
