import { queryOne } from './db';
import { getDefaultTenantId } from '@/lib/env';

export type WorkRecordResolution =
  | { found: true; source: 'service_work_orders'; type: 'work_order'; id: string; kid: string; record: Record<string, unknown> }
  | { found: true; source: 'work_records'; type: 'project' | 'warranty' | 'work_order'; id: string; kid: string; record: Record<string, unknown> }
  | { found: false; source: null; type: null; id: null; kid: string; record: null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveWorkRecord(rawKid: string, tenantId = getDefaultTenantId()): Promise<WorkRecordResolution> {
  const kid = rawKid.trim();
  if (!kid) return { found: false, source: null, type: null, id: null, kid, record: null };

  if (/^WO-/i.test(kid)) {
    const row = await queryOne<Record<string, unknown> & { wo_id: string; kid: string }>(
      `select * from service_work_orders where kid = $1 limit 1`,
      [kid],
    );
    if (row) return { found: true, source: 'service_work_orders', type: 'work_order', id: row.wo_id, kid: row.kid, record: row };
  }

  if (/^(PRJ|WRN)-/i.test(kid)) {
    const row = await queryOne<Record<string, unknown> & { work_record_id: string; kid: string; work_type: 'project' | 'warranty' | 'work_order' }>(
      `select * from work_records where tenant_id = $1 and kid = $2 limit 1`,
      [tenantId, kid],
    );
    if (row) return { found: true, source: 'work_records', type: row.work_type, id: row.work_record_id, kid: row.kid, record: row };
  }

  if (UUID_RE.test(kid)) {
    const swo = await queryOne<Record<string, unknown> & { wo_id: string; kid: string }>(
      `select * from service_work_orders where wo_id = $1 limit 1`,
      [kid],
    );
    if (swo) return { found: true, source: 'service_work_orders', type: 'work_order', id: swo.wo_id, kid: swo.kid, record: swo };
    const wr = await queryOne<Record<string, unknown> & { work_record_id: string; kid: string; work_type: 'project' | 'warranty' | 'work_order' }>(
      `select * from work_records where tenant_id = $1 and work_record_id = $2 limit 1`,
      [tenantId, kid],
    );
    if (wr) return { found: true, source: 'work_records', type: wr.work_type, id: wr.work_record_id, kid: wr.kid, record: wr };
  }

  return { found: false, source: null, type: null, id: null, kid, record: null };
}
