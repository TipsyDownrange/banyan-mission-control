'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type LaborStep = {
  id: string;
  description: string;
  hours: string;
  rate: string;
  amountOverride: string;
};

type MaterialLine = {
  id: string;
  description: string;
  qty: string;
  unit: string;
  unitCost: string;
  totalOverride: string;
  unitType?: 'SF' | 'LF' | 'EA' | 'Tube';
  width: string;
  height: string;
  length: string;
};

type AdditionalCost = {
  id: string;
  description: string;
  amount: string;
};

type DriveTimeState = {
  trips: string;
  hoursPerTrip: string;
  rate: string;
  totalOverride: string;
  hoursManual: boolean;
};

type Markup = {
  overheadPct: string;
  profitPct: string;
  getRate: string;
};

type WOData = {
  woNumber: string;
  name: string;
  address: string;
  island: string;
  contact: string;
  description: string;
  assignedTo: string;
};

// ─── Drive time lookup ────────────────────────────────────────────────────────

function lookupDriveHours(address: string): number {
  if (!address) return 1;
  const a = address.toLowerCase();
  if (a.includes('hana')) return 4;
  if (a.includes('kapalua')) return 2;
  if (a.includes('lahaina') || a.includes('kaanapali') || a.includes('ka\'anapali')) return 1.5;
  if (a.includes('upcountry') || a.includes('up country')) return 1.5;
  if (a.includes('kihei') || a.includes('wailea') || a.includes('makena')) return 1;
  if (a.includes('haiku') || a.includes('ha\'iku') || a.includes('paia') || a.includes('pa\'ia')) return 1;
  if (a.includes('kula') || a.includes('makawao') || a.includes('pukalani')) return 1;
  if (a.includes('wailuku')) return 0.5;
  if (a.includes('kahului')) return 0.5;
  // Default for unknown
  return 1;
}

function driveAreaLabel(address: string): string {
  if (!address) return 'Unknown area';
  const a = address.toLowerCase();
  if (a.includes('hana')) return 'Hana';
  if (a.includes('kapalua')) return 'Kapalua';
  if (a.includes('lahaina') || a.includes('kaanapali')) return 'Lahaina / Ka\'anapali';
  if (a.includes('upcountry')) return 'Upcountry';
  if (a.includes('kihei')) return 'Kihei';
  if (a.includes('wailea')) return 'Wailea';
  if (a.includes('haiku') || a.includes('ha\'iku')) return 'Ha\'iku';
  if (a.includes('paia') || a.includes('pa\'ia')) return 'Pā\'ia';
  if (a.includes('kula')) return 'Kula';
  if (a.includes('makawao')) return 'Makawao';
  if (a.includes('pukalani')) return 'Pukalani';
  if (a.includes('wailuku')) return 'Wailuku';
  if (a.includes('kahului')) return 'Kahului';
  return 'Maui';
}

// ─── Unit type auto-detection ────────────────────────────────────────────────

function detectUnitType(desc: string): 'SF' | 'LF' | 'EA' | 'Tube' {
  const d = desc.toLowerCase();
  if (['glass', 'mirror', 'igu', 'laminated', 'tempered', 'panel'].some(k => d.includes(k))) return 'SF';
  if (['caulking', 'sealant', 'backer rod', 'tape', 'weatherseal'].some(k => d.includes(k))) return 'LF';
  if (['closer', 'handle', 'hardware', 'lock', 'hinge'].some(k => d.includes(k))) return 'EA';
  if (['tube', 'cartridge'].some(k => d.includes(k))) return 'Tube';
  return 'EA';
}

// ─── ID factory ───────────────────────────────────────────────────────────────

let _id = 0;
function uid() { return `id-${++_id}-${Math.random().toString(36).slice(2, 6)}`; }

// ─── Design tokens ────────────────────────────────────────────────────────────

const FONT = '-apple-system, "SF Pro Display", Inter, system-ui, sans-serif';

// Green input (editable)
const GREEN_INPUT: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid rgba(20,184,166,0.35)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT,
  fontVariantNumeric: 'tabular-nums',
  color: '#0f172a',
  background: 'rgba(240,253,244,0.75)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

