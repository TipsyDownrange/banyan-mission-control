export type EngagementType =
  | 'project'
  | 'work_order_small'
  | 'work_order_large'
  | 'warranty_small'
  | 'warranty_large'
  | 'maintenance'
  | 'internal';

export type WorkType = 'project' | 'work_order' | 'warranty';
export type RoutingDecision = 'service_wo' | 'project';
export type DriveFolderTemplate = 'project_full' | 'wo_small' | 'wo_large';

export const ENGAGEMENT_TYPE_TO_WORK_TYPE: Record<EngagementType, WorkType> = {
  project: 'project',
  work_order_small: 'work_order',
  work_order_large: 'work_order',
  warranty_small: 'warranty',
  warranty_large: 'warranty',
  maintenance: 'work_order',
  internal: 'project',
};

export const ENGAGEMENT_TYPE_TO_ROUTING_DECISION: Record<EngagementType, RoutingDecision> = {
  project: 'project',
  work_order_small: 'service_wo',
  work_order_large: 'service_wo',
  warranty_small: 'service_wo',
  warranty_large: 'service_wo',
  maintenance: 'service_wo',
  internal: 'project',
};

export function engagementTypeToWorkType(engagementType: string): WorkType {
  return ENGAGEMENT_TYPE_TO_WORK_TYPE[engagementType as EngagementType] ?? 'work_order';
}

export function engagementTypeToRoutingDecision(engagementType: string): RoutingDecision {
  return ENGAGEMENT_TYPE_TO_ROUTING_DECISION[engagementType as EngagementType] ?? 'service_wo';
}

export function driveTemplateForEngagement(engagementType: string): DriveFolderTemplate {
  if (engagementType === 'project' || engagementType === 'internal') return 'project_full';
  if (engagementType === 'work_order_large' || engagementType === 'warranty_large') return 'wo_large';
  return 'wo_small';
}

export function defaultWorkStatus(workType: WorkType): string {
  if (workType === 'project') return 'active';
  if (workType === 'warranty') return 'intake';
  return 'draft';
}
