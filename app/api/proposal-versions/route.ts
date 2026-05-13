import { tableRoute } from '@/lib/work-records/generic-routes';
export const runtime = 'nodejs';
const route = tableRoute({ table: 'proposal_versions', idColumn: 'proposal_version_id', entityType: 'proposal', createEvent: 'PROPOSAL_VERSION_FROZEN', updateEvent: 'PROPOSAL_VERSION_ACCEPTED', listFilters: ['proposal_id'], allowedCreate: ['proposal_id','version_number','total_amount','accepted_at','frozen_at'], allowedUpdate: ['accepted_at','frozen_at','total_amount'] });
export const GET = route.GET; export const POST = route.POST; export const PATCH = route.PATCH;
