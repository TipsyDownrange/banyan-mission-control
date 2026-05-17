// BAN-177: Centralized environment helper for Mission Control.
// Staging is identified by Vercel's VERCEL_TARGET_ENV=staging on the
// banyan-mission-control-staging project. Production never sets this to
// 'staging', so production cannot match this check.
export function isStaging(): boolean {
  return process.env.VERCEL_TARGET_ENV === 'staging';
}

export const BANYAN_TENANT_KULA_UUID = '00000000-0000-4000-8000-000000000001';

export function getKulaTenantUuid(): string {
  return process.env.BANYAN_TENANT_KULA_UUID?.trim() || BANYAN_TENANT_KULA_UUID;
}

export function getDefaultTenantId(): string {
  return process.env.DEFAULT_TENANT_ID?.trim() || getKulaTenantUuid();
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

export class StagingWriteTargetConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StagingWriteTargetConfigError';
  }
}

export function requireStagingEnv(name: string, description: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new StagingWriteTargetConfigError(
      `${name} is required in staging before writing to ${description}.`,
    );
  }
  return value;
}

export function getFieldAppBaseUrl(): string {
  const configured = String(process.env.FA_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (isStaging()) {
    throw new StagingWriteTargetConfigError(
      'FA_BASE_URL is required in staging before dispatch notifications can reference Field App.',
    );
  }
  return 'https://banyan-field-app-525p.vercel.app';
}

export function getBidLogSheetId(): string {
  if (isStaging()) return requireStagingEnv('STAGING_SMARTSHEET_BID_LOG_ID', 'Smartsheet bid log');
  return process.env.SMARTSHEET_BID_LOG_ID?.trim() || '6073963369156484';
}

export function getCostInvoiceSheetId(): string {
  if (isStaging()) return requireStagingEnv('STAGING_COST_INVOICE_SHEET_ID', 'cost invoice sheet');
  return process.env.COST_INVOICE_SHEET_ID?.trim() || '1EutKs3k0Cp3UwmpmAEDV8FaSSeIklb7Lk7wufRq5YdI';
}

export function getManpowerScheduleSheetId(): string {
  if (isStaging()) return requireStagingEnv('STAGING_MANPOWER_SCHEDULE_SHEET_ID', 'manpower schedule sheet');
  return process.env.MANPOWER_SCHEDULE_SHEET_ID?.trim() || '1099MZ_cGYqNbMKcvoKnwNp0uXnugQPY-jPOpmsJW_wQ';
}

// Packet 001: Master Library API feature flag.
// Server-side: check BANYAN_FF_MASTER_LIBRARY_API.
// Client-side components read NEXT_PUBLIC_BANYAN_FF_MASTER_LIBRARY_API.
// Default OFF in all environments — requires explicit opt-in.
export function isMasterLibraryApiEnabled(): boolean {
  return process.env.BANYAN_FF_MASTER_LIBRARY_API === 'true';
}

// BAN-309 Pass 3a.2: Postgres write-gate for new AIA / TPA routes. Routes
// that perform Drizzle transactions against AIA / TPA tables must short-circuit
// to 503 unless this flag is set, so staging cannot accidentally mutate
// Postgres while the cutover is in flight. Default OFF in every environment.
export function isPostgresWriteEnabled(): boolean {
  return process.env.BANYAN_FF_POSTGRES_WRITE === 'true';
}
