import { tableRoute } from '@/lib/work-records/generic-routes';
export const runtime = 'nodejs';
const route = tableRoute({ table: 'pricing_evidence', idColumn: 'pricing_evidence_id', prefix: 'PRC', entityType: 'pricing_evidence', createEvent: 'PRICING_EVIDENCE_ADDED', listFilters: ['estimate_version_id','source','confidence_level'], allowedCreate: ['kid','estimate_version_id','source','amount','vendor_organization_id','manufacturer_id','system_type_id','document_reference','received_at','confidence_level'], allowedUpdate: ['source','amount','vendor_organization_id','manufacturer_id','system_type_id','document_reference','received_at','confidence_level'] });
export const GET = route.GET; export const POST = route.POST; export const PATCH = route.PATCH;
