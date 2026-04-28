import type { CustomerRecord } from '@/app/api/service/customers/route';
import {
  applyCustomerRecord,
  parseAddressParts,
  type ServiceIntakeDraft,
} from '@/lib/service-intake-customer';

const blankDraft: ServiceIntakeDraft = {
  businessName: '',
  customerName: '',
  address: '',
  city: '',
  state: 'HI',
  zip: '',
  island: '',
  areaOfIsland: '',
  contactPerson: '',
  contactPhone: '',
  contactEmail: '',
  description: '',
  systemType: '',
  urgency: 'normal',
  assignedTo: '',
  notes: '',
};

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    customerId: 'CUS-0053',
    name: 'Sean Daniels',
    company: 'Sean Daniels',
    contactPerson: 'Sean Daniels',
    title: '',
    phone: '(808) 555-0199',
    phone2: '',
    email: 'sean@example.com',
    address: '18 Waokele Pl, Kula, HI 96790, USA',
    city: '',
    state: '',
    zip: '',
    island: 'Maui',
    woCount: 1,
    firstWODate: '',
    lastWODate: '',
    source: 'customers-tab',
    contact: '(808) 555-0199',
    contactPhone: '(808) 555-0199',
    org_id: 'org_6ivgve2uvsk',
    ...overrides,
  };
}

describe('Service Intake customer propagation', () => {
  it('parses city, state, and zip from a full Hawaii address', () => {
    expect(parseAddressParts('18 Waokele Pl, Kula, HI 96790, USA')).toEqual({
      city: 'Kula',
      state: 'HI',
      zip: '96790',
    });
  });

  it('parses city from a Hawaii address even when the city comma is missing', () => {
    expect(parseAddressParts('18 Waokele Pl Kula HI 96790')).toEqual({
      city: 'Kula',
      state: 'HI',
      zip: '96790',
    });
  });

  it('fills customer, business, contact, address, city, state, zip, island, and area from the selected customer', () => {
    const next = applyCustomerRecord(blankDraft, customer());

    expect(next.businessName).toBe('Sean Daniels');
    expect(next.customerName).toBe('Sean Daniels');
    expect(next.contactPerson).toBe('Sean Daniels');
    expect(next.contactPhone).toBe('(808) 555-0199');
    expect(next.contactEmail).toBe('sean@example.com');
    expect(next.address).toBe('18 Waokele Pl, Kula, HI 96790, USA');
    expect(next.city).toBe('Kula');
    expect(next.state).toBe('HI');
    expect(next.zip).toBe('96790');
    expect(next.island).toBe('Maui');
    expect(next.areaOfIsland).toBe('Upcountry Maui');
    expect(next.customer_id).toBe('CUS-0053');
    expect(next.org_id).toBe('org_6ivgve2uvsk');
  });

  it('uses an explicit Customers API city when present', () => {
    const next = applyCustomerRecord(blankDraft, customer({ city: 'Kula', state: 'HI', zip: '96790' }));

    expect(next.city).toBe('Kula');
    expect(next.state).toBe('HI');
    expect(next.zip).toBe('96790');
  });

  it('falls back to contact/name for Business / Property Name when company is blank', () => {
    const next = applyCustomerRecord(blankDraft, customer({ company: '', name: '', contactPerson: 'Sean Daniels' }));

    expect(next.businessName).toBe('Sean Daniels');
    expect(next.customerName).toBe('Sean Daniels');
  });
});
