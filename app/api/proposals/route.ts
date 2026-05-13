import { tableRoute } from '@/lib/work-records/generic-routes';
export const runtime = 'nodejs';
const route = tableRoute({ table: 'proposals', idColumn: 'proposal_id', prefix: 'PRO', entityType: 'proposal', listFilters: ['estimate_id', 'status'], allowedCreate: ['kid','estimate_id','current_version_id','status'], allowedUpdate: ['estimate_id','current_version_id','status'] });
export const GET = route.GET; export const POST = route.POST; export const PATCH = route.PATCH;
