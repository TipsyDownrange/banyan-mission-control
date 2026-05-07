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
