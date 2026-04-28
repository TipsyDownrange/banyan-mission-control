import {
  serviceWOMatchesSearch,
  type ServicePanelSearchableWO,
} from '@/lib/service-panel-filtering';

const legacyRenumberedFrank: ServicePanelSearchableWO = {
  id: 'WO-26-8396',
  name: 'Frank Shultz supply install 2 laminated glass panels',
  description: '7010 Makena Rd wooden frames',
  contact: 'Frank Shultz',
  island: 'Maui',
  address: '7010 Makena Rd',
  assignedTo: '',
  legacy_wo_ids: 'WO-B2616723',
};

describe('Service panel WO search', () => {
  it('finds a renumbered WO by its legacy WO ID alias', () => {
    expect(serviceWOMatchesSearch(legacyRenumberedFrank, 'WO-B2616723')).toBe(true);
  });

  it('still finds WOs by canonical WO ID', () => {
    expect(serviceWOMatchesSearch(legacyRenumberedFrank, 'WO-26-8396')).toBe(true);
  });

  it('leaves rows without legacy aliases unaffected', () => {
    expect(serviceWOMatchesSearch({
      ...legacyRenumberedFrank,
      id: 'WO-26-8397',
      name: 'Other Customer',
      contact: 'Other',
      legacy_wo_ids: '',
    }, 'WO-B2616723')).toBe(false);
  });
});
