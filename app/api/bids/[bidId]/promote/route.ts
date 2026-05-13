import { NextResponse, type NextRequest } from 'next/server';
import { getDefaultTenantId } from '@/lib/env';
import { emitMCEvent } from '@/lib/events';
import { queryOne, getPool } from '@/lib/work-records/db';
import { requireKulaSession } from '@/lib/work-records/authz';
import { nextKid, workTypeToPrefix } from '@/lib/work-records/ids';
import { defaultWorkStatus, engagementTypeToWorkType } from '@/lib/work-records/engagement-mapping';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ bidId: string }> }) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { bidId } = await params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const tenantId = getDefaultTenantId();

  const bid = await queryOne<{ bid_id: string; kid: string; work_record_id: string | null }>(
    'select bid_id, kid, work_record_id from bids where tenant_id = $1 and (bid_id::text = $2 or kid = $2) limit 1',
    [tenantId, bidId],
  );
  if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
  if (bid.work_record_id) return NextResponse.json({ error: 'Bid already promoted', work_record_id: bid.work_record_id }, { status: 409 });

  const engagementId = String(body.engagement_id || '');
  if (!engagementId) return NextResponse.json({ error: 'engagement_id required' }, { status: 400 });

  const engagement = await queryOne<{
    engagement_id: string;
    kid: string;
    engagement_type: string;
    org_id: string;
    primary_contact_id: string | null;
    site_id: string;
    pm_assigned_user_id: string | null;
  }>('select engagement_id, kid, engagement_type, org_id, primary_contact_id, site_id, pm_assigned_user_id from engagements where tenant_id = $1 and engagement_id = $2 limit 1', [tenantId, engagementId]);
  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const workType = String(body.work_type || engagementTypeToWorkType(engagement.engagement_type)) as 'project' | 'work_order' | 'warranty';
  const kid = String(body.kid || await nextKid('work_records', workTypeToPrefix(workType), tenantId));
  const name = String(body.name || `${kid} from ${bid.kid}`);
  const status = String(body.status || defaultWorkStatus(workType));
  const actor = auth.user?.user_id || null;

  const client = await getPool().connect();
  try {
    await client.query('begin');
    const wr = await client.query(
      `insert into work_records
        (kid, work_type, engagement_id, primary_organization_id, primary_contact_id, primary_site_id, name, status, assigned_user_id, created_from_bid_id, tenant_id, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
       returning *`,
      [kid, workType, engagement.engagement_id, engagement.org_id, engagement.primary_contact_id, engagement.site_id, name, status, engagement.pm_assigned_user_id, bid.bid_id, tenantId, actor],
    );
    const workRecord = wr.rows[0];
    await client.query('update bids set work_record_id = $1, bid_state = $2, updated_by = $3, updated_at = now() where bid_id = $4', [workRecord.work_record_id, 'awarded', actor, bid.bid_id]);
    await client.query(
      `insert into entity_migration_audit_log (entity_table, entity_id, action, performed_by, notes, before_state, after_state, tenant_id)
       values ('bids', $1, 'update', $2, $3, $4, $5, $6)`,
      [bid.bid_id, auth.email, 'BG1 Dispatch #3 Bid Queue promotion to work_record', JSON.stringify(bid), JSON.stringify(workRecord), tenantId],
    );
    await client.query('commit');

    await emitMCEvent({
      entity_kid: bid.kid,
      entity_type: 'bid',
      event_type: 'BID_PROMOTED',
      notes: `Promoted ${bid.kid} to ${workRecord.kid}`,
      submitted_by: auth.email,
      origin: 'office',
    });
    await emitMCEvent({
      entity_kid: workRecord.kid,
      entity_type: 'work_record',
      event_type: 'WORK_RECORD_CREATED',
      notes: `Created from promoted bid ${bid.kid}`,
      submitted_by: auth.email,
      origin: 'office',
    });

    return NextResponse.json({ ok: true, bid_id: bid.bid_id, work_record: workRecord });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
