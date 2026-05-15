import { tableRoute } from '@/lib/work-records/generic-routes';

export const runtime = 'nodejs';

const route = tableRoute({
  table: 'work_records',
  idColumn: 'work_record_id',
  entityType: 'work_record',
  createEvent: 'WORK_RECORD_CREATED',
  updateEvent: 'WORK_RECORD_STATE_CHANGED',
  listFilters: ['work_type', 'status', 'engagement_id', 'primary_organization_id', 'primary_site_id'],
  allowedCreate: ['kid','work_type','parent_work_id','engagement_id','primary_organization_id','primary_contact_id','primary_site_id','name','status','assigned_user_id','created_from_bid_id'],
  allowedUpdate: ['work_type','parent_work_id','engagement_id','primary_organization_id','primary_contact_id','primary_site_id','name','status','assigned_user_id','created_from_bid_id'],
});

export const GET = route.GET;
export const POST = route.POST;
export const PATCH = route.PATCH;
