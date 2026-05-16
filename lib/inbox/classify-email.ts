export type EmailCategory = 'bid_invite' | 'change_order' | 'payment' | 'vendor_quote' | 'internal' | 'other';
export type EmailPriority = 'high' | 'medium' | 'low';

export type EmailClassification = {
  category: EmailCategory;
  priority: EmailPriority;
  kaiNote: string;
};

const FLIGHT_ADMIN_TERMS = [
  'flight is booked',
  'flight booking',
  'boarding pass',
  'airline',
  'itinerary',
  'record locator',
  'travel booked',
];

const LODGING_ADMIN_TERMS = [
  'hotel',
  'lodging',
  'check-in',
  'check in',
  'guest',
  'room',
  'nights',
];

const RESERVATION_TERMS = ['your reservation', 'reservation number', 'reservation confirmation'];
const RENTAL_CAR_TERMS = ['rental car', 'car rental'];
const CHANGE_ORDER_TERMS = ['pcd', 'change order', 'change notice', 'pci', 'bulletin'];

function containsAny(text: string, terms: string[]) {
  return terms.some(term => text.includes(term));
}

export function isTravelAdminEmail(subject: string, sender: string, snippet: string): boolean {
  const s = `${subject} ${snippet} ${sender}`.toLowerCase();
  if (containsAny(s, FLIGHT_ADMIN_TERMS) || containsAny(s, RENTAL_CAR_TERMS)) return true;
  if (containsAny(s, RESERVATION_TERMS) && containsAny(s, LODGING_ADMIN_TERMS)) return true;
  return false;
}

export function classifyEmail(subject: string, sender: string, snippet: string): EmailClassification {
  const s = `${subject} ${snippet} ${sender}`.toLowerCase();

  // BAN-246: travel/admin logistics are not pricing/change-order work even when
  // they arrive through internal forwards or contain generic words like "reservation".
  if (isTravelAdminEmail(subject, sender, snippet)) {
    return { category: 'internal', priority: 'low', kaiNote: 'Travel/admin logistics — review for calendar or itinerary follow-up, not change-order pricing.' };
  }

  if (s.includes('invitation to bid') || s.includes('bid invite') || s.includes('rfp') || s.includes('bid package') || (s.includes('bid') && s.includes('due'))) {
    return { category: 'bid_invite', priority: 'medium', kaiNote: 'New bid opportunity — review scope and assign to estimator.' };
  }

  if (containsAny(s, CHANGE_ORDER_TERMS)) {
    return { category: 'change_order', priority: 'high', kaiNote: 'Change order or design change — pricing response likely required.' };
  }

  if (s.includes('payment') || s.includes('pay app') || s.includes('invoice') || s.includes('disbursed') || s.includes('bill.com')) {
    return { category: 'payment', priority: 'medium', kaiNote: 'Payment or billing action item.' };
  }

  if (s.includes('quote') || s.includes('lead time') || (s.includes('re:') && (s.includes('glass') || s.includes('storefront')))) {
    return { category: 'vendor_quote', priority: 'low', kaiNote: 'Vendor quote — file or forward to PM.' };
  }

  if (sender.toLowerCase().includes('kulaglass.com')) {
    return { category: 'internal', priority: 'medium', kaiNote: 'Internal forward — review and action or delegate.' };
  }

  return { category: 'other', priority: 'low', kaiNote: 'Review and categorize manually.' };
}
