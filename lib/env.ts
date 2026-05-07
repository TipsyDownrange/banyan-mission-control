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

// BAN-170: Single source of truth for "should this Calendar write be skipped?".
// Calendar event create/patch/delete writes hit real `@kulaglass.com` user
// calendars (sean, jody, frank, kyle, jenny, joey, tia, nate, karl), so staging
// must never reach them. Production behavior is unchanged unless the explicit
// DISABLE_CALENDAR_WRITES kill switch is set.
export function calendarWriteSkipReason(): 'staging' | 'disable_calendar_writes' | null {
  if (isStaging()) return 'staging';
  if (process.env.DISABLE_CALENDAR_WRITES === 'true') return 'disable_calendar_writes';
  return null;
}

export function shouldSkipCalendarWrite(): boolean {
  return calendarWriteSkipReason() !== null;
}

// BAN-170: Single source of truth for "should this external-system write be
// skipped?". Used by routes that write to non-Banyan systems (Smartsheet bid
// log, Anthropic invoice ledger, Manpower Schedule sheet) where the target ID
// is hardcoded production by default. Staging callers must short-circuit
// unless an explicit per-route staging override env var is configured.
export function externalWriteSkipReason(): 'staging' | null {
  if (isStaging()) return 'staging';
  return null;
}

export function shouldSkipExternalWrite(): boolean {
  return externalWriteSkipReason() !== null;
}
