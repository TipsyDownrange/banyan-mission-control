import { desc } from 'drizzle-orm';
import { isStaging } from '@/lib/env';
import { resolveWorkOrderIsland } from '@/lib/normalize';

export type ServiceWorkOrderApiRecord = {
  id: string;
  wo_id: string;
  wo_number: string;
  name: string;
  description: string;
  status: string;
  rawStatus: string;
  island: string;
  area_of_island: string;
  address: string;
  contact_person: string;
  contact_title: string;
  contact_phone: string;
  contact_email: string;
  customer_name: string;
  contact: string;
  systemType: string;
  assignedTo: string;
  dateReceived: string;
  dueDate: string;
  scheduledDate: string;
  startDate: string;
  hoursEstimated: string;
  hoursActual: string;
  men: string;
  comments: string;
  folderUrl: string;
  quoteTotal: string;
  quoteStatus: string;
  createdAt: string;
  updatedAt: string;
  source: 'postgres_shadow';
  qbo_invoice_id: string;
  invoice_number: string;
  invoice_total: string;
  invoice_balance: string;
  invoice_date: string;
  deposit_status: string;
  deposit_amount: string;
  deposit_invoice_num: string;
  deposit_sent_date: string;
  deposit_paid_date: string;
  final_status: string;
  final_amount: string;
  final_invoice_num: string;
  final_sent_date: string;
  final_paid_date: string;
  invoices_json: string;
  org_id: string;
  customer_id: string;
  legacy_flag: string;
  legacy_wo_ids: string;
  requires_org_assignment: boolean;
  lane: string;
  done: boolean;
  customer_resolved: null;
  resolved_customer_name: string;
  postgres_shadow: true;
};

type JsonRecord = Record<string, unknown>;

type PostgresShadowServiceWorkOrderRow = {
  wo_id: string | null;
  wo_number: string | null;
  kid: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  island: string | null;
  org_id: string | null;
  system_type: string | null;
  scheduled_date: string | Date | null;
  quote_total: string | null;
  folder_url: string | null;
  legacy_wo_ids: string | null;
  legacy_customer_id: string | null;
  legacy_payload: unknown;
  metadata: unknown;
  created_at: string | Date | null;
  updated_at: string | Date | null;
};

export function shouldReadServiceWorkOrdersFromPostgres(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WO_POSTGRES_READ_ENABLED === 'true' && isStaging();
}

export function assertPostgresReadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!shouldReadServiceWorkOrdersFromPostgres(env)) return;
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('WO_POSTGRES_READ_ENABLED is true, but DATABASE_URL is missing. Refusing silent fallback for staging Postgres read smoke.');
  }
}

export function postgresStatusToServiceStatus(status: string | null | undefined): string {
  const raw = String(status || '').trim();
  if (!raw) return 'lead';
  if (raw === 'declined') return 'lost';
  return raw;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return value == null ? '' : String(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function dateString(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function postgresShadowRowToServiceWorkOrder(row: PostgresShadowServiceWorkOrderRow): ServiceWorkOrderApiRecord {
  const metadata = asRecord(row.metadata);
  const legacy = asRecord(row.legacy_payload);
  const status = postgresStatusToServiceStatus(row.status);
  const assignedTokens = asStringArray(legacy.assigned_tokens);
  const assignedRaw = asString(legacy.assigned_to_raw);
  const address = asString(legacy.address_raw);
  const island = resolveWorkOrderIsland(asString(row.island), address);
  const id = row.kid || row.wo_number || row.wo_id || '';
  const customerId = row.legacy_customer_id || asString(legacy.customer_id_raw);
  const legacyFlag = asString(legacy.legacy_flag_raw) || 'true';
  const requiresOrgAssignment = !row.org_id;

  return {
    id,
    wo_id: id,
    wo_number: row.wo_number || id,
    name: row.name || id,
    description: row.description || '',
    status,
    rawStatus: asString(row.status),
    island,
    area_of_island: '',
    address,
    contact_person: '',
    contact_title: '',
    contact_phone: '',
    contact_email: '',
    customer_name: '',
    contact: '',
    systemType: row.system_type || '',
    assignedTo: assignedTokens.length > 0 ? assignedTokens.join(', ') : assignedRaw,
    dateReceived: '',
    dueDate: '',
    scheduledDate: dateString(row.scheduled_date),
    startDate: '',
    hoursEstimated: '',
    hoursActual: '',
    men: '',
    comments: '',
    folderUrl: row.folder_url || '',
    quoteTotal: row.quote_total || '',
    quoteStatus: '',
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at),
    source: 'postgres_shadow',
    qbo_invoice_id: '',
    invoice_number: '',
    invoice_total: '',
    invoice_balance: '',
    invoice_date: '',
    deposit_status: '',
    deposit_amount: '',
    deposit_invoice_num: '',
    deposit_sent_date: '',
    deposit_paid_date: '',
    final_status: '',
    final_amount: '',
    final_invoice_num: '',
    final_sent_date: '',
    final_paid_date: '',
    invoices_json: '',
    org_id: row.org_id || '',
    customer_id: customerId,
    legacy_flag: legacyFlag,
    legacy_wo_ids: row.legacy_wo_ids || '',
    requires_org_assignment: requiresOrgAssignment,
    lane: ['closed', 'completed'].includes(status) ? 'completed' : 'active',
    done: ['closed', 'completed'].includes(status),
    customer_resolved: null,
    resolved_customer_name: '',
    postgres_shadow: true,
  };
}

export async function loadServiceWorkOrdersFromPostgresShadow(): Promise<ServiceWorkOrderApiRecord[]> {
  assertPostgresReadConfig();
  const { db, service_work_orders } = await import('@/db');
  const rows = await db.select().from(service_work_orders).orderBy(desc(service_work_orders.created_at));
  return rows.map(row => postgresShadowRowToServiceWorkOrder(row));
}

export async function loadWorkOrderPickerFromPostgresShadow() {
  const rows = await loadServiceWorkOrdersFromPostgresShadow();
  const terminal = new Set(['closed', 'lost', 'completed', 'rejected', 'declined']);
  const seen = new Set<string>();
  const workOrders = [];
  for (const wo of rows) {
    if (!wo.name || terminal.has(wo.status.toLowerCase())) continue;
    const key = wo.wo_number || wo.id || wo.name;
    if (seen.has(key)) continue;
    seen.add(key);
    workOrders.push({
      id: wo.wo_number || wo.id,
      name: wo.name.split('\n')[0].substring(0, 80),
      island: wo.island,
      status: wo.status,
      contact: wo.contact.substring(0, 60),
    });
  }
  return workOrders;
}
