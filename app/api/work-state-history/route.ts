import { tableRoute } from '@/lib/work-records/generic-routes';
export const runtime = 'nodejs';
const route = tableRoute({ table: 'work_state_history', idColumn: 'state_history_id', entityType: 'work_record', createEvent: 'WORK_RECORD_STATE_CHANGED', allowedCreate: ['work_record_id','prior_state','new_state','actor','rationale','ts'], allowedUpdate: [], orderBy: 'ts desc', listFilters: ['work_record_id'] });
export const GET = route.GET; export const POST = route.POST;
