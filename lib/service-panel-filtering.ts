export type ServicePanelFilterableWO = {
  id: string;
  name: string;
  description: string;
  status: string;
  contact: string;
  island: string;
  address: string;
  assignedTo: string;
  dateReceived: string;
};

export const SERVICE_PANEL_STAGE_KEYS = [
  'lead',
  'quoted',
  'accepted',
  'approved',
  'deposit_received',
  'materials_ordered',
  'materials_received',
  'ready_to_schedule',
  'scheduled',
  'in_progress',
  'work_complete',
  'completed',
  'invoiced',
  'paid',
  'closed',
  'lost',
] as const;

export const SERVICE_COMPLETED_STAGE_KEYS = ['closed', 'completed', 'work_complete'] as const;

export function normalizeServicePanelStatus(raw: string): string {
  switch (raw) {
    case 'quote':
    case 'quote_requested': return 'lead';
    case 'accepted':        return 'approved';
    default:                return raw || 'lead';
  }
}

export function filterAndSortServiceWOs<T extends ServicePanelFilterableWO>(
  workOrders: T[],
  options: {
    filter: string;
    search: string;
    sort: string;
    showCompleted: boolean;
    showDeclined: boolean;
  },
): T[] {
  const searchLower = options.search.toLowerCase();
  const completedStatuses = new Set<string>(SERVICE_COMPLETED_STAGE_KEYS);
  const acceptedStatuses = new Set(['accepted', 'approved']);

  const filteredWOs = workOrders.filter(wo => {
    if (wo.status === 'lost' && !options.showDeclined && !options.search && options.filter === 'all') return false;
    if (completedStatuses.has(wo.status) && !options.showCompleted && !options.search && options.filter === 'all') return false;
    if (options.filter !== 'all') {
      if (options.filter === 'accepted') {
        if (!acceptedStatuses.has(wo.status)) return false;
      } else if (options.filter === 'closed') {
        if (!completedStatuses.has(wo.status)) return false;
      } else if (wo.status !== options.filter) {
        return false;
      }
    }
    if (options.search) {
      const q = searchLower;
      if (!(
        wo.name.toLowerCase().includes(q) ||
        wo.description.toLowerCase().includes(q) ||
        wo.contact.toLowerCase().includes(q) ||
        wo.island.toLowerCase().includes(q) ||
        wo.address.toLowerCase().includes(q) ||
        wo.id.toLowerCase().includes(q) ||
        wo.assignedTo.toLowerCase().includes(q)
      )) return false;
    }
    return true;
  });

  return [...filteredWOs].sort((a, b) => {
    switch (options.sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'status': {
        const ai = SERVICE_PANEL_STAGE_KEYS.findIndex(s => s === a.status);
        const bi = SERVICE_PANEL_STAGE_KEYS.findIndex(s => s === b.status);
        return ai - bi;
      }
      case 'date_asc': return (a.dateReceived || '').localeCompare(b.dateReceived || '');
      case 'date_desc': return (b.dateReceived || '').localeCompare(a.dateReceived || '');
      default: return 0;
    }
  });
}

export function groupServiceWOsByStage<T extends { status: string }>(
  workOrders: T[],
  stageKeys: readonly string[] = SERVICE_PANEL_STAGE_KEYS,
): Record<string, T[]> {
  const byStatus: Record<string, T[]> = {};
  for (const stage of stageKeys) {
    byStatus[stage] = workOrders.filter(w => w.status === stage);
  }
  return byStatus;
}
