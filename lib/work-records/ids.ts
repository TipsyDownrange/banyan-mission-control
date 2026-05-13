import { queryOne } from './db';
import { getDefaultTenantId } from '@/lib/env';

export type KidPrefix = 'ENG' | 'PRJ' | 'WO' | 'WRN' | 'BID' | 'EST' | 'PRO' | 'PRC';

function escapeLikeStem(stem: string): string {
  return stem.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export async function nextKid(table: string, prefix: KidPrefix, tenantId = getDefaultTenantId()): Promise<string> {
  const yy = new Date().getFullYear().toString().slice(-2);
  const stem = `${prefix}-${yy}-`;
  const row = await queryOne<{ max_num: number | null }>(
    `select max(nullif(regexp_replace(kid, '^${escapeLikeStem(stem)}', ''), '')::int) as max_num
       from ${table}
      where tenant_id = $1 and kid like $2`,
    [tenantId, `${stem}%`],
  );
  const next = String((row?.max_num ?? 0) + 1).padStart(4, '0');
  return `${stem}${next}`;
}

export function workTypeToPrefix(workType: string): KidPrefix {
  if (workType === 'project') return 'PRJ';
  if (workType === 'warranty') return 'WRN';
  return 'WO';
}

export function engagementTypeToWorkType(engagementType: string): 'project' | 'work_order' | 'warranty' {
  if (engagementType === 'project' || engagementType === 'internal') return 'project';
  if (engagementType.startsWith('warranty')) return 'warranty';
  return 'work_order';
}

export function driveTemplateForEngagement(engagementType: string): 'project_full' | 'wo_small' | 'wo_large' {
  if (engagementType === 'project' || engagementType === 'internal') return 'project_full';
  if (engagementType === 'work_order_large' || engagementType === 'warranty_large') return 'wo_large';
  return 'wo_small';
}
