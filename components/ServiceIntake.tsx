'use client';
import { useState, useEffect, useRef } from 'react';
import PlacesAutocomplete from '@/components/PlacesAutocomplete';
import type { ParsedPlace } from '@/components/PlacesAutocomplete';
import type { CustomerRecord } from '@/app/api/service/customers/route';
import { normalizePhone, normalizeEmail, normalizeName } from '@/lib/normalize';

type WODraft = {
  businessName: string;  // Maps to name column (C)
  customerName: string;  // Maps to customer_name column (M)
  address: string; city: string; island: string; areaOfIsland: string;
  contactPerson: string; contactPhone: string; contactEmail: string;
  description: string; systemType: string; urgency: string;
  assignedTo: string; notes: string;
};

type StepTemplate = { step_name: string; default_hours: number; category?: string };

type CrewMember = { user_id: string; name: string; role: string; island: string };

const FL = (label: string, auto?: boolean) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b' }}>{label}</span>
    {auto && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Auto</span>}
  </div>
);

const INP: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box' };
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer', WebkitAppearance: 'none' };

const SYSTEM_TYPES = [
  // Glass replacement / service
  'IG Unit Replacement',
  'Single Lite Replacement',
  'Laminated Glass Replacement',
  'Tempered Glass Replacement',
  // Storefront & curtainwall
  'Storefront',
  'Storefront Repair',
  'Window Wall',
  'Curtainwall',
  'Curtainwall Repair',
  // Doors
  'Exterior Doors',
  'Interior Doors',
  'Automatic Entrances',
  'Door Hardware / Closer',
  'Sliding Door Repair',
  // Specialty
  'Shower Enclosure',
  'Mirror',
  'Skylights',
  'Railing / Glass Guard',
  'Louvers',
  // Panels & screens
  'Aluminum Composite Panels',
  'Metal Screen Wall',
  // Service-specific
  'Window / Door Adjustment',
  'Sealant / Caulk / Weatherseal',
  'Screen Repair / Replacement',
  'Board-Up / Emergency',
  'Site Assessment / Consultation',
  'Block Frame Window',
  'Other',
];
const ISLANDS = ['Oahu','Maui','Kauai','Hawaii','Molokai','Lanai'];

// ── Autocomplete helpers ────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(20,184,166,0.18)', color: '#0f766e', padding: 0, borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function AutocompleteInput({
  value, onChange, onSelect, placeholder, style, customers, matchField, subField,
}: {
  value: string;
  onChange: (val: string) => void;
  onSelect: (c: CustomerRecord) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  customers: CustomerRecord[];
  matchField: keyof CustomerRecord;
  subField?: keyof CustomerRecord;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const fieldVal = (c: CustomerRecord) => String(c[matchField] || '');
  const filtered = value.length >= 2
    ? customers
        .filter(c => fieldVal(c).toLowerCase().includes(value.toLowerCase()) && fieldVal(c) !== '')
        .slice(0, 8)
    : [];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (value.length >= 2) setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder={placeholder}
        style={style}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'white', borderRadius: 10, border: '1px solid #e2e8f0',
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', overflow: 'hidden', marginTop: 4,
        }}>
          {filtered.map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(c); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', minHeight: 44, border: 'none', background: 'white',
                cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {highlightMatch(fieldVal(c), value)}
                </span>
                {c.island && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, color: '#0f766e', background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.15)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {c.island}
                  </span>
                )}
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>
                  {c.woCount} past WO{c.woCount !== 1 ? 's' : ''}
                </span>
              </div>
              {subField && c[subField] && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(c[subField])}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hawaii city → island + area detection ──────────────────────────────────

