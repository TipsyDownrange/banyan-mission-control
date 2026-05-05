'use client';
import { useState, useEffect, useRef } from 'react';
import PlacesAutocomplete from '@/components/PlacesAutocomplete';
import type { ParsedPlace } from '@/components/PlacesAutocomplete';
import AutocompleteInput from '@/components/shared/AutocompleteInput';
import type { CustomerRecord } from '@/app/api/service/customers/route';
import { normalizePhone, normalizeEmail, normalizeName } from '@/lib/normalize';
import {
  applyCustomerRecord,
  confirmLegacyAccountAddress,
  detectIslandAndArea,
  type ServiceIntakeDraft,
} from '@/lib/service-intake-customer';

type StepTemplate = { step_name: string; default_hours: number; category?: string };

type CrewMember = { user_id: string; name: string; role: string; island: string };

const FL = (label: string, auto?: boolean, places?: boolean) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b' }}>{label}</span>
    {auto && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Auto</span>}
    {places && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: 'rgba(66,133,244,0.1)', color: '#1a56db', border: '1px solid rgba(66,133,244,0.25)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Places</span>}
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

// AutocompleteInput is now in components/shared/AutocompleteInput.tsx — imported above

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

const BLANK: ServiceIntakeDraft = {
  businessName: '', customerName: '', address: '', city: '', state: 'HI', zip: '', island: '', areaOfIsland: '',
  contactPerson: '', contactPhone: '', contactEmail: '',
  description: '', systemType: '', urgency: 'normal',
  assignedTo: '', notes: '',
  siteAddressExplicit: false,
  legacyAccountAddress: undefined,
};

// BAN-138: Site/jobsite fields the operator must explicitly fill — any change
// to one of these via the form flips siteAddressExplicit on so submit unblocks.
const SITE_ADDRESS_FIELDS: ReadonlyArray<keyof ServiceIntakeDraft> = [
  'address', 'city', 'state', 'zip', 'island', 'areaOfIsland',
];

export default function ServiceIntake({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdWO, setCreatedWO] = useState('');
  const [draft, setDraft] = useState<ServiceIntakeDraft>({ ...BLANK });
  const [pms, setPms] = useState<CrewMember[]>([]);
  const [fieldCrew, setFieldCrew] = useState<CrewMember[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [templateNames, setTemplateNames] = useState<Set<string>>(new Set());
  // Multi-select system types
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [allSystemTypes, setAllSystemTypes] = useState<string[]>(SYSTEM_TYPES);
  // Org contact picker
  const [orgContacts, setOrgContacts] = useState<Array<{contact_id: string; name: string; phone: string; email: string; title: string; is_primary: boolean}>>([]);

  // Load PMs + customers + step templates on mount
  useEffect(() => {
    fetch('/api/crew')
      .then(r => r.json())
      .then(d => {
        setPms(d.pms || []);
        setFieldCrew(d.crew || []);
      })
      .catch(() => {});
    // GC-D053: Customers table is the source of truth for customer_id.
    fetch('/api/service/customers')
      .then(r => r.json())
      .then(d => {
        const customerRows = d.customers || [];
        setCustomers(customerRows);
      })
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

  // When org changes, fetch contacts for the contact picker
  useEffect(() => {
    if (!draft.org_id) { setOrgContacts([]); return; }
    fetch(`/api/contacts?org_id=${draft.org_id}`)
      .then(r => r.json())
      .then(d => setOrgContacts(d.contacts || []))
      .catch(err => { console.error('[ServiceIntake] fetchOrgContacts', err); setOrgContacts([]); });
  }, [draft.org_id]);

  function update(key: keyof ServiceIntakeDraft, val: string) {
    setDraft(prev => {
      const next: ServiceIntakeDraft = { ...prev, [key]: val };
      // BAN-138: any operator edit to a jobsite field counts as an explicit
      // confirmation that this is the real site address (not legacy account
      // metadata silently inherited from a Customer record).
      if (SITE_ADDRESS_FIELDS.includes(key)) next.siteAddressExplicit = true;
      return next;
    });
  }

  function toggleSystemType(type: string) {
    setSelectedTypes(prev => {
      const next = prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type];
      setDraft(d => ({ ...d, systemType: next.join(',') }));
      return next;
    });
  }

  async function submit() {
    if (!draft.customerName || !draft.description || !draft.island) return;
    if (!draft.customer_id) {
      setError('Select an existing customer/account before creating a work order — customer_id required by GC-D053.');
      return;
    }
    // BAN-138: Customer/Account selection identifies billing identity, not the
    // jobsite. Operator must explicitly enter, select, or confirm a Site
    // Address before we'll dispatch a Work Order.
    if (!draft.address.trim() || !draft.siteAddressExplicit) {
      setError('Confirm the jobsite Site Address before creating this Work Order — legacy account address is not trusted as the jobsite (BAN-138).');
      return;
    }
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

  const canSubmit = !saving
    && !!draft.customer_id
    && !!(draft.businessName || draft.customerName)
    && !!draft.description
    && !!draft.island
    // BAN-138: explicit jobsite address gate — see submit() for full comment.
    && !!draft.address.trim()
    && !!draft.siteAddressExplicit;

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

        {/* Description / scope */}
        <div>
          {FL('Job description / scope')}
          <textarea value={draft.description} onChange={e => update('description', e.target.value)}
            placeholder="Describe what needs to be done, where it is, and any constraints..."
            rows={3} style={{ ...INP, resize: 'none', lineHeight: 1.5 }} />
        </div>

        {/* Customer & Site Information */}
        <div style={{ background: 'rgba(248,250,252,0.8)', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 16px', display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>Customer &amp; Site Information</div>

          <div>
            {FL('Business / Property Name', true)}
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
            {FL('Customer / Account Name', true)}
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
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Billing / account identity — selecting auto-fills contacts. Site Address is set separately.</div>
            {draft.customerName.length >= 2 && !customers.some(c =>
              (c.company || '').toLowerCase().includes(draft.customerName.toLowerCase()) ||
              (c.name || '').toLowerCase().includes(draft.customerName.toLowerCase())
            ) && (
              <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 11px', marginTop: 6, lineHeight: 1.5 }}>
                No existing customer matches &quot;{draft.customerName}&quot;. Select an existing customer/account before creating the work order.
              </div>
            )}
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
              {orgContacts.length > 0 && (
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Contacts:</span>
                  {orgContacts.map(oc => (
                    <button
                      key={oc.contact_id}
                      type="button"
                      onClick={() => setDraft(prev => ({
                        ...prev,
                        contactPerson: oc.name,
                        contactPhone: oc.phone || prev.contactPhone,
                        contactEmail: oc.email || prev.contactEmail,
                      }))}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                        border: '1px solid #e2e8f0', background: oc.is_primary ? '#f0fdf4' : 'white',
                        color: oc.is_primary ? '#0f766e' : '#475569',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                      }}
                    >
                      {oc.is_primary && <span>⭐</span>}{oc.name}{oc.title ? ` · ${oc.title}` : ''}
                    </button>
                  ))}
                </div>
              )}
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
            {FL('Site Address / Jobsite', false, true)}
            <PlacesAutocomplete
              value={draft.address}
              onChange={v => update('address', v)}
              onSelect={(place: ParsedPlace) => setDraft(prev => ({
                ...prev,
                address: place.street || place.formatted_address,
                city: place.city || prev.city,
                state: place.state || prev.state,
                zip: place.zip || prev.zip,
                island: place.island || prev.island,
                areaOfIsland: detectIslandAndArea(place.city || place.formatted_address).area || prev.areaOfIsland,
                // BAN-138: PlacesAutocomplete pick is an explicit jobsite confirmation.
                siteAddressExplicit: true,
              }))}
              placeholder="Where the work is performed (Google Places)"
              style={INP}
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
              Where the work happens — not the billing address. Google Places auto-detects island &amp; area.
            </div>
            {/* BAN-138: warn-only surfacing of legacy Customers.Address. Not auto-trusted. */}
            {draft.legacyAccountAddress && !draft.siteAddressExplicit && (
              <div style={{
                marginTop: 8,
                padding: '9px 12px',
                borderRadius: 10,
                background: '#fef3c7',
                border: '1px solid #fde68a',
                fontSize: 12,
                color: '#92400e',
                lineHeight: 1.5,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>
                  Legacy account address found — confirm the actual jobsite before creating this Work Order.
                </div>
                <div style={{ marginBottom: 6 }}>
                  Customers table has <span style={{ fontFamily: 'monospace' }}>{draft.legacyAccountAddress}</span> on file for this account. This may be a stale billing/mailing address, not where the work is happening today.
                </div>
                <button
                  type="button"
                  onClick={() => setDraft(prev => confirmLegacyAccountAddress(prev))}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                    border: '1px solid #d97706', background: 'white', color: '#b45309', cursor: 'pointer',
                  }}
                >
                  Use legacy address as jobsite
                </button>
              </div>
            )}
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
              {FL('State')}
              <select value={draft.state} onChange={e => update('state', e.target.value)} style={SEL}>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              {FL('ZIP')}
              <input
                value={draft.zip}
                onChange={e => update('zip', e.target.value)}
                placeholder="96793"
                maxLength={10}
                style={INP}
              />
            </div>
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
