/**
 * BanyanOS Data Normalization
 * Single source of truth for all data formatting.
 * Every input component and API route imports from here.
 */

/** Phone → (808) 555-0199 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 7) {
    return `(808) ${digits.slice(0,3)}-${digits.slice(3)}`;
  }
  return raw; // Return as-is if we can't parse
}

/** Email → lowercase, trimmed */
export function normalizeEmail(raw: string): string {
  if (!raw) return '';
  return raw.toLowerCase().trim();
}

/** Name → Title Case (preserving McX, O'X patterns) */
export function normalizeName(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  // If not ALL CAPS, preserve original
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 2 && letters !== letters.toUpperCase()) return trimmed;
  // ALL CAPS → Title Case
  return trimmed.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/\bO'(\w)/g, (_, c) => `O'${c.toUpperCase()}`);
}

/** Currency string → number (strips $, commas) */
export function normalizeCurrency(raw: string): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Format number as currency display: $1,234.56 */
export function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Date → YYYY-MM-DD (ISO) */
export function normalizeDate(raw: string): string {
  if (!raw) return '';
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Try Date parse
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

/** Hours string → decimal number */
export function normalizeHours(raw: string): number {
  if (!raw) return 0;
  // HH:MM format
  const hm = raw.match(/^(\d+):(\d{2})$/);
  if (hm) return parseInt(hm[1]) + parseInt(hm[2]) / 60;
  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

/** Island name → canonical form */
export function normalizeIsland(raw: string): string {
  if (!raw) return '';
  const l = raw.toLowerCase().trim();
  if (l === 'oahu' || l === 'o\'ahu') return 'Oahu';
  if (l === 'maui') return 'Maui';
  if (l === 'kauai' || l === 'kaua\'i') return 'Kauai';
  if (l === 'hawaii' || l === 'hawai\'i' || l === 'big island' || l === 'the big island') return 'Hawaii';
  if (l === 'lanai' || l === 'lana\'i') return 'Lanai';
  if (l === 'molokai' || l === 'moloka\'i') return 'Molokai';
  // Title case fallback
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** Area of island → canonical island */
export function areaToIsland(area: string): string {
  const a = (area || '').toLowerCase();
  if (['oahu','honolulu','kapolei','kailua','kaneohe','pearl city','aiea','ewa','hawaii kai','waipahu','mililani'].some(c => a.includes(c))) return 'Oahu';
  if (['maui','kahului','kihei','lahaina','wailuku','wailea','kapalua','paia','makawao','haiku','maalaea','pukalani','kaanapali','napili'].some(c => a.includes(c))) return 'Maui';
  if (['kauai','lihue','kapaa','poipu','princeville','koloa','waimea','eleele'].some(c => a.includes(c))) return 'Kauai';
  if (['hilo','kona','waimea','kohala','kailua-kona','volcano','kamuela'].some(c => a.includes(c))) return 'Hawaii';
  if (['lanai'].some(c => a.includes(c))) return 'Lanai';
  if (['molokai'].some(c => a.includes(c))) return 'Molokai';
  return area;
}

/** Resolve mixed island/city/area strings into a canonical island */
export function resolveWorkOrderIsland(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const raw = (value || '').trim();
    if (!raw) continue;
    const normalized = normalizeIsland(raw);
    if (['Oahu', 'Maui', 'Kauai', 'Hawaii', 'Lanai', 'Molokai'].includes(normalized)) {
      return normalized;
    }
    const byArea = areaToIsland(raw);
    if (['Oahu', 'Maui', 'Kauai', 'Hawaii', 'Lanai', 'Molokai'].includes(byArea)) {
      return byArea;
    }
  }
  return '';
}

/**
 * Split smartsheet-style multi-value strings like:
 *   Name1','Name2','Name3
 *   Name1; Name2
 *   Name1, Name2
 */
export function parseDelimitedList(raw: string): string[] {
  const text = (raw || '').trim();
  if (!text) return [];

  const normalized = text
    .replace(/^\[|\]$/g, '')
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '');

  const parts = normalized
    .split(/'\s*,\s*'|"\s*,\s*"|,\s*(?=(?:[^"]*"[^"]*")*[^"]*$)|;\s*|\r?\n|\|/g)
    .map(part => part.trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, ''))
    .filter(Boolean);

  return Array.from(new Set(parts));
}

/** Normalize multi-contact strings into a clean display/save value */
export function normalizeContactList(raw: string): string {
  return parseDelimitedList(raw).join(', ');
}

/** Status → canonical lowercase */
export function normalizeStatus(raw: string): string {
  const s = (raw || '').toLowerCase().trim();
  const MAP: Record<string, string> = {
    'quote': 'lead',
    'quote_requested': 'lead',
    'requesting a proposal': 'lead',
    'need to schedule': 'approved',
    'accepted': 'approved',
    'fabricating': 'in_progress',
    'measured': 'lead',
    'completed': 'closed',
    'dispatched': 'in_progress',
  };
  return MAP[s] || s;
}