// Orange display (auto-calc)
const ORANGE_DISPLAY: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid rgba(245,158,11,0.3)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: FONT,
  fontVariantNumeric: 'tabular-nums',
  color: '#92400e',
  background: 'rgba(255,251,235,0.8)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
  textAlign: 'right' as const,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s?.replace(/[$,]/g, '') ?? '');
  return isNaN(n) ? 0 : n;
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GreenInput({
  value, onChange, placeholder, type = 'text', step, min, style,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; step?: string; min?: string; style?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      inputMode={type === 'number' ? 'decimal' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      step={step}
      min={min}
      onFocus={e => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => setFocused(false)}
      style={{
        ...GREEN_INPUT,
        border: focused ? '1px solid #14b8a6' : '1px solid rgba(20,184,166,0.35)',
        background: focused ? '#f0fdf4' : 'rgba(240,253,244,0.75)',
        ...style,
      }}
    />
  );
}

function OrangeDisplay({ value, isManual, onClick }: { value: string; isManual?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...ORANGE_DISPLAY,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
      }}
    >
      {isManual && (
        <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>
          MANUAL
        </span>
      )}
      <span>{value}</span>
    </div>
  );
}

function SectionToggle({
  label, color = '#0f766e', open, onToggle, accent,
}: {
  label: string; color?: string; open: boolean; onToggle: () => void; accent?: string;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0 6px',
        borderBottom: `1px solid ${color}22`,
      }}
    >
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent || `linear-gradient(180deg, ${color}, ${color}99)`, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color, flex: 1, textAlign: 'left', fontFamily: FONT }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color, opacity: 0.5 }}>{open ? '▾' : '▸'}</span>
    </button>
  );
}

function SummaryRow({ label, value, sub = false }: { label: string; value: number; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: sub ? '4px 0' : '6px 0', fontSize: sub ? 12 : 13, color: sub ? '#64748b' : '#0f172a', fontFamily: FONT }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: sub ? 500 : 700 }}>{fmt(value)}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid #e2e8f0', margin: '6px 0' }} />;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultLaborSteps(): LaborStep[] {
  return [
    { id: uid(), description: 'Measurement / Site Visit', hours: '1', rate: '120', amountOverride: '' },
    { id: uid(), description: 'Installation', hours: '4', rate: '120', amountOverride: '' },
  ];
}

function defaultDriveTime(address: string): DriveTimeState {
  return {
    trips: '2',
    hoursPerTrip: String(lookupDriveHours(address)),
    rate: '120',
    totalOverride: '',
    hoursManual: false,
  };
}

