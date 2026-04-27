export const SERVICE_WO_NUMBER_PATTERN = /^\d{2}-\d{4}$/;

export class InvalidServiceWONumberError extends Error {
  constructor(value: string) {
    super(`Invalid work order number "${value}". Use the standard YY-#### format, for example 26-0001.`);
    this.name = 'InvalidServiceWONumberError';
  }
}

export class ServiceWOFolderCreationError extends Error {
  constructor(cause?: unknown) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    super(`Work order was not created because the Drive folder could not be created.${detail}`);
    this.name = 'ServiceWOFolderCreationError';
  }
}

export function isValidServiceWONumber(value: string): boolean {
  return SERVICE_WO_NUMBER_PATTERN.test(value);
}

export function normalizeIncomingServiceWONumber(value: unknown): string | undefined {
  if (value == null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  if (!isValidServiceWONumber(normalized)) {
    throw new InvalidServiceWONumberError(normalized);
  }
  return normalized;
}

export function buildServiceWOId(woNumber: string): string {
  if (!isValidServiceWONumber(woNumber)) {
    throw new InvalidServiceWONumberError(woNumber);
  }
  return `WO-${woNumber}`;
}

export function nextServiceWONumber(existingNumbers: string[], yearTwoDigit: string): string {
  const nums = existingNumbers
    .filter(v => isValidServiceWONumber(v) && v.startsWith(`${yearTwoDigit}-`))
    .map(v => Number.parseInt(v.split('-')[1], 10));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${yearTwoDigit}-${String(nextNum).padStart(4, '0')}`;
}

export function requireServiceWOFolderUrl(folderUrl: string | null | undefined): string {
  const normalized = String(folderUrl || '').trim();
  if (!normalized) throw new ServiceWOFolderCreationError();
  return normalized;
}
