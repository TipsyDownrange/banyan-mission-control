import type { CustomerRecord } from '@/app/api/service/customers/route';
import {
  applyCustomerRecord,
  confirmLegacyAccountAddress,
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
  siteAddressExplicit: false,
  legacyAccountAddress: undefined,
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

  it('fills business / customer / contact identity and customer_id / org_id from the selected customer', () => {
    const next = applyCustomerRecord(blankDraft, customer());

    expect(next.businessName).toBe('Sean Daniels');
    expect(next.customerName).toBe('Sean Daniels');
    expect(next.contactPerson).toBe('Sean Daniels');
    expect(next.contactPhone).toBe('(808) 555-0199');
    expect(next.contactEmail).toBe('sean@example.com');
    expect(next.customer_id).toBe('CUS-0053');
    expect(next.org_id).toBe('org_6ivgve2uvsk');
  });

  // BAN-138: Customer/Account autocomplete must NOT silently set the jobsite
  // address from the legacy Customers.Address. Previously this caused
  // CUS-0053 (Sean Daniels) to autofill 99 Puamana St, even though the
  // current jobsite is 18 Waokele Pl. The legacy value is stored as a
  // suggestion for warning UI only.
  it('does not copy legacy Customers.Address into the active jobsite address', () => {
    const seeded: ServiceIntakeDraft = { ...blankDraft, address: '', city: '', state: 'HI', zip: '', island: '', areaOfIsland: '' };
    const next = applyCustomerRecord(seeded, customer({ address: '99 Puamana St, Wailuku, HI 96793, USA' }));

    expect(next.address).toBe('');
    expect(next.city).toBe('');
    expect(next.zip).toBe('');
    expect(next.island).toBe('');
    expect(next.areaOfIsland).toBe('');
  });

  it('preserves any operator-entered jobsite address when an account is then selected', () => {
    const seeded: ServiceIntakeDraft = { ...blankDraft, address: '18 Waokele Pl', siteAddressExplicit: true };
    const next = applyCustomerRecord(seeded, customer({ address: '99 Puamana St, Wailuku, HI 96793, USA' }));

    expect(next.address).toBe('18 Waokele Pl');
    // Account selection still resets the explicit flag — operator must
    // re-confirm the jobsite belongs to this newly selected account.
    expect(next.siteAddressExplicit).toBe(false);
  });

  it('exposes the legacy Customers.Address as a warning suggestion (not the trusted jobsite)', () => {
    const next = applyCustomerRecord(blankDraft, customer({ address: '99 Puamana St, Wailuku, HI 96793, USA' }));

    expect(next.legacyAccountAddress).toBe('99 Puamana St, Wailuku, HI 96793, USA');
    expect(next.siteAddressExplicit).toBe(false);
    // Address field stays empty — operator must explicitly confirm/replace.
    expect(next.address).toBe('');
  });

  it('omits legacyAccountAddress when the customer record has no address on file', () => {
    const next = applyCustomerRecord(blankDraft, customer({ address: '' }));
    expect(next.legacyAccountAddress).toBeUndefined();
    expect(next.siteAddressExplicit).toBe(false);
  });

  it('confirmLegacyAccountAddress copies the suggestion into the jobsite and flips the explicit flag', () => {
    const afterPick = applyCustomerRecord(blankDraft, customer({ address: '99 Puamana St, Wailuku, HI 96793, USA' }));
    const confirmed = confirmLegacyAccountAddress(afterPick);

    expect(confirmed.address).toBe('99 Puamana St, Wailuku, HI 96793, USA');
    expect(confirmed.city).toBe('Wailuku');
    expect(confirmed.state).toBe('HI');
    expect(confirmed.zip).toBe('96793');
    expect(confirmed.island).toBe('Maui');
    expect(confirmed.siteAddressExplicit).toBe(true);
  });

  it('confirmLegacyAccountAddress is a no-op when no legacy address is on file', () => {
    const next = confirmLegacyAccountAddress({ ...blankDraft });
    expect(next.address).toBe('');
    expect(next.siteAddressExplicit).toBeFalsy();
  });

  it('falls back to contact/name for Business / Property Name when company is blank', () => {
    const next = applyCustomerRecord(blankDraft, customer({ company: '', name: '', contactPerson: 'Sean Daniels' }));

    expect(next.businessName).toBe('Sean Daniels');
    expect(next.customerName).toBe('Sean Daniels');
  });
});