const HAWAII_CITY_MAP: Array<{ patterns: string[]; island: string; area: string }> = [
  // Maui
  { patterns: ['kahului', 'wailuku'], island: 'Maui', area: 'Central Maui' },
  { patterns: ['lahaina', 'napili', 'kapalua', 'kaanapali', 'olowalu'], island: 'Maui', area: 'West Maui' },
  { patterns: ['kihei', 'wailea', 'makena', 'maalaea'], island: 'Maui', area: 'South Maui' },
  { patterns: ['kula', 'makawao', 'pukalani', 'upcountry', 'keokea', 'omaopio'], island: 'Maui', area: 'Upcountry Maui' },
  { patterns: ['paia', 'haiku', 'haliimaile', 'kuau'], island: 'Maui', area: 'North Maui' },
  { patterns: ['hana', 'kipahulu', 'keanae'], island: 'Maui', area: 'East Maui' },
  // Oahu
  { patterns: ['honolulu', 'waikiki', 'manoa', 'kaimuki', 'nuuanu', 'downtown', 'palolo', 'moiliili'], island: 'Oahu', area: 'Honolulu' },
  { patterns: ['kailua', 'kaneohe', 'waimanalo', 'hauula', 'laie', 'kahuku', 'kaaawa'], island: 'Oahu', area: 'Windward Oahu' },
  { patterns: ['pearl city', 'aiea', 'waipahu', 'mililani', 'wahiawa', 'halawa'], island: 'Oahu', area: 'Central Oahu' },
  { patterns: ['ewa beach', 'ewa', 'kapolei', 'ko olina', 'makakilo', 'barbers point'], island: 'Oahu', area: 'Leeward Oahu' },
  { patterns: ['hawaii kai', 'aina haina', 'portlock', 'kuliouou', 'east honolulu'], island: 'Oahu', area: 'East Oahu' },
  { patterns: ['north shore', 'haleiwa', 'waialua', 'pupukea', 'sunset beach'], island: 'Oahu', area: 'North Shore Oahu' },
  // Kauai
  { patterns: ['lihue', 'kapaa', 'wailua'], island: 'Kauai', area: 'East Kauai' },
  { patterns: ['poipu', 'koloa', 'omao', 'lawai', 'kalaheo'], island: 'Kauai', area: 'South Kauai' },
  { patterns: ['princeville', 'hanalei', 'kilauea'], island: 'Kauai', area: 'North Kauai' },
  { patterns: ['waimea', 'hanapepe', 'eleele', 'kekaha', 'pakala'], island: 'Kauai', area: 'West Kauai' },
  // Big Island
  { patterns: ['hilo', 'keaau', 'mountain view'], island: 'Hawaii', area: 'Hilo' },
  { patterns: ['kailua-kona', 'kailua kona', 'keauhou', 'holualoa', 'honalo', 'captain cook', 'kealakekua'], island: 'Hawaii', area: 'Kona' },
  { patterns: ['kamuela', 'kohala', 'waikoloa', 'kawaihae'], island: 'Hawaii', area: 'Kohala' },
  { patterns: ['pahoa', 'lanipuna', 'kalapana'], island: 'Hawaii', area: 'Puna' },
  { patterns: ['volcano', 'naalehu', 'pahala'], island: 'Hawaii', area: "Ka'u" },
  // Molokai + Lanai
  { patterns: ['kaunakakai', 'molokai'], island: 'Molokai', area: 'Molokai' },
  { patterns: ['lanai city', 'lanai'], island: 'Lanai', area: 'Lanai' },
];

