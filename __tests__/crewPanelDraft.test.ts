import { buildCrewUpdatePayload, type Draft, type CrewProfileField } from '@/components/CrewPanel';

describe('CrewPanel draft payloads', () => {
  it('keeps profile edits local by producing no payload before Save has dirty fields', () => {
    const draft: Draft = {
      phone: '808-555-9999',
      title: 'Updated Title',
      home_address: '123 Old Home Rd',
      emergency_contact: 'Pat Contact 808',
    };

    expect(buildCrewUpdatePayload(draft, [])).toEqual({});
  });

  it('sends only intended dirty fields on Save', () => {
    const draft: Draft = {
      phone: '808-555-9999',
      title: 'Updated Title',
      home_address: '123 Old Home Rd',
      emergency_contact: 'Pat Contact 808',
    };
    const dirtyFields: CrewProfileField[] = ['phone', 'title'];

    expect(buildCrewUpdatePayload(draft, dirtyFields)).toEqual({
      phone: '808-555-9999',
      title: 'Updated Title',
    });
  });

  it('does not send home address or emergency contact unless those fields are dirty', () => {
    const draft: Draft = {
      phone: '808-555-9999',
      home_address: '123 Old Home Rd',
      emergency_contact: 'Pat Contact 808',
    };

    expect(buildCrewUpdatePayload(draft, ['phone'])).toEqual({
      phone: '808-555-9999',
    });
  });

  it('can intentionally clear a dirty field with an empty string', () => {
    const draft: Draft = { home_address: '' };

    expect(buildCrewUpdatePayload(draft, ['home_address'])).toEqual({
      home_address: '',
    });
  });

  it('never includes user_id in the partial update fields', () => {
    const draft: Draft = { user_id: 'USR-001', phone: '808-555-9999' };

    expect(buildCrewUpdatePayload(draft, ['user_id', 'phone'])).toEqual({
      phone: '808-555-9999',
    });
  });
});
