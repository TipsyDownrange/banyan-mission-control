export function isStaging(): boolean {
  return process.env.VERCEL_TARGET_ENV === 'staging';
}