function detectIslandAndArea(text: string): { island: string; area: string } {
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

// Apply a full customer record (from Customer/Account Name or Contact Person autocomplete)
function applyCustomerRecord(prev: WODraft, c: CustomerRecord): WODraft {
  const det = detectIslandAndArea(c.address);
  return {
    ...prev,
    customerName:  c.company || prev.customerName,
    address:       prev.address || c.address,
    island:        prev.island || c.island || det.island,
    areaOfIsland:  prev.areaOfIsland || det.area,
    contactPerson: prev.contactPerson || c.contactPerson,
    contactPhone:  prev.contactPhone || c.phone || c.contactPhone,
    contactEmail:  prev.contactEmail || c.email,
  };
}

// Apply address selection only (address autocomplete)
function applyAddressRecord(prev: WODraft, c: CustomerRecord): WODraft {
  const det = detectIslandAndArea(c.address);
  return {
    ...prev,
    address:      c.address,
    island:       prev.island || c.island || det.island,
    areaOfIsland: prev.areaOfIsland || det.area,
  };
}

const BLANK: WODraft = {
  businessName: '', customerName: '', address: '', city: '', island: '', areaOfIsland: '',
  contactPerson: '', contactPhone: '', contactEmail: '',
  description: '', systemType: '', urgency: 'normal',
  assignedTo: '', notes: '',
};

export default function ServiceIntake({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdWO, setCreatedWO] = useState('');
  const [draft, setDraft] = useState<WODraft>({ ...BLANK });
  const [pms, setPms] = useState<CrewMember[]>([]);
  const [fieldCrew, setFieldCrew] = useState<CrewMember[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [templateNames, setTemplateNames] = useState<Set<string>>(new Set());
  // Multi-select system types
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [allSystemTypes, setAllSystemTypes] = useState<string[]>(SYSTEM_TYPES);

  // Load PMs + customers + step templates on mount
  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => {
        setPms(d.pms || []);
        setFieldCrew(d.crew || []);
      })
      .catch(() => {});
    fetch('/api/service/customers')
      .then(r => r.json())
      .then(d => setCustomers(d.customers || []))
      .catch(() => {});
    fetch('/api/step-templates')
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.templates) {
          const names = new Set<string>(Object.keys(d.templates));
          setTemplateNames(names);
          // Build unified list: Step Library templates FIRST (primary source),
          // then any SYSTEM_TYPES entries not already covered by a template.
          const templateList = Array.from(names);
          const fallbackOnly = SYSTEM_TYPES.filter(t => !names.has(t));
          setAllSystemTypes([...templateList, ...fallbackOnly]);
        }
      })
      .catch(() => {});
  }, []);

  // When island changes, refresh field crew for that island
  useEffect(() => {
    if (!draft.island) return;
    fetch(`/api/crew?island=${draft.island}`)
      .then(r => r.json())
      .then(d => setFieldCrew(d.crew || []))
      .catch(() => {});
  }, [draft.island]);

  function update(key: keyof WODraft, val: string) {
    setDraft(prev => ({ ...prev, [key]: val }));
  }

  function toggleSystemType(type: string) {
    setSelectedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      setDraft(d => ({ ...d, systemType: next.join(',') }));
      return next;
    });
  }

  async function enrichWithKai() {
    if (!draft.description) return;
    setLoading(true);
    try {
      const res = await fetch('/api/service/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: draft.description }),
      });
      const data = await res.json();
      if (data.workOrder) {
        const wo = data.workOrder;
        const det = detectIslandAndArea(wo.address || '');
        setDraft(prev => ({
          ...prev,
          customerName:  wo.customerName  || prev.customerName,
          address:       wo.address       || prev.address,
          city:          wo.city          || prev.city,
          island:        wo.island        || prev.island || det.island,
          areaOfIsland:  prev.areaOfIsland || det.area,
          contactPerson: wo.contactPerson || prev.contactPerson,
          contactPhone:  wo.contactPhone  || prev.contactPhone,
          description:   wo.description   || prev.description,
          systemType:    wo.systemType    || prev.systemType,
          urgency:       wo.urgency       || prev.urgency,
        }));
        // Sync multi-select chips from Kai-filled systemType
        if (wo.systemType) {
          const types = wo.systemType.split(',').map((t: string) => t.trim()).filter(Boolean);
          setSelectedTypes(types);
        }
      }
    } catch {}
    setLoading(false);
  }

  async function submit() {
    if (!draft.customerName || !draft.description || !draft.island) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/service/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          businessName: draft.businessName,
          areaOfIsland: draft.areaOfIsland,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to create work order');
        setSaving(false);
        return;
      }
      setCreatedWO(data.woNumber || '');
      setStep('done');
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
    setSaving(false);
  }

  const canSubmit = !saving && (draft.businessName || draft.customerName) && draft.description && draft.island;

  // PM options — always available regardless of island
  const pmOptions = pms.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
  // Field crew options — filtered by island
  const crewOptions = fieldCrew.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
  // Combined assign-to list: PMs first, then island crew
  const assignOptions = [
    ...pmOptions.filter(c => c.role.toLowerCase().includes('service') || c.role.toLowerCase().includes('pm')),
    ...crewOptions,
  ].filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);

  if (step === 'done') return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdfa', border: '2px solid rgba(15,118,110,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Work Order Created</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{draft.businessName || draft.customerName} · {draft.island}</div>
      {createdWO && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>WO# {createdWO}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => { setStep('form'); setDraft({ ...BLANK }); setSelectedTypes([]); setCreatedWO(''); }}
          style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Another
        </button>
        <button onClick={onClose}
          style={{ padding: '10px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
      {/* Header */}
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>Service — New Lead</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>Create Work Order</h2>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'grid', gap: 14 }}>

        {/* Description + Kai fill */}
        <div>
          {FL('Job description / scope')}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={draft.description} onChange={e => update('description', e.target.value)}
              placeholder="Describe what they need — Kai will extract customer, contact, island, and system type automatically..."
              rows={3} style={{ ...INP, flex: 1, resize: 'none', lineHeight: 1.5 }} />
            <button onClick={enrichWithKai} disabled={!draft.description || loading}
              style={{ padding: '8px 14px', borderRadius: 10, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: draft.description && !loading ? 'pointer' : 'default', background: draft.description ? 'rgba(240,253,250,0.96)' : '#f8fafc', color: draft.description ? '#0f766e' : '#94a3b8', border: draft.description ? '1px solid rgba(15,118,110,0.2)' : '1px solid #e2e8f0', alignSelf: 'flex-start', whiteSpace: 'nowrap' as const }}>
              {loading ? '...' : 'Fill →'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Paste a description and hit Fill → to auto-populate fields</div>
        </div>

        {/* Customer & Site Information */}
        <div style={{ background: 'rgba(248,250,252,0.8)', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 16px', display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>Customer &amp; Site Information</div>

          <div>
            {FL('Business / Property Name')}
            <AutocompleteInput
              value={draft.businessName}
              onChange={v => update('businessName', v)}
              onSelect={c => setDraft(prev => applyCustomerRecord(prev, c))}
              placeholder='"Shell Station", "Westin Nanea", "John&apos;s Residence"'
              style={INP}
              customers={customers}
              matchField="company"
              subField="address"
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>The specific site or property — goes in the WO name</div>
          </div>

          <div>
            {FL('Customer / Account Name')}
            <AutocompleteInput
              value={draft.customerName}
              onChange={v => update('customerName', v)}
              onSelect={c => setDraft(prev => applyCustomerRecord(prev, c))}
              placeholder='"Shell Oil Co", "Starwood Hotels", "John Smith"'
              style={INP}
              customers={customers}
              matchField="company"
              subField="address"
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>The billing account — selecting auto-fills address &amp; contacts below</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              {FL('Contact Person', customers.some(c => c.contactPerson))}
              <AutocompleteInput
                value={draft.contactPerson}
                onChange={v => update('contactPerson', v)}
                onSelect={c => setDraft(prev => applyCustomerRecord(prev, c))}
                placeholder="Person on site"
                style={INP}
                customers={customers}
                matchField="contactPerson"
                subField="company"
              />
            </div>
            <div>
              {FL('Contact Phone')}
              <input type="tel" value={draft.contactPhone} onChange={e => update('contactPhone', e.target.value)} onBlur={e => update('contactPhone', normalizePhone(e.target.value))} placeholder="(808) 555-0199" style={INP} />
            </div>
          </div>

          <div>
            {FL('Contact Email')}
            <input type="email" value={draft.contactEmail} onChange={e => update('contactEmail', e.target.value)} onBlur={e => update('contactEmail', normalizeEmail(e.target.value))} placeholder="email@example.com" style={INP} />
          </div>

          <div>
            {FL('Site Address')}
            <PlacesAutocomplete
              value={draft.address}
              onChange={v => update('address', v)}
              onSelect={(place: ParsedPlace) => setDraft(prev => ({
                ...prev,
                address: place.formatted_address,
                city: place.city || prev.city,
                island: place.island || prev.island,
                areaOfIsland: detectIslandAndArea(place.formatted_address).area || prev.areaOfIsland,
              }))}
              placeholder="Start typing an address…"
              style={INP}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Google Places — address auto-detects island &amp; area</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              {FL('Island')}
              <select value={draft.island} onChange={e => update('island', e.target.value)} style={SEL}>
                <option value="">Select island</option>
                {ISLANDS.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              {FL('Area of Island', !!draft.island)}
              <input
                value={draft.areaOfIsland}
                onChange={e => update('areaOfIsland', e.target.value)}
                placeholder={draft.island === 'Maui' ? 'e.g. South Maui' : draft.island === 'Oahu' ? 'e.g. Honolulu' : draft.island === 'Kauai' ? 'e.g. East Kauai' : draft.island === 'Hawaii' ? 'e.g. Kona' : 'Auto-detected from address'}
                style={INP}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>{FL('City')}<input value={draft.city} onChange={e => update('city', e.target.value)} placeholder="City" style={INP} /></div>
            <div>
              {FL('Urgency')}
              <select value={draft.urgency} onChange={e => update('urgency', e.target.value)} style={SEL}>
                <option value="normal">Normal</option>
                <option value="urgent">⚡ Urgent</option>
                <option value="low">Low priority</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            {FL('System Type')}
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>✓ = has install steps in Step Library</div>
            {/* Compact dropdown + chip list */}
            <select
              value=""
              onChange={e => { if (e.target.value) toggleSystemType(e.target.value); }}
              style={{ ...SEL, marginBottom: selectedTypes.length > 0 ? 6 : 0 }}
            >
              <option value="">Add system type…</option>
              {allSystemTypes.map(t => {
                const hasTemplate = templateNames.has(t);
                const isSelected = selectedTypes.includes(t);
                return (
                  <option key={t} value={t} disabled={isSelected}>
                    {hasTemplate ? `✓ ${t}` : t}{isSelected ? ' (selected)' : ''}
                  </option>
                );
              })}
            </select>
            {selectedTypes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {selectedTypes.map(t => {
                  const hasTemplate = templateNames.has(t);
                  return (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.25)' }}>
                      {t}
                      {hasTemplate && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#0f766e', background: 'rgba(15,118,110,0.12)', padding: '1px 4px', borderRadius: 4, border: '1px solid rgba(15,118,110,0.2)' }}>✓</span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleSystemType(t)}
                        style={{ background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, fontWeight: 900, display: 'flex', alignItems: 'center' }}
                        aria-label={`Remove ${t}`}
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            {FL('Assign To')}
            <select value={draft.assignedTo} onChange={e => update('assignedTo', e.target.value)} style={SEL}>
              <option value="">Select crew member</option>
              {assignOptions.length > 0
                ? assignOptions.map(c => (
                    <option key={c.user_id} value={c.name}>{c.name} — {c.role}</option>
                  ))
                : <option disabled>Select an island first</option>
              }
            </select>
          </div>
        </div>

        <div>{FL('Notes')}<textarea value={draft.notes} onChange={e => update('notes', e.target.value)} placeholder="Any additional context..." rows={2} style={{ ...INP, resize: 'none' }} /></div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
        <button onClick={submit} disabled={!canSubmit}
          style={{ flex: 2, padding: '11px', borderRadius: 12, background: canSubmit ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0', color: canSubmit ? 'white' : '#94a3b8', border: 'none', fontSize: 13, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default', boxShadow: canSubmit ? '0 4px 16px rgba(15,118,110,0.3)' : 'none' }}>
          {saving ? 'Creating...' : 'Create Work Order'}
        </button>
      </div>
    </div>
  );
}
