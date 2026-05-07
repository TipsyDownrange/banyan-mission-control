// BAN-177: Centralized environment helper for Mission Control.
// Staging is identified by Vercel's VERCEL_TARGET_ENV=staging on the
// banyan-mission-control-staging project. Production never sets this to
// 'staging', so production cannot match this check.
export function isStaging(): boolean {
  return process.env.VERCEL_TARGET_ENV === 'staging';
}

// BAN-170: Single source of truth for "should this Gmail send be skipped?".
// Returns true on staging or whenever DISABLE_DISPATCH_EMAILS=true. Routes
// that send mail must check this before calling gmail.users.messages.send
// and return a skipped result instead — staging must never deliver email
// to real customers, PMs, superintendents, or sean@.
export function shouldSkipEmailSend(): boolean {
  if (isStaging()) return true;
  if (process.env.DISABLE_DISPATCH_EMAILS === 'true') return true;
  return false;
}

export function emailSkipReason(): 'staging' | 'disable_dispatch_emails' | null {
  if (isStaging()) return 'staging';
  if (process.env.DISABLE_DISPATCH_EMAILS === 'true') return 'disable_dispatch_emails';
  return null;
}