function defaultMarkup(): Markup {
  return { overheadPct: '0', profitPct: '10', getRate: '4.5' };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuoteBuilder({ woNumber, onClose }: { woNumber: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [wo, setWo] = useState<WOData | null>(null);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [jobTypes, setJobTypes] = useState<string[]>([]);

  // Section open/close
  const [openSections, setOpenSections] = useState({
    customer: true, scope: true, labor: true,
    driveTime: true, materials: true, additional: true, summary: true,
  });
  function toggleSection(k: keyof typeof openSections) {
    setOpenSections(p => ({ ...p, [k]: !p[k] }));
  }

  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Scope
  const [jobType, setJobType] = useState('');
  const [scopeNarrative, setScopeNarrative] = useState('');

  // Labor
  const [laborSteps, setLaborSteps] = useState<LaborStep[]>(defaultLaborSteps);

  // Drive time
  const [driveTime, setDriveTime] = useState<DriveTimeState>({
    trips: '2', hoursPerTrip: '1', rate: '120', totalOverride: '', hoursManual: false,
  });

  // Materials
  const [mainMaterials, setMainMaterials] = useState<MaterialLine[]>([
    { id: uid(), description: '', qty: '1', unit: 'ea', unitCost: '', totalOverride: '', width: '', height: '', length: '' },
  ]);
  const [consumables, setConsumables] = useState<MaterialLine[]>([]);
  const [freight, setFreight] = useState<MaterialLine[]>([]);

  // Additional costs
  const [additionalCosts, setAdditionalCosts] = useState<AdditionalCost[]>([
    { id: uid(), description: 'Equipment / Lift Rental', amount: '' },
    { id: uid(), description: 'Disposal / Cleanup', amount: '' },
  ]);

  // Markup
  const [markup, setMarkup] = useState<Markup>(defaultMarkup);

  // File attachments
  const quoteFileInputRef = useRef<HTMLInputElement>(null);
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [quoteFileDragging, setQuoteFileDragging] = useState(false);

  // Auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // ─── Load WO ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/service/quote?wo=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setWo(d.wo);
        setJobTypes(d.jobTypes || []);
        if (d.wo?.description) setScopeNarrative(d.wo.description);
        const contact = d.wo?.contact || '';
        const phoneMatch = contact.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
        if (phoneMatch) setCustomerPhone(phoneMatch[1]);
        const namepart = contact.split(/\d/)[0].trim().replace(/[^a-zA-Z\s]/g, '').trim();
        if (namepart) setCustomerName(namepart);
        // Init drive time from address
        const addr = d.wo?.address || '';
        setDriveTime(defaultDriveTime(addr));
        // Defaults from API
        if (d.defaults?.hourlyRate) {
          const rate = String(d.defaults.hourlyRate);
          setLaborSteps(prev => prev.map(s => ({ ...s, rate })));
          setDriveTime(prev => ({ ...prev, rate }));
        }
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [woNumber]);

  // ─── Derived calculations ──────────────────────────────────────────────────

  function laborStepAmount(s: LaborStep): number {
    if (s.amountOverride) return parseNum(s.amountOverride);
    return parseNum(s.hours) * parseNum(s.rate);
  }

  function materialLineTotal(m: MaterialLine): number {
    if (m.totalOverride) return parseNum(m.totalOverride);
    const ut = m.unitType || detectUnitType(m.description);
    if (ut === 'SF') {
      const sf = (parseNum(m.width) * parseNum(m.height) / 144) * parseNum(m.qty);
      return sf * parseNum(m.unitCost);
    }
    if (ut === 'LF') {
      const lf = parseNum(m.length || '0') * parseNum(m.qty);
      return lf * parseNum(m.unitCost);
    }
    return parseNum(m.qty) * parseNum(m.unitCost);
  }

  const laborSubtotal = laborSteps.reduce((a, s) => a + laborStepAmount(s), 0);

  const driveTotal = (() => {
    if (driveTime.totalOverride) return parseNum(driveTime.totalOverride);
    return parseNum(driveTime.trips) * parseNum(driveTime.hoursPerTrip) * parseNum(driveTime.rate);
  })();

  const mainMatTotal = mainMaterials.reduce((a, m) => a + materialLineTotal(m), 0);
  const consumablesTotal = consumables.reduce((a, m) => a + materialLineTotal(m), 0);
  const freightTotal = freight.reduce((a, m) => a + materialLineTotal(m), 0);
  const materialsSubtotal = mainMatTotal + consumablesTotal + freightTotal;

  const additionalTotal = additionalCosts.reduce((a, c) => a + parseNum(c.amount), 0);

  const subtotal = materialsSubtotal + laborSubtotal + driveTotal + additionalTotal;
  const overheadAmt = subtotal * (parseNum(markup.overheadPct) / 100);
  const profitAmt = (subtotal + overheadAmt) * (parseNum(markup.profitPct) / 100);
  const totalBeforeTax = subtotal + overheadAmt + profitAmt;
  const getAmt = totalBeforeTax * (parseNum(markup.getRate) / 100);
  const grandTotal = totalBeforeTax + getAmt;
  const deposit = grandTotal * 0.5;

  // ─── Auto-save (debounced) ─────────────────────────────────────────────────

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch('/api/service/quote/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            woNumber, laborSteps, driveTime, mainMaterials, consumables,
            freight, additionalCosts, markup, customerName, customerEmail,
            customerPhone, scopeNarrative, jobType,
          }),
        });
        setLastSaved(new Date().toISOString());
      } catch { /* silent */ } finally { setSaving(false); }
    }, 1500);
  }, [woNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Labor helpers ─────────────────────────────────────────────────────────

  function addLaborStep(preset?: Partial<LaborStep>) {
    setLaborSteps(prev => [...prev, {
      id: uid(), description: preset?.description || '', hours: '2', rate: '120', amountOverride: '', ...preset,
    }]);
  }

  function updateLaborStep(id: string, patch: Partial<LaborStep>) {
    setLaborSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    scheduleAutoSave();
  }

  function removeLaborStep(id: string) {
    setLaborSteps(prev => prev.filter(s => s.id !== id));
    scheduleAutoSave();
  }

  // ─── Material helpers ──────────────────────────────────────────────────────

  function newMaterialLine(): MaterialLine {
    return { id: uid(), description: '', qty: '1', unit: 'ea', unitCost: '', totalOverride: '', width: '', height: '', length: '' };
  }

  function updateMaterial(setter: React.Dispatch<React.SetStateAction<MaterialLine[]>>, id: string, patch: Partial<MaterialLine>) {
    setter(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
    scheduleAutoSave();
  }

  function removeMaterial(setter: React.Dispatch<React.SetStateAction<MaterialLine[]>>, id: string) {
    setter(prev => prev.filter(m => m.id !== id));
    scheduleAutoSave();
  }

  // ─── Generate quote ────────────────────────────────────────────────────────

  async function generateQuote() {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/service/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          woNumber,
          customerName, customerEmail, customerPhone,
          customerAddress: wo?.address,
          projectDescription: wo?.name,
          siteAddress: wo?.address,
          island: wo?.island,
          scopeNarrative,
          jobType,
          // V2 fields
          laborSteps: laborSteps.map(s => ({
            description: s.description,
            hours: parseNum(s.hours),
            rate: parseNum(s.rate),
            amount: laborStepAmount(s),
          })),
          driveTimeCost: driveTotal,
          driveTimeTrips: parseNum(driveTime.trips),
          driveTimeHoursPerTrip: parseNum(driveTime.hoursPerTrip),
          driveTimeRate: parseNum(driveTime.rate),
          materialsTotal: materialsSubtotal,
          additionalCosts: additionalCosts.filter(c => c.amount),
          additionalTotal,
          laborSubtotal,
          subtotal,
          overheadPct: parseNum(markup.overheadPct),
          overheadAmt,
          profitPct: parseNum(markup.profitPct),
          profitAmt,
          totalBeforeTax,
          getRate: parseNum(markup.getRate),
          getAmt,
          grandTotal,
          // Legacy compat
          installationIncluded: true,
          crewCount: 1,
          hourlyRate: 120,
          equipmentCharges: additionalCosts.find(c => c.description.toLowerCase().includes('equipment'))?.amount || 0,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setQuote(data.quote); }
    } catch (e) { setError(String(e)); }
    setGenerating(false);
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const row: React.CSSProperties = { display: 'grid', gap: 8, marginBottom: 8 };
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3, display: 'block', fontFamily: FONT };

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading WO {woNumber}…</div>
    </div>
  );

  // ─── Quote Preview ─────────────────────────────────────────────────────────

  if (quote) return (
    <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Quote Ready</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>WO {woNumber}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setQuote(null)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>← Edit</button>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✕ Close</button>
          <button disabled={downloading} onClick={async () => {
            setDownloading(true);
            try {
              const res = await fetch('/api/service/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote, sendEmail: false }) });
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `Proposal-WO-${woNumber}.pdf`; a.click();
              URL.revokeObjectURL(url);
            } catch (e) { alert('PDF failed: ' + e); }
            setDownloading(false);
          }} style={{ padding: '8px 16px', borderRadius: 10, background: downloading ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: downloading ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: downloading ? 'default' : 'pointer' }}>
            {downloading ? 'Generating…' : '⬇ Download PDF'}
          </button>
          <button disabled={emailing || !customerEmail} onClick={async () => {
            if (!customerEmail) { alert('No customer email'); return; }
            setEmailing(true);
            try {
              const res = await fetch('/api/service/proposal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote, sendEmail: true }) });
              const data = await res.json();
              if (data.success) alert('Sent to ' + customerEmail); else alert('Failed: ' + data.error);
            } catch (e) { alert('Email failed: ' + e); }
            setEmailing(false);
          }} style={{ padding: '8px 16px', borderRadius: 10, background: emailing || !customerEmail ? '#e2e8f0' : '#4338ca', color: emailing || !customerEmail ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: emailing || !customerEmail ? 'default' : 'pointer' }}>
            {emailing ? 'Sending…' : '✉ Email Customer'}
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0f766e', marginBottom: 12, borderBottom: '1px solid #0f766e22', paddingBottom: 6 }}>Pricing Summary</div>
        <SummaryRow label="Subtotal" value={subtotal} />
        {overheadAmt > 0 && <SummaryRow label={`Overhead (${markup.overheadPct}%)`} value={overheadAmt} sub />}
        {profitAmt > 0 && <SummaryRow label={`Profit (${markup.profitPct}%)`} value={profitAmt} sub />}
        <Divider />
        <SummaryRow label="Total Before Tax" value={totalBeforeTax} />
        <SummaryRow label={`GET (${markup.getRate}%)`} value={getAmt} sub />
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 18, fontWeight: 900, color: '#0f172a', fontFamily: FONT }}>
          <span>GRAND TOTAL</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(grandTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 13, color: '#0f766e', fontWeight: 700, fontFamily: FONT }}>
          <span>50% Deposit Required</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(deposit)}</span>
        </div>
      </div>

      <div style={{ background: '#f0fdfa', borderRadius: 12, border: '1px solid rgba(15,118,110,0.15)', padding: '14px 18px', fontSize: 12, color: '#0f766e', fontWeight: 600 }}>
        ✓ Quote ready — download PDF or email directly to customer using the buttons above.
      </div>
    </div>
  );

  // ─── Builder Form ──────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', fontFamily: FONT }}>

      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Service Quote</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>WO {woNumber} — {wo?.name?.substring(0, 45)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Saving…</span>}
          {!saving && lastSaved && <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>✓ Saved</span>}
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c' }}>{error}</div>}

        {/* Address + drive area banner */}
        {wo?.address && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(238,242,255,0.6)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 12, color: '#4338ca', fontWeight: 600 }}>
            📍 {wo.address} — <span style={{ opacity: 0.7 }}>{driveAreaLabel(wo.address)} · ~{lookupDriveHours(wo.address)}h/trip</span>
          </div>
        )}

        {/* ── CUSTOMER ─────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Customer Info" color="#0369a1" open={openSections.customer} onToggle={() => toggleSection('customer')} />
          {openSections.customer && (
            <div style={{ paddingTop: 10 }}>
              <div style={{ ...row, gridTemplateColumns: '1fr 1fr' }}>
                <div><label style={label}>Name</label><GreenInput value={customerName} onChange={setCustomerName} placeholder="Customer / company" /></div>
                <div><label style={label}>Phone</label><GreenInput value={customerPhone} onChange={setCustomerPhone} placeholder="808-XXX-XXXX" /></div>
              </div>
              <div><label style={label}>Email</label><GreenInput value={customerEmail} onChange={setCustomerEmail} placeholder="customer@email.com" /></div>
            </div>
          )}
        </div>

        {/* ── SCOPE ────────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Scope of Work" color="#0f766e" open={openSections.scope} onToggle={() => toggleSection('scope')} />
          {openSections.scope && (
            <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={label}>Job Type</label>
                <select value={jobType} onChange={e => setJobType(e.target.value)} style={{ ...GREEN_INPUT, cursor: 'pointer', WebkitAppearance: 'none' }}>
                  <option value="">Select job type…</option>
                  {jobTypes.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={label}>Scope Description</label>
                <textarea value={scopeNarrative} onChange={e => setScopeNarrative(e.target.value)} rows={3}
                  style={{ ...GREEN_INPUT, resize: 'none', lineHeight: '1.5' }} placeholder="Describe the full scope of work…" />
              </div>
            </div>
          )}
        </div>

        {/* ── JOB FILES ─────────────────────────────────────────────── */}
        <div>
          <input
            ref={quoteFileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx"
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files || []);
              setQuoteFiles(prev => [...prev, ...files]);
              e.target.value = '';
            }}
          />
          <div
            onDragOver={e => { e.preventDefault(); setQuoteFileDragging(true); }}
            onDragLeave={() => setQuoteFileDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setQuoteFileDragging(false);
              const files = Array.from(e.dataTransfer.files);
              setQuoteFiles(prev => [...prev, ...files]);
            }}
            onClick={() => quoteFileInputRef.current?.click()}
            style={{
              border: `2px dashed ${quoteFileDragging ? '#14b8a6' : '#cbd5e1'}`,
              borderRadius: 10,
              padding: '12px 16px',
              cursor: 'pointer',
              background: quoteFileDragging ? 'rgba(240,253,250,0.8)' : '#f8fafc',
              transition: 'border-color 0.15s, background 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>📎</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: quoteFileDragging ? '#0f766e' : '#64748b', fontFamily: FONT }}>
                Attach job files — photos, vendor quotes, plans
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, fontFamily: FONT }}>Drop files here or click to browse</div>
            </div>
            {quoteFiles.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: 'rgba(15,118,110,0.08)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(15,118,110,0.15)', flexShrink: 0 }}>
                {quoteFiles.length} file{quoteFiles.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {quoteFiles.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {quoteFiles.map((file, i) => {
                const isPDF = file.type === 'application/pdf';
                const isImage = file.type.startsWith('image/');
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'white', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 13 }}>{isPDF ? '📄' : isImage ? '🖼' : '📎'}</span>
                    <span style={{ flex: 1, fontSize: 12, color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: FONT }}>{file.name}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(file.size / 1024).toFixed(0)} KB</span>
                    {isPDF && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#0369a1', background: '#eff6ff', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(3,105,161,0.2)', flexShrink: 0 }}>Analyze Quote</span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setQuoteFiles(prev => prev.filter((_, j) => j !== i)); }}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── LABOR ────────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Labor Steps" color="#4338ca" open={openSections.labor} onToggle={() => toggleSection('labor')} />
          {openSections.labor && (
            <div style={{ paddingTop: 10 }}>
              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 28px', gap: 6, marginBottom: 4, padding: '0 2px' }}>
                {['Description', 'Hours', 'Rate/hr', 'Amount', ''].map(h => (
                  <div key={h} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</div>
                ))}
              </div>

              {laborSteps.map(step => {
                const autoAmt = parseNum(step.hours) * parseNum(step.rate);
                const displayAmt = step.amountOverride ? parseNum(step.amountOverride) : autoAmt;
                return (
                  <div key={step.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <GreenInput
                      value={step.description}
                      onChange={v => updateLaborStep(step.id, { description: v })}
                      placeholder="Step description"
                    />
                    <GreenInput
                      value={step.hours}
                      onChange={v => updateLaborStep(step.id, { hours: v, amountOverride: '' })}
                      placeholder="hrs"
                      type="number"
                      step="0.5"
                      min="0"
                      style={{ textAlign: 'right' }}
                    />
                    <GreenInput
                      value={step.rate}
                      onChange={v => updateLaborStep(step.id, { rate: v, amountOverride: '' })}
                      placeholder="120"
                      type="number"
                      step="1"
                      min="0"
                      style={{ textAlign: 'right' }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={step.amountOverride || fmtNum(autoAmt)}
                      onChange={e => updateLaborStep(step.id, { amountOverride: e.target.value })}
                      title={step.amountOverride ? 'MANUAL — click to reset' : 'Auto-calculated'}
                      style={{
                        ...ORANGE_DISPLAY,
                        border: step.amountOverride ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(245,158,11,0.3)',
                        background: step.amountOverride ? 'rgba(255,251,235,1)' : 'rgba(255,251,235,0.8)',
                        cursor: 'text',
                        textAlign: 'right',
                      }}
                    />
                    <button
                      onClick={() => removeLaborStep(step.id)}
                      disabled={laborSteps.length <= 1}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: laborSteps.length <= 1 ? 'default' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: laborSteps.length <= 1 ? 0.3 : 1 }}
                    >×</button>
                  </div>
                );
              })}

              {/* Subtotal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '6px 0 10px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Labor Subtotal</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#4338ca', fontVariantNumeric: 'tabular-nums' }}>{fmt(laborSubtotal)}</span>
              </div>

              {/* Add buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: '+ Spotting / Staging', desc: 'Spotting / Material Staging', hours: '1' },
                  { label: '+ Punch List / Return', desc: 'Punch List / Return Visit', hours: '2' },
                  { label: '+ Custom Step', desc: '', hours: '1' },
                ].map(preset => (
                  <button key={preset.label} onClick={() => addLaborStep({ description: preset.desc, hours: preset.hours, rate: '120' })}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(67,56,202,0.3)', background: 'rgba(238,242,255,0.7)', color: '#4338ca', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── DRIVE TIME ───────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Drive Time" color="#0891b2" open={openSections.driveTime} onToggle={() => toggleSection('driveTime')} />
          {openSections.driveTime && (
            <div style={{ paddingTop: 10 }}>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', fontSize: 11, color: '#0369a1', marginBottom: 10 }}>
                📍 Auto-calculated from shop (Kahului) to <strong>{wo?.address ? driveAreaLabel(wo.address) : 'job site'}</strong>
                {!driveTime.hoursManual && wo?.address && <> · {lookupDriveHours(wo.address)}h/trip estimated</>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={label}>Round Trips</label>
                  <GreenInput value={driveTime.trips} onChange={v => { setDriveTime(p => ({ ...p, trips: v, totalOverride: '' })); scheduleAutoSave(); }} type="number" min="1" step="1" style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label style={label}>Hrs / Trip</label>
                  <GreenInput
                    value={driveTime.hoursPerTrip}
                    onChange={v => { setDriveTime(p => ({ ...p, hoursPerTrip: v, hoursManual: true, totalOverride: '' })); scheduleAutoSave(); }}
                    type="number" min="0" step="0.5"
                    style={{ textAlign: 'right' }}
                  />
                </div>
                <div>
                  <label style={label}>Rate / hr ($)</label>
                  <GreenInput value={driveTime.rate} onChange={v => { setDriveTime(p => ({ ...p, rate: v, totalOverride: '' })); scheduleAutoSave(); }} type="number" min="0" step="1" style={{ textAlign: 'right' }} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>Total Drive Cost (override)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={driveTime.totalOverride || fmtNum(parseNum(driveTime.trips) * parseNum(driveTime.hoursPerTrip) * parseNum(driveTime.rate))}
                    onChange={e => { setDriveTime(p => ({ ...p, totalOverride: e.target.value })); scheduleAutoSave(); }}
                    style={{ ...ORANGE_DISPLAY, border: driveTime.totalOverride ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(245,158,11,0.3)', cursor: 'text' }}
                  />
                </div>
                {driveTime.totalOverride && (
                  <button onClick={() => setDriveTime(p => ({ ...p, totalOverride: '' }))}
                    style={{ marginTop: 18, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(255,251,235,0.8)', color: '#d97706', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ↺ Reset
                  </button>
                )}
              </div>

              <div style={{ marginTop: 8, fontSize: 11, color: '#0891b2', fontWeight: 700 }}>
                Drive time line item: {driveTime.trips} trips × {driveTime.hoursPerTrip}h × {fmt(parseNum(driveTime.rate))}/hr = <strong>{fmt(driveTotal)}</strong>
              </div>
            </div>
          )}
        </div>

        {/* ── MATERIALS ────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Materials" color="#92400e" open={openSections.materials} onToggle={() => toggleSection('materials')} />
          {openSections.materials && (
            <div style={{ paddingTop: 10 }}>
              {[
                { title: 'Main Materials', subtitle: 'Glass, frames, hardware', items: mainMaterials, setter: setMainMaterials },
                { title: 'Consumables', subtitle: 'Caulking, tape, gaskets, fasteners, shims', items: consumables, setter: setConsumables },
                { title: 'Freight / Shipping', subtitle: 'Materials shipping costs', items: freight, setter: setFreight },
              ].map(({ title, subtitle, items, setter }) => (
                <div key={title} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', letterSpacing: '0.08em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ textTransform: 'uppercase' }}>{title}</span>
                    <span style={{ fontWeight: 400, color: '#a8a29e', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>— {subtitle}</span>
                  </div>

                  {/* Column headers */}
                  {items.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 60px 80px 90px 28px', gap: 5, marginBottom: 3, padding: '0 2px' }}>
                      {['Description', 'Qty', 'Type', 'Unit $', 'Total', ''].map(h => (
                        <div key={h} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8' }}>{h}</div>
                      ))}
                    </div>
                  )}

                  {items.map(m => {
                    const effectiveUnitType = m.unitType || detectUnitType(m.description);
                    const autoTotal = materialLineTotal(m);
                    return (
                      <div key={m.id} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 60px 80px 90px 28px', gap: 5, alignItems: 'center' }}>
                          <GreenInput value={m.description} onChange={v => updateMaterial(setter, m.id, { description: v })} placeholder="Description" />
                          <GreenInput value={m.qty} onChange={v => updateMaterial(setter, m.id, { qty: v, totalOverride: '' })} type="number" min="0" step="1" style={{ textAlign: 'right' }} />
                          <select
                            value={effectiveUnitType}
                            onChange={e => updateMaterial(setter, m.id, { unitType: e.target.value as MaterialLine['unitType'], totalOverride: '' })}
                            style={{ ...GREEN_INPUT, cursor: 'pointer', textAlign: 'center', fontSize: 11, padding: '6px 4px' }}
                          >
                            {(['SF', 'LF', 'EA', 'Tube'] as const).map(ut => <option key={ut} value={ut}>{ut}</option>)}
                          </select>
                          <GreenInput value={m.unitCost} onChange={v => updateMaterial(setter, m.id, { unitCost: v, totalOverride: '' })} placeholder="0.00" type="number" step="0.01" min="0" style={{ textAlign: 'right' }} />
                          <input
                            type="number" step="0.01" min="0"
                            value={m.totalOverride || fmtNum(autoTotal)}
                            onChange={e => updateMaterial(setter, m.id, { totalOverride: e.target.value })}
                            style={{ ...ORANGE_DISPLAY, border: m.totalOverride ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(245,158,11,0.3)', cursor: 'text' }}
                          />
                          <button onClick={() => removeMaterial(setter, m.id)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        </div>
                        {effectiveUnitType === 'SF' && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', paddingLeft: 2 }}>
                            <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>W×H (in):</span>
                            <GreenInput
                              value={m.width || ''}
                              onChange={v => updateMaterial(setter, m.id, { width: v, totalOverride: '' })}
                              placeholder="W" type="number" step="0.125" min="0"
                              style={{ width: 64, textAlign: 'right' }}
                            />
                            <span style={{ fontSize: 12, color: '#94a3b8' }}>×</span>
                            <GreenInput
                              value={m.height || ''}
                              onChange={v => updateMaterial(setter, m.id, { height: v, totalOverride: '' })}
                              placeholder="H" type="number" step="0.125" min="0"
                              style={{ width: 64, textAlign: 'right' }}
                            />
                            {(m.width && m.height) && (
                              <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>
                                = {((parseNum(m.width) * parseNum(m.height) / 144) * parseNum(m.qty || '1')).toFixed(2)} SF
                              </span>
                            )}
                          </div>
                        )}
                        {effectiveUnitType === 'LF' && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', paddingLeft: 2 }}>
                            <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>Length (ft):</span>
                            <GreenInput
                              value={m.length || ''}
                              onChange={v => updateMaterial(setter, m.id, { length: v, totalOverride: '' })}
                              placeholder="ft" type="number" step="0.5" min="0"
                              style={{ width: 80, textAlign: 'right' }}
                            />
                            {m.length && (
                              <span style={{ fontSize: 10, color: '#0891b2', fontWeight: 700, flexShrink: 0, fontFamily: FONT }}>
                                × {m.qty || '1'} = {(parseNum(m.length) * parseNum(m.qty || '1')).toFixed(1)} LF
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button onClick={() => { setter(prev => [...prev, newMaterialLine()]); scheduleAutoSave(); }}
                    style={{ fontSize: 11, color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '2px 0' }}>
                    + Add {title.toLowerCase()} line
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Materials Subtotal</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#92400e', fontVariantNumeric: 'tabular-nums' }}>{fmt(materialsSubtotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── ADDITIONAL COSTS ─────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Additional Costs" color="#6d28d9" open={openSections.additional} onToggle={() => toggleSection('additional')} />
          {openSections.additional && (
            <div style={{ paddingTop: 10 }}>
              {additionalCosts.map(c => (
                <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <GreenInput value={c.description} onChange={v => { setAdditionalCosts(prev => prev.map(x => x.id === c.id ? { ...x, description: v } : x)); scheduleAutoSave(); }} placeholder="Description" />
                  <GreenInput value={c.amount} onChange={v => { setAdditionalCosts(prev => prev.map(x => x.id === c.id ? { ...x, amount: v } : x)); scheduleAutoSave(); }} placeholder="0.00" type="number" step="0.01" min="0" style={{ textAlign: 'right' }} />
                  <button onClick={() => { setAdditionalCosts(prev => prev.filter(x => x.id !== c.id)); scheduleAutoSave(); }}
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {['Permits', 'After-hours Premium', 'Other'].map(preset => (
                  <button key={preset} onClick={() => { setAdditionalCosts(prev => [...prev, { id: uid(), description: preset, amount: '' }]); scheduleAutoSave(); }}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(109,40,217,0.25)', background: 'rgba(237,233,254,0.6)', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    + {preset}
                  </button>
                ))}
                <button onClick={() => { setAdditionalCosts(prev => [...prev, { id: uid(), description: '', amount: '' }]); scheduleAutoSave(); }}
                  style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(109,40,217,0.25)', background: 'rgba(237,233,254,0.6)', color: '#6d28d9', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  + Custom
                </button>
              </div>
              {additionalTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingTop: 8, marginTop: 4, borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Additional Subtotal</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#6d28d9', fontVariantNumeric: 'tabular-nums' }}>{fmt(additionalTotal)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SUMMARY ──────────────────────────────────────────────────── */}
        <div>
          <SectionToggle label="Pricing Summary" color="#0f172a" open={openSections.summary} onToggle={() => toggleSection('summary')} />
          {openSections.summary && (
            <div style={{ paddingTop: 12 }}>
              {/* Markup controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <div>
                  <label style={label}>Overhead (%)</label>
                  <GreenInput value={markup.overheadPct} onChange={v => { setMarkup(p => ({ ...p, overheadPct: v })); scheduleAutoSave(); }} type="number" min="0" step="1" placeholder="0" style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label style={label}>Profit (%)</label>
                  <GreenInput value={markup.profitPct} onChange={v => { setMarkup(p => ({ ...p, profitPct: v })); scheduleAutoSave(); }} type="number" min="0" step="0.5" placeholder="10" style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label style={label}>GET Rate (%)</label>
                  <GreenInput value={markup.getRate} onChange={v => { setMarkup(p => ({ ...p, getRate: v })); scheduleAutoSave(); }} type="number" min="0" step="0.01" placeholder="4.5" style={{ textAlign: 'right' }} />
                </div>
              </div>

              {/* Summary breakdown */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '14px 18px' }}>
                <SummaryRow label="Materials Subtotal" value={materialsSubtotal} sub />
                <SummaryRow label="Labor Subtotal" value={laborSubtotal} sub />
                <SummaryRow label="Drive Time" value={driveTotal} sub />
                <SummaryRow label="Equipment & Other" value={additionalTotal} sub />
                <Divider />
                <SummaryRow label="Subtotal" value={subtotal} />
                {parseNum(markup.overheadPct) > 0 && <SummaryRow label={`Overhead @ ${markup.overheadPct}%`} value={overheadAmt} sub />}
                {parseNum(markup.profitPct) > 0 && <SummaryRow label={`Profit @ ${markup.profitPct}%`} value={profitAmt} sub />}
                <Divider />
                <SummaryRow label="Total Before Tax" value={totalBeforeTax} />
                <SummaryRow label={`GET @ ${markup.getRate}%`} value={getAmt} sub />
                <Divider />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: '#0f172a', marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT }}>Grand Total</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: 'white', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>{fmt(grandTotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px 0', fontSize: 12, fontWeight: 700, color: '#0f766e', fontFamily: FONT }}>
                  <span>50% Deposit Required</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(deposit)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
          Cancel
        </button>
        <button onClick={generateQuote} disabled={generating}
          style={{ flex: 2, padding: '11px', borderRadius: 12, background: generating ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: generating ? '#94a3b8' : 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer', boxShadow: generating ? 'none' : '0 4px 16px rgba(15,118,110,0.3)', fontFamily: FONT }}>
          {generating ? 'Generating…' : `Generate Quote — ${fmt(grandTotal)}`}
        </button>
      </div>
    </div>
  );
}
