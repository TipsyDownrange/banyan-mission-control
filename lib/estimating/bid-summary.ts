export interface BidSummaryLike {
  bidVersionId: string;
  jobId: string;
  projectName: string;
  clientGC?: string;
  island?: string;
  bidDate?: string;
  estimator?: string;
  status: string;
  totalEstimate?: string;
  priority?: string;
  version?: string;
  notes?: string;
  bidFolderUrl?: string;
  getRate?: string;
  profitPct?: string;
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function pickMoneyRange(record: Record<string, unknown>): string | undefined {
  const low = Number(record.estValueLow ?? record.estimateLow ?? 0) || 0;
  const high = Number(record.estValueHigh ?? record.estimateHigh ?? 0) || 0;
  const contract = Number(record.contractValue ?? 0) || 0;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (contract > 0) return fmt(contract);
  if (low > 0 && high > 0) return low === high ? fmt(low) : `${fmt(low)}–${fmt(high)}`;
  if (low > 0) return fmt(low);
  if (high > 0) return fmt(high);
  return undefined;
}

export function normalizeBidSummary(raw: Record<string, unknown>): BidSummaryLike {
  const bidVersionId = pickString(raw, ['bidVersionId', 'bid_version_id', 'kID', 'kid', 'bid_id', 'id']);
  const projectName = pickString(raw, ['projectName', 'project_name', 'jobName', 'Job Name', 'name']);
  const status = pickString(raw, ['status', 'bidStatus', 'bid_state', 'winLoss', 'Win / Loss']) || 'Draft';

  return {
    bidVersionId,
    jobId: pickString(raw, ['jobId', 'job_id', 'linkedProjectKID', 'work_record_id']) || bidVersionId,
    projectName: projectName || 'Untitled Bid',
    clientGC: pickString(raw, ['clientGC', 'client_gc_name', 'gcName', 'bidSource', 'Bid Source']) || undefined,
    island: pickString(raw, ['island', 'Island']) || undefined,
    bidDate: pickString(raw, ['bidDate', 'bid_due_date', 'dueDate', 'Due Date', 'receivedDate']) || undefined,
    estimator: pickString(raw, ['estimator', 'assignedTo', 'Assigned To']) || undefined,
    status,
    totalEstimate: pickString(raw, ['totalEstimate', 'total_estimate']) || pickMoneyRange(raw),
    priority: pickString(raw, ['priority']) || undefined,
    version: pickString(raw, ['version']) || undefined,
    notes: pickString(raw, ['notes', 'Notes']) || undefined,
    bidFolderUrl: pickString(raw, ['bidFolderUrl', 'estimatingFolderPath', 'bidPlatformURL']) || undefined,
    getRate: pickString(raw, ['getRate']) || undefined,
    profitPct: pickString(raw, ['profitPct']) || undefined,
  };
}
