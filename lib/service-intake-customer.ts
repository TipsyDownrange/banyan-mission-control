import type { CustomerRecord } from '@/app/api/service/customers/route';

export type ServiceIntakeDraft = {
  businessName: string;
  customerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  island: string;
  areaOfIsland: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  description: string;
  systemType: string;
  urgency: string;
  assignedTo: string;
  notes: string;
  org_id?: string;
  customer_id?: string;
};

const HAWAII_CITY_MAP: Array<{ patterns: string[]; island: string; area: string }> = [
  { patterns: ['kahului', 'wailuku'], island: 'Maui', area: 'Central Maui' },
  { patterns: ['lahaina', 'napili', 'kapalua', 'kaanapali', 'olowalu'], island: 'Maui', area: 'West Maui' },
  { patterns: ['kihei', 'wailea', 'makena', 'maalaea'], island: 'Maui', area: 'South Maui' },
  { patterns: ['kula', 'makawao', 'pukalani', 'upcountry', 'keokea', 'omaopio'], island: 'Maui', area: 'Upcountry Maui' },
  { patterns: ['paia', 'haiku', 'haliimaile', 'kuau'], island: 'Maui', area: 'North Maui' },
  { patterns: ['hana', 'kipahulu', 'keanae'], island: 'Maui', area: 'East Maui' },
  { patterns: ['honolulu', 'waikiki', 'manoa', 'kaimuki', 'nuuanu', 'downtown', 'palolo', 'moiliili'], island: 'Oahu', area: 'Honolulu' },
  { patterns: ['kailua', 'kaneohe', 'waimanalo', 'hauula', 'laie', 'kahuku', 'kaaawa'], island: 'Oahu', area: 'Windward Oahu' },
  { patterns: ['pearl city', 'aiea', 'waipahu', 'mililani', 'wahiawa', 'halawa'], island: 'Oahu', area: 'Central Oahu' },
  { patterns: ['ewa beach', 'ewa', 'kapolei', 'ko olina', 'makakilo', 'barbers point'], island: 'Oahu', area: 'Leeward Oahu' },
  { patterns: ['hawaii kai', 'aina haina', 'portlock', 'kuliouou', 'east honolulu'], island: 'Oahu', area: 'East Oahu' },
  { patterns: ['north shore', 'haleiwa', 'waialua', 'pupukea', 'sunset beach'], island: 'Oahu', area: 'North Shore Oahu' },
  { patterns: ['lihue', 'kapaa', 'wailua'], island: 'Kauai', area: 'East Kauai' },
  { patterns: ['poipu', 'koloa', 'omao', 'lawai', 'kalaheo'], island: 'Kauai', area: 'South Kauai' },
  { patterns: ['princeville', 'hanalei', 'kilauea'], island: 'Kauai', area: 'North Kauai' },
  { patterns: ['waimea', 'hanapepe', 'eleele', 'kekaha', 'pakala'], island: 'Kauai', area: 'West Kauai' },
  { patterns: ['hilo', 'keaau', 'mountain view'], island: 'Hawaii', area: 'Hilo' },
  { patterns: ['kailua-kona', 'kailua kona', 'keauhou', 'holualoa', 'honalo', 'captain cook', 'kealakekua'], island: 'Hawaii', area: 'Kona' },
  { patterns: ['kamuela', 'kohala', 'waikoloa', 'kawaihae'], island: 'Hawaii', area: 'Kohala' },
  { patterns: ['pahoa', 'lanipuna', 'kalapana'], island: 'Hawaii', area: 'Puna' },
  { patterns: ['volcano', 'naalehu', 'pahala'], island: 'Hawaii', area: "Ka'u" },
  { patterns: ['kaunakakai', 'molokai'], island: 'Molokai', area: 'Molokai' },
  { patterns: ['lanai city', 'lanai'], island: 'Lanai', area: 'Lanai' },
];

export function detectIslandAndArea(text: string): { island: string; area: string } {
  if (!text) return { island: '', area: '' };
  const lower = text.toLowerCase();
  for (const entry of HAWAII_CITY_MAP) {
    if (entry.patterns.some(p => lower.includes(p))) {
      return { island: entry.island, area: entry.area };
    }
  }
  for (const isl of ['Oahu', 'Maui', 'Kauai', 'Hawaii', 'Molokai', 'Lanai']) {
    if (lower.includes(isl.toLowerCase())) return { island: isl, area: '' };
  }
  return { island: '', area: '' };
}

export function parseAddressParts(address: string): { city: string; state: string; zip: string } {
  const result = { city: '', state: '', zip: '' };
  if (!address) return result;

  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) result.zip = zipMatch[1];

  const stateZipMatch = address.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/i);
  if (stateZipMatch) result.state = stateZipMatch[1].toUpperCase();

  const beforeState = stateZipMatch ? address.slice(0, stateZipMatch.index).trim() : address;
  const cityCandidate = beforeState.split(',').map(p => p.trim()).filter(Boolean).pop();
  if (cityCandidate && !/\d/.test(cityCandidate)) result.city = cityCandidate;
  if (!result.city) {
    const lower = beforeState.toLowerCase();
    const match = HAWAII_CITY_MAP.flatMap(entry => entry.patterns).find(pattern => lower.includes(pattern));
    if (match) {
      result.city = match
        .split(' ')
        .map(word => word ? word[0].toUpperCase() + word.slice(1) : word)
        .join(' ');
    }
  }

  return result;
}

export function applyCustomerRecord(prev: ServiceIntakeDraft, c: CustomerRecord): ServiceIntakeDraft {
  const det = detectIslandAndArea(c.address);
  const parsedAddress = parseAddressParts(c.address);
  const selectedName = c.company || c.name || c.contactPerson || '';

  return {
    ...prev,
    businessName:  selectedName || prev.businessName,
    customerName:  selectedName || prev.customerName,
    address:       c.address || prev.address,
    city:          c.city || parsedAddress.city || prev.city,
    state:         c.state || parsedAddress.state || prev.state,
    zip:           c.zip || parsedAddress.zip || prev.zip,
    island:        prev.island || c.island || det.island,
    areaOfIsland:  prev.areaOfIsland || det.area,
    contactPerson: prev.contactPerson || c.contactPerson,
    contactPhone:  prev.contactPhone || c.phone || c.contactPhone,
    contactEmail:  prev.contactEmail || c.email,
    customer_id:   c.customerId || prev.customer_id,
  };
}

export function applyAddressRecord(prev: ServiceIntakeDraft, c: CustomerRecord): ServiceIntakeDraft {
  const det = detectIslandAndArea(c.address);
  const parsedAddress = parseAddressParts(c.address);
  return {
    ...prev,
    address:      c.address,
    city:         c.city || parsedAddress.city || prev.city,
    state:        c.state || parsedAddress.state || prev.state,
    zip:          c.zip || parsedAddress.zip || prev.zip,
    island:       prev.island || c.island || det.island,
    areaOfIsland: prev.areaOfIsland || det.area,
  };
}
