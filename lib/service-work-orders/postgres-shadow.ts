import { SWO_COL } from '@/lib/contracts/service-work-orders';
import {
  classifyServiceWorkOrdersHeader,
  classifyServiceWorkOrdersRowAAtoAH,
  type ServiceWorkOrdersHeaderDriftReport,
  type ServiceWorkOrdersRowShapeReport,
} from '@/lib/contracts/service-work-orders-drift';

export interface ServiceWorkOrdersShadowFlags {
  enabled?: boolean;
  dryRun?: boolean;
  allowDriftedRows?: boolean;
  environment?: 'staging' | 'production' | 'development' | 'test' | string;
}

export interface ServiceWorkOrdersPostgresCandidate {
  wo_number: string | null;
  kid: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  island: string | null;
  system_type: string | null;
  scheduled_date: string | null;
  quote_total: string | null;
  folder_url: string | null;
  legacy_customer_id: string | null;
  legacy_payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface ServiceWorkOrdersShadowDryRunResult {
  mode: 'dry_run' | 'write_disabled' | 'ready_to_write';
  wouldWrite: boolean;
  canWrite: boolean;
  blockedReasons: string[];
  candidate: ServiceWorkOrdersPostgresCandidate;
  headerReport: ServiceWorkOrdersHeaderDriftReport;
  rowReport: ServiceWorkOrdersRowShapeReport;
}

type InsertFn = (candidate: ServiceWorkOrdersPostgresCandidate) => Promise<unknown>;

const STATUS_MAP: Record<string, string> = {
  quote: 'quoted',
  approved: 'accepted',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function buildServiceWorkOrderPostgresCandidate(
  headerRow: readonly (string | undefined | null)[],
  row: readonly (string | undefined | null)[],
): ServiceWorkOrdersPostgresCandidate & {
  headerReport: ServiceWorkOrdersHeaderDriftReport;
  rowReport: ServiceWorkOrdersRowShapeReport;
} {
  const headerReport = classifyServiceWorkOrdersHeader(headerRow);
  const rowReport = classifyServiceWorkOrdersRowAAtoAH(row.slice(26, 34));
  const g = (index: number) => String(row[index] || '').trim() || null;
  const rawStatus = g(SWO_COL.status);
  const normalizedStatus = rawStatus ? (STATUS_MAP[rawStatus] || rawStatus) : null;
  const legacyCustomerId = g(SWO_COL.customer_id) || g(43);

  const aaToAhValues = row.slice(26, 34).map(value => String(value || '').trim());
  const requiresManualInvoiceReview = rowReport.depositSignals > 0 || rowReport.shape === 'mixed_drift';

  return {
    wo_number: g(SWO_COL.wo_number),
    kid: g(SWO_COL.wo_id),
    name: g(SWO_COL.name),
    description: g(SWO_COL.description),
    status: normalizedStatus,
    island: normalizeIsland(g(SWO_COL.island)),
    system_type: g(SWO_COL.system_type),
    scheduled_date: normalizeDate(g(SWO_COL.scheduled_date)),
    quote_total: normalizeNumberString(g(SWO_COL.quote_total)),
    folder_url: g(SWO_COL.folder_url),
    legacy_customer_id: legacyCustomerId,
    legacy_payload: {
      source: 'Service_Work_Orders',
      original_status: rawStatus,
      original_customer_id_header: headerRow[43] || null,
      original_legacy_flag_header: headerRow[44] || null,
      aa_to_ah_values: aaToAhValues,
      aa_to_ah_header: headerRow.slice(26, 34).map(value => String(value || '').trim()),
    },
    metadata: {
      shadow_adapter: 'BAN-179.B',
      header_shape: headerReport.shape,
      row_shape: rowReport.shape,
      header_notes: headerReport.notes,
      row_notes: rowReport.notes,
      qbo_deposit_ambiguity: classifyInvoiceAmbiguity(headerReport, rowReport),
      deposit_block_dormant: rowReport.depositSignals === 0,
      requires_manual_invoice_review: requiresManualInvoiceReview,
      confidence: headerReport.shape === 'contract_v2_metadata_first' && rowReport.shape !== 'mixed_drift' ? 'high' : 'low',
    },
    headerReport,
    rowReport,
  };
}

export async function runServiceWorkOrdersPostgresShadowDryRun(
  headerRow: readonly (string | undefined | null)[],
  row: readonly (string | undefined | null)[],
  flags: ServiceWorkOrdersShadowFlags = {},
  insertFn?: InsertFn,
): Promise<ServiceWorkOrdersShadowDryRunResult> {
  const mapped = buildServiceWorkOrderPostgresCandidate(headerRow, row);
  const { headerReport, rowReport, ...candidate } = mapped;
  const dryRun = flags.dryRun !== false;
  const enabled = flags.enabled === true;
  const environment = flags.environment || process.env.VERCEL_TARGET_ENV || process.env.NODE_ENV || 'development';
  const blockedReasons: string[] = [];

  if (!enabled) blockedReasons.push('WO_POSTGRES_SHADOW_ENABLED is not true.');
  if (dryRun) blockedReasons.push('WO_POSTGRES_SHADOW_DRY_RUN is active.');
  if (environment === 'production') blockedReasons.push('Production shadow writes are not authorized by BAN-179.B.');
  if (headerReport.shape !== 'contract_v2_metadata_first' && flags.allowDriftedRows !== true) {
    blockedReasons.push(`Header shape ${headerReport.shape} is drifted and WO_POSTGRES_SHADOW_ALLOW_DRIFTED_ROWS is not true.`);
  }
  if (rowReport.shape === 'mixed_drift' && flags.allowDriftedRows !== true) {
    blockedReasons.push('Row has mixed AA:AH drift and cannot be written without explicit drift allowance.');
  }
  if (!insertFn) blockedReasons.push('No Postgres insert function supplied.');

  const canWrite = blockedReasons.length === 0;
  if (canWrite && insertFn) {
    await insertFn(candidate);
  }

  return {
    mode: dryRun ? 'dry_run' : enabled ? (canWrite ? 'ready_to_write' : 'write_disabled') : 'write_disabled',
    wouldWrite: enabled && !dryRun,
    canWrite,
    blockedReasons,
    candidate,
    headerReport,
    rowReport,
  };
}

export function shadowFlagsFromEnv(env: NodeJS.ProcessEnv = process.env): ServiceWorkOrdersShadowFlags {
  return {
    enabled: env.WO_POSTGRES_SHADOW_ENABLED === 'true',
    dryRun: env.WO_POSTGRES_SHADOW_DRY_RUN !== 'false',
    allowDriftedRows: env.WO_POSTGRES_SHADOW_ALLOW_DRIFTED_ROWS === 'true',
    environment: env.VERCEL_TARGET_ENV || env.NODE_ENV,
  };
}

function classifyInvoiceAmbiguity(
  headerReport: ServiceWorkOrdersHeaderDriftReport,
  rowReport: ServiceWorkOrdersRowShapeReport,
): 'clean_metadata_first' | 'legacy_qbo_first_dormant_deposit' | 'manual_review_required' | 'unknown' {
  if (rowReport.depositSignals > 0 || rowReport.shape === 'mixed_drift') return 'manual_review_required';
  if (headerReport.shape === 'contract_v2_metadata_first') return 'clean_metadata_first';
  if (headerReport.shape === 'legacy_qbo_first' && rowReport.depositSignals === 0) return 'legacy_qbo_first_dormant_deposit';
  return 'unknown';
}

function normalizeIsland(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (normalized === 'big_island' || normalized === 'hawaii') return 'big_island';
  if (['maui', 'kauai', 'oahu', 'lanai', 'molokai'].includes(normalized)) return normalized;
  return 'unknown';
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function normalizeNumberString(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,]/g, '').trim();
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? cleaned : null;
}
