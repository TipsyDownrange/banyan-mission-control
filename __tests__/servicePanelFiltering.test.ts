import {
  filterAndSortServiceWOs,
  groupServiceWOsByStage,
  normalizeServicePanelStatus,
  type ServicePanelFilterableWO,
} from '@/lib/service-panel-filtering';

const frankLead: ServicePanelFilterableWO = {
  id: 'WO-26-0007',
  name: 'Frank Schultz supply install 2 laminated glass panels',
  description: '7010 Makena Rd wooden frames',
  status: 'lead',
  contact: 'Frank Schultz',
  island: 'Maui',
  address: '7010 Makena Rd',
  assignedTo: '',
  dateReceived: '2026-04-27',
};

describe('Service panel filtering', () => {
  it('includes the same frank lead result in list output and New Lead board bucket', () => {
    const filtered = filterAndSortServiceWOs([
      frankLead,
      { ...frankLead, id: 'WO-26-0008', name: 'Other Customer', contact: 'Other', status: 'scheduled' },
    ], {
      filter: 'all',
      search: 'frank',
      sort: 'date_desc',
      showCompleted: false,
      showDeclined: false,
    });

    const byStatus = groupServiceWOsByStage(filtered);

    expect(filtered.map(wo => wo.id)).toEqual(['WO-26-0007']);
    expect(byStatus.lead.map(wo => wo.id)).toEqual(['WO-26-0007']);
  });

  it('normalizes quote/request statuses into the visible New Lead lane', () => {
    expect(normalizeServicePanelStatus('quote')).toBe('lead');
    expect(normalizeServicePanelStatus('quote_requested')).toBe('lead');
    expect(normalizeServicePanelStatus('')).toBe('lead');
  });
});
