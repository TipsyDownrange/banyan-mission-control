import { NextResponse, type NextRequest } from 'next/server';
import { getDefaultTenantId } from '@/lib/env';
import { emitMCEvent, type MCEventEntityType, type MCEventType } from '@/lib/events';
import { query, queryOne } from './db';
import { requireKulaSession } from './authz';
import { nextKid, type KidPrefix } from './ids';

type TableConfig = {
  table: string;
  idColumn: string;
  kidColumn?: string;
  prefix?: KidPrefix;
  allowedCreate: string[];
  allowedUpdate: string[];
  orderBy?: string;
  entityType?: MCEventEntityType;
  createEvent?: MCEventType;
  updateEvent?: MCEventType;
  listFilters?: string[];
};

function pick(body: Record<string, unknown>, allowed: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key] === '' ? null : body[key];
  }
  return out;
}

function insertSql(table: string, data: Record<string, unknown>) {
  const cols = Object.keys(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  return {
    sql: `insert into ${table} (${cols.map(c => `"${c}"`).join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values: cols.map(c => data[c]),
  };
}

function updateSql(table: string, idColumn: string, data: Record<string, unknown>) {
  const cols = Object.keys(data).filter(c => c !== idColumn);
  if (cols.length === 0) return null;
  const sets = cols.map((c, i) => `"${c}" = $${i + 2}`);
  sets.push(`updated_at = now()`);
  return {
    sql: `update ${table} set ${sets.join(', ')} where "${idColumn}" = $1 returning *`,
    values: [data[idColumn], ...cols.map(c => data[c])],
  };
}

function listSql(config: TableConfig, searchParams: URLSearchParams, tenantId: string) {
  const values: unknown[] = [tenantId];
  const where = ['tenant_id = $1'];
  for (const filter of config.listFilters || []) {
    const value = searchParams.get(filter);
    if (!value) continue;
    values.push(value);
    where.push(`"${filter}" = $${values.length}`);
  }
  const limit = Math.min(Number(searchParams.get('limit') || '100'), 500);
  values.push(limit);
  return {
    sql: `select * from ${config.table} where ${where.join(' and ')} order by ${config.orderBy || 'created_at desc'} limit $${values.length}`,
    values,
  };
}

function eventKid(config: TableConfig, row: Record<string, unknown> | null): string {
  const kidColumn = config.kidColumn || 'kid';
  return String(row?.[kidColumn] || row?.[config.idColumn] || '');
}

export function tableRoute(config: TableConfig) {
  async function GET(req: NextRequest) {
    const auth = await requireKulaSession();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(req.url);
    const { sql, values } = listSql(config, searchParams, getDefaultTenantId());
    const rows = await query(sql, values);
    return NextResponse.json({ data: rows, total: rows.length });
  }

  async function POST(req: NextRequest) {
    const auth = await requireKulaSession();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const tenantId = getDefaultTenantId();
    const body = await req.json() as Record<string, unknown>;
    const data = pick(body, config.allowedCreate);
    data.tenant_id = tenantId;
    if (config.prefix && !data.kid) data.kid = await nextKid(config.table, config.prefix, tenantId);
    if (auth.user?.user_id) {
      data.created_by = auth.user.user_id;
      data.updated_by = auth.user.user_id;
    }
    const { sql, values } = insertSql(config.table, data);
    const row = await queryOne(sql, values);
    if (config.createEvent && config.entityType) {
      await emitMCEvent({
        entity_kid: eventKid(config, row),
        entity_type: config.entityType,
        event_type: config.createEvent,
        submitted_by: auth.email,
        origin: 'office',
      });
    }
    return NextResponse.json({ ok: true, data: row }, { status: 201 });
  }

  async function PATCH(req: NextRequest) {
    const auth = await requireKulaSession();
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await req.json() as Record<string, unknown>;
    const id = body[config.idColumn];
    if (!id) return NextResponse.json({ error: `${config.idColumn} required` }, { status: 400 });
    const data = pick(body, config.allowedUpdate);
    data[config.idColumn] = id;
    if (auth.user?.user_id) data.updated_by = auth.user.user_id;
    const stmt = updateSql(config.table, config.idColumn, data);
    if (!stmt) return NextResponse.json({ error: 'No allowed fields supplied' }, { status: 400 });
    const row = await queryOne(stmt.sql, stmt.values);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (config.updateEvent && config.entityType) {
      await emitMCEvent({
        entity_kid: eventKid(config, row),
        entity_type: config.entityType,
        event_type: config.updateEvent,
        submitted_by: auth.email,
        origin: 'office',
      });
    }
    return NextResponse.json({ ok: true, data: row });
  }

  return { GET, POST, PATCH };
}
