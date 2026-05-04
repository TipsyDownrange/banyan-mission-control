import {
  normalizeServicePanelStatus,
  serviceWOMatchesSearch,
  SERVICE_COMPLETED_STAGE_KEYS,
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

describe('Service panel status mapping', () => {
  it('maps searched estimated records into the visible Quoted board lane', () => {
    expect(normalizeServicePanelStatus('estimated')).toBe('quoted');
  });

  it('keeps canonical active board stages stable', () => {
    expect(normalizeServicePanelStatus('lead')).toBe('lead');
    expect(normalizeServicePanelStatus('accepted')).toBe('approved');
    expect(normalizeServicePanelStatus('approved')).toBe('approved');
    expect(normalizeServicePanelStatus('scheduled')).toBe('scheduled');
    expect(normalizeServicePanelStatus('in_progress')).toBe('in_progress');
  });

  it('maps quote-like legacy statuses to visible lanes', () => {
    expect(normalizeServicePanelStatus('quote')).toBe('quoted');
    expect(normalizeServicePanelStatus('quoted')).toBe('quoted');
    expect(normalizeServicePanelStatus('quote_requested')).toBe('lead');
  });

  it('maps declined and cancelled statuses to the declined lane', () => {
    expect(normalizeServicePanelStatus('declined')).toBe('lost');
    expect(normalizeServicePanelStatus('cancelled')).toBe('lost');
    expect(normalizeServicePanelStatus('canceled')).toBe('lost');
  });

  it('keeps completed statuses grouped as completed work', () => {
    expect(SERVICE_COMPLETED_STAGE_KEYS).toEqual(['closed', 'completed', 'work_complete', 'invoiced', 'paid']);
    expect(normalizeServicePanelStatus('completed')).toBe('completed');
  });

  it('puts a legacy-ID search result with estimated status into a visible board bucket', () => {
    const boardRows = [
      { ...legacyRenumberedFrank, status: normalizeServicePanelStatus('estimated') },
      { ...legacyRenumberedFrank, id: 'WO-26-9999', legacy_wo_ids: '', status: normalizeServicePanelStatus('lead') },
    ].filter(wo => serviceWOMatchesSearch(wo, 'WO-B2616723'));

    const quotedBucket = boardRows.filter(wo => wo.status === 'quoted');

    expect(boardRows.map(wo => wo.id)).toEqual(['WO-26-8396']);
    expect(quotedBucket.map(wo => wo.id)).toEqual(['WO-26-8396']);
  });

  it('puts a canonical-ID search result with estimated status into a visible board bucket', () => {
    const boardRows = [
      { ...legacyRenumberedFrank, status: normalizeServicePanelStatus('estimated') },
    ].filter(wo => serviceWOMatchesSearch(wo, 'WO-26-8396'));

    const quotedBucket = boardRows.filter(wo => wo.status === 'quoted');

    expect(quotedBucket.map(wo => wo.id)).toEqual(['WO-26-8396']);
  });
});
