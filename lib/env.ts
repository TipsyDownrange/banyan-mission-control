// BAN-177: Centralized environment helper for Mission Control.
// Staging is identified by Vercel's VERCEL_TARGET_ENV=staging on the
// banyan-mission-control-staging project. Production never sets this to
// 'staging', so production cannot match this check.
export function isStaging(): boolean {
  return process.env.VERCEL_TARGET_ENV === 'staging';
}
