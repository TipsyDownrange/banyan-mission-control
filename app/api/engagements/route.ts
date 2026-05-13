import { NextResponse, type NextRequest } from 'next/server';
import { getDefaultTenantId } from '@/lib/env';
import { emitMCEvent } from '@/lib/events';
import { createEngagementDriveFolder } from '@/lib/engagements/drive-templates';
import { query, queryOne } from '@/lib/work-records/db';
import { canRoute, requireKulaSession } from '@/lib/work-records/authz';
import { driveTemplateForEngagement, engagementTypeToRoutingDecision } from '@/lib/work-records/engagement-mapping';
import { nextKid } from '@/lib/work-records/ids';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const tenantId = getDefaultTenantId();
  const limit = Math.min(Number(searchParams.get('limit') || '100'), 500);
  const rows = await query(
    `select e.*, o.name as org_name, s.name as site_name, u.name as pm_name
       from engagements e
       left join organizations o on o.org_id = e.org_id
       left join sites s on s.site_id = e.site_id
       left join users u on u.user_id = e.pm_assigned_user_id
      where e.tenant_id = $1
      order by e.created_at desc
      limit $2`,
    [tenantId, limit],
  );
  return NextResponse.json({ data: rows, total: rows.length });
}

export async function POST(req: NextRequest) {
  const auth = await requireKulaSession();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tenantId = getDefaultTenantId();
  const body = await req.json() as Record<string, unknown>;

  const siteId = String(body.site_id || '');
  const engagementType = String(body.engagement_type || '');
  if (!siteId) return NextResponse.json({ error: 'site_id required' }, { status: 400 });
  if (!engagementType) return NextResponse.json({ error: 'engagement_type required' }, { status: 400 });

  const requestedRouting = body.routing_decision ? String(body.routing_decision) : engagementTypeToRoutingDecision(engagementType);
  if (requestedRouting && !canRoute(auth.role)) return NextResponse.json({ error: 'routing_decision requires leadership role' }, { status: 403 });
  if (requestedRouting && !String(body.routing_rationale || '').trim()) return NextResponse.json({ error: 'routing_rationale required when routing_decision is set' }, { status: 400 });

  const site = await queryOne<{ site_id: string; site_name: string; org_id: string; org_name: string }>(
    `select s.site_id, s.name as site_name, s.org_id, o.name as org_name
       from sites s
       join organizations o on o.org_id = s.org_id
      where s.site_id = $1 and o.tenant_id = $2
      limit 1`,
    [siteId, tenantId],
  );
  if (!site) return NextResponse.json({ error: 'Site/address not found' }, { status: 404 });

  const pmAssignedUserId = body.pm_assigned_user_id ? String(body.pm_assigned_user_id) : null;
  const pmHandoffState = pmAssignedUserId ? 'pm_assigned' : 'awaiting_handoff';
  const kid = String(body.kid || await nextKid('engagements', 'ENG', tenantId));
  const template = String(body.drive_folder_template || driveTemplateForEngagement(engagementType)) as 'project_full' | 'wo_small' | 'wo_large';
  const displayName = String(body.name || `${site.org_name} — ${site.site_name}`);

  const folder = await createEngagementDriveFolder({ kid, name: displayName, template });
  const actor = auth.user?.user_id || null;
  const row = await queryOne(
    `insert into engagements
      (kid, org_id, site_id, engagement_type, status, primary_contact_id, routing_decision,
       routing_assigned_by, routing_assigned_at, routing_rationale, pm_handoff_state, pm_assigned_user_id,
       drive_folder_id, drive_folder_template, metadata, tenant_id, created_by, updated_by)
     values ($1,$2,$3,$4,'active',$5,$6,$7,now(),$8,$9,$10,$11,$12,$13,$14,$15,$15)
     returning *`,
    [
      kid,
      site.org_id,
      site.site_id,
      engagementType,
      body.primary_contact_id || null,
      requestedRouting || null,
      requestedRouting ? actor : null,
      body.routing_rationale || null,
      pmHandoffState,
      pmAssignedUserId,
      folder.folderId,
      template,
      JSON.stringify({ drive_folder_url: folder.folderUrl, subfolders: folder.subfolders }),
      tenantId,
      actor,
    ],
  );

  await emitMCEvent({ entity_kid: kid, entity_type: 'engagement', event_type: 'ENGAGEMENT_CREATED', submitted_by: auth.email, origin: 'office' });
  if (requestedRouting) {
    await emitMCEvent({ entity_kid: kid, entity_type: 'engagement', event_type: 'ROUTING_DECISION_ASSIGNED', rationale: String(body.routing_rationale), submitted_by: auth.email, origin: 'office' });
  }
  await emitMCEvent({ entity_kid: kid, entity_type: 'engagement', event_type: 'PM_HANDOFF_STATE_TRANSITIONED', notes: `estimating → ${pmHandoffState}`, submitted_by: auth.email, origin: 'office' });

  return NextResponse.json({ ok: true, data: row, drive_folder_url: folder.folderUrl }, { status: 201 });
}
