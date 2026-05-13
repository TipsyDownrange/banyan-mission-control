import { tableRoute } from '@/lib/work-records/generic-routes';
export const runtime = 'nodejs';
const route = tableRoute({ table: 'estimates', idColumn: 'estimate_id', prefix: 'EST', entityType: 'estimate', listFilters: ['bid_id', 'status'], allowedCreate: ['kid','bid_id','current_version_id','status'], allowedUpdate: ['bid_id','current_version_id','status'] });
export const GET = route.GET; export const POST = route.POST; export const PATCH = route.PATCH;
