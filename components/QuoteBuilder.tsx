'use client';
import { useState, useEffect } from 'react';

type LineItem = { qty: number; description: string };
type AdditionalCharge = { label: string; amount: number };

type QuoteDefaults = {
  crewCount: number;
  hourlyRate: number;
  journeymanRate: number;
  leadpersonRate: number;
  getRate: number;
  siteVisit: {
    subtotal: number;
    description: string;
    driveHours: number;
    siteHours: number;
    crewCount: number;
    isOverride: boolean;
  };
  driveEstimate: { roundTripHours: number; description: string };
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

const INP: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box',
};
const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#64748b', marginBottom: 4, display: 'block',
};
const SEC = (color = '#0f766e') => ({
  fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
  textTransform: 'uppercase' as const, color, marginBottom: 10,
  borderBottom: `1px solid ${color}22`, paddingBottom: 6,
});

export default function QuoteBuilder({ woNumber, onClose }: { woNumber: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [wo, setWo] = useState<WOData | null>(null);
  const [defaults, setDefaults] = useState<QuoteDefaults | null>(null);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [quote, setQuote] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [jobType, setJobType] = useState('');
  const [scopeNarrative, setScopeNarrative] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ qty: 1, description: '' }]);
  const [installationIncluded, setInstallationIncluded] = useState(true);
  const [materialsTotal, setMaterialsTotal] = useState('');
  const [equipmentCharges, setEquipmentCharges] = useState('');
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  // Labor
  const [crewCount, setCrewCount] = useState(2);
  const [hourlyRate, setHourlyRate] = useState(89.10);
  const [laborHours, setLaborHours] = useState('');
  // Site visit
  const [includeSiteVisit, setIncludeSiteVisit] = useState(false);
  const [siteVisitOverride, setSiteVisitOverride] = useState('');
  const [siteVisitCredit, setSiteVisitCredit] = useState(false);
  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  useEffect(() => {
    fetch(`/api/service/quote?wo=${encodeURIComponent(woNumber)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return; }
        setWo(d.wo);
        setDefaults(d.defaults);
        setJobTypes(d.jobTypes || []);
        setHourlyRate(d.defaults.hourlyRate);
        setCrewCount(d.defaults.crewCount);
        // Pre-fill from WO
        if (d.wo.description) setScopeNarrative(d.wo.description);
        // Parse contact for customer name/phone
        const contact = d.wo.contact || '';
        const phoneMatch = contact.match(/(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
        if (phoneMatch) setCustomerPhone(phoneMatch[1]);
        const namepart = contact.split(/\d/)[0].trim().replace(/[^a-zA-Z\s]/g, '').trim();
        if (namepart) setCustomerName(namepart);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [woNumber]);

  // Update labor hours when job type changes
  useEffect(() => {
    if (!jobType || laborHours) return;
    // Fetch default hours for this job type
    fetch(`/api/service/quote?job_types=1`)
      .then(r => r.json())
      .then(() => {
        // Hours defaults are embedded in the POST response
        // For now just clear to trigger recalc on submit
      });
  }, [jobType]);

  // Live total calculation
  const matNum    = parseFloat(materialsTotal)   || 0;
  const equipNum  = parseFloat(equipmentCharges) || 0;
  const laborNum  = crewCount * hourlyRate * (parseFloat(laborHours) || 2);
  const svFee     = includeSiteVisit
    ? (siteVisitOverride ? parseFloat(siteVisitOverride) : (defaults?.siteVisit?.subtotal || 0))
    : 0;
  const svCredit  = siteVisitCredit ? svFee : 0;
  const extraNum  = additionalCharges.reduce((s, c) => s + (c.amount || 0), 0);
  const subtotal  = matNum + laborNum + equipNum + svFee - svCredit + extraNum;
  const get       = Math.round(subtotal * 0.045 * 100) / 100;
  const total     = Math.round((subtotal + get) * 100) / 100;
  const deposit   = Math.round(total * 0.5 * 100) / 100;

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
          lineItems: lineItems.filter(li => li.description),
          jobType,
          installationIncluded,
          crewCount,
          hourlyRate,
          laborHours: parseFloat(laborHours) || undefined,
          materialsTotal: matNum,
          equipmentCharges: equipNum,
          additionalCharges,
          includeSiteVisit,
          siteVisitOverride: siteVisitOverride ? parseFloat(siteVisitOverride) : null,
          siteVisitCredit,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); } else { setQuote(data.quote); }
    } catch (e) { setError(String(e)); }
    setGenerating(false);
  }

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading WO {woNumber}...</div>
    </div>
  );

  // Quote preview mode
  if (quote) return (
    <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Quote Ready</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>WO {woNumber}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setQuote(null)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>← Edit</button>
          <button style={{ padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>⬇ Download PDF</button>
          <button style={{ padding: '8px 16px', borderRadius: 10, background: '#4338ca', color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✉ Email Customer</button>
        </div>
      </div>

      {/* Quote summary */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: 16 }}>
        <div style={SEC()}>Pricing Summary</div>
        {matNum > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}><span>Materials</span><span>{fmt(matNum)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
          <span>Labor ({crewCount} × {fmt(hourlyRate)}/hr × {parseFloat(laborHours)||2}h)</span>
          <span>{fmt(laborNum)}</span>
        </div>
        {equipNum > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}><span>Equipment</span><span>{fmt(equipNum)}</span></div>}
        {svFee > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}><span>Site Visit</span><span>{fmt(svFee)}</span></div>}
        {svCredit > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13, color: '#0f766e' }}><span>Site Visit Credit</span><span>−{fmt(svCredit)}</span></div>}
        {additionalCharges.map((c, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13 }}><span>{c.label}</span><span>{fmt(c.amount)}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13, color: '#64748b' }}><span>GET (4.5%)</span><span>{fmt(get)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 16, fontWeight: 800, color: '#0f172a' }}><span>Total</span><span>{fmt(total)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 0', fontSize: 13, color: '#0f766e', fontWeight: 700 }}><span>50% Deposit Required</span><span>{fmt(deposit)}</span></div>
      </div>

      <div style={{ background: '#f0fdfa', borderRadius: 12, border: '1px solid rgba(15,118,110,0.15)', padding: '14px 18px', fontSize: 12, color: '#0f766e', fontWeight: 600 }}>
        ✓ Quote data ready — PDF generation and email delivery coming in next build.
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>Service — Quote Builder</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>WO {woNumber} — {wo?.name?.substring(0, 50)}</div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 16, color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'grid', gap: 20 }}>

        {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c' }}>{error}</div>}

        {/* Drive time info */}
        {defaults?.driveEstimate && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(238,242,255,0.6)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 12, color: '#4338ca' }}>
            📍 {wo?.address} — {defaults.driveEstimate.description} · {defaults.driveEstimate.roundTripHours}h round trip
          </div>
        )}

        {/* Customer */}
        <div>
          <div style={SEC('#0369a1')}>Customer Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={LBL}>Name</label><input value={customerName} onChange={e => setCustomerName(e.target.value)} style={INP} placeholder="Customer / company" /></div>
            <div><label style={LBL}>Phone</label><input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={INP} placeholder="808-XXX-XXXX" /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={LBL}>Email</label><input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} style={INP} placeholder="customer@email.com" /></div>
          </div>
        </div>

        {/* Scope */}
        <div>
          <div style={SEC()}>Scope of Work</div>
          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Job Type (for labor defaults)</label>
            <select value={jobType} onChange={e => setJobType(e.target.value)} style={{ ...INP, cursor: 'pointer', WebkitAppearance: 'none' }}>
              <option value="">Select job type...</option>
              {jobTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Scope Description</label>
            <textarea value={scopeNarrative} onChange={e => setScopeNarrative(e.target.value)} rows={3}
              style={{ ...INP, resize: 'none' }} placeholder="Describe the full scope of work..." />
          </div>
          <div>
            <label style={LBL}>Material / Line Items</label>
            {lineItems.map((li, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input type="number" value={li.qty} onChange={e => setLineItems(prev => prev.map((p, j) => j === i ? { ...p, qty: parseInt(e.target.value) || 1 } : p))}
                  style={{ ...INP, width: 60, flexShrink: 0 }} min={1} />
                <input value={li.description} onChange={e => setLineItems(prev => prev.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                  style={{ ...INP, flex: 1 }} placeholder="Description (e.g. 1 inch IGU 26x29 grey tempered...)" />
                {lineItems.length > 1 && (
                  <button onClick={() => setLineItems(prev => prev.filter((_, j) => j !== i))}
                    style={{ padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => setLineItems(prev => [...prev, { qty: 1, description: '' }])}
              style={{ fontSize: 12, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>+ Add item</button>
          </div>
        </div>

        {/* Labor */}
        <div>
          <div style={SEC('#4338ca')}>Labor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={LBL}>Crew Size</label>
              <input type="number" value={crewCount} onChange={e => setCrewCount(parseInt(e.target.value) || 1)}
                style={INP} min={1} max={10} />
            </div>
            <div>
              <label style={LBL}>Rate / hr</label>
              <select value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value))}
                style={{ ...INP, cursor: 'pointer', WebkitAppearance: 'none' }}>
                <option value={89.10}>Journeyman $89.10</option>
                <option value={93.10}>Leadperson $93.10</option>
                <option value={73.05}>Apprentice 70% $73.05</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Hours on Site</label>
              <input type="number" value={laborHours}
                onChange={e => setLaborHours(e.target.value)}
                style={INP} placeholder={jobType ? 'auto' : '2.0'} step={0.5} min={0} />
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#4338ca', fontWeight: 600 }}>
            Labor subtotal: {fmt(laborNum)} ({crewCount} × {fmt(hourlyRate)}/hr × {parseFloat(laborHours)||2}h)
          </div>
        </div>

        {/* Materials & Equipment */}
        <div>
          <div style={SEC('#92400e')}>Materials & Equipment</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LBL}>Materials Total ($)</label>
              <input type="number" value={materialsTotal} onChange={e => setMaterialsTotal(e.target.value)}
                style={INP} placeholder="0.00" step={0.01} min={0} />
            </div>
            <div>
              <label style={LBL}>Equipment / Lift ($)</label>
              <input type="number" value={equipmentCharges} onChange={e => setEquipmentCharges(e.target.value)}
                style={INP} placeholder="0.00" step={0.01} min={0} />
            </div>
          </div>
          {additionalCharges.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={c.label} onChange={e => setAdditionalCharges(prev => prev.map((p, j) => j === i ? { ...p, label: e.target.value } : p))}
                style={{ ...INP, flex: 1 }} placeholder="Charge description" />
              <input type="number" value={c.amount} onChange={e => setAdditionalCharges(prev => prev.map((p, j) => j === i ? { ...p, amount: parseFloat(e.target.value) || 0 } : p))}
                style={{ ...INP, width: 100, flexShrink: 0 }} placeholder="0.00" step={0.01} />
              <button onClick={() => setAdditionalCharges(prev => prev.filter((_, j) => j !== i))}
                style={{ padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))}
          <button onClick={() => setAdditionalCharges(prev => [...prev, { label: '', amount: 0 }])}
            style={{ marginTop: 8, fontSize: 12, color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>+ Add charge</button>
        </div>

        {/* Site Visit */}
        <div>
          <div style={SEC('#6d28d9')}>Site Visit</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <input type="checkbox" checked={includeSiteVisit} onChange={e => setIncludeSiteVisit(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#6d28d9' }} id="svCheck" />
            <label htmlFor="svCheck" style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
              Charge site visit fee
            </label>
          </div>
          {includeSiteVisit && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LBL}>Override Amount ($) — blank = auto-calculate</label>
                <input type="number" value={siteVisitOverride} onChange={e => setSiteVisitOverride(e.target.value)}
                  style={INP} placeholder={`Auto: ${fmt(defaults?.siteVisit?.subtotal || 0)}`} />
                {!siteVisitOverride && defaults?.siteVisit && (
                  <div style={{ fontSize: 11, color: '#6d28d9', marginTop: 4 }}>{defaults.siteVisit.description}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={siteVisitCredit} onChange={e => setSiteVisitCredit(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#0f766e' }} id="svCredit" />
                  <label htmlFor="svCredit" style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                    Credit on acceptance
                  </label>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Customer already paid deposit</div>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div>
          <div style={SEC('#64748b')}>Options</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={installationIncluded} onChange={e => setInstallationIncluded(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#0f766e' }} id="instCheck" />
            <label htmlFor="instCheck" style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
              Installation included in price
            </label>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>(unchecked = added to exclusions)</span>
          </div>
        </div>

        {/* Live total */}
        <div style={{ padding: '16px 20px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(255,255,255,0.98),rgba(240,253,250,0.96))', border: '1px solid rgba(15,118,110,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 8 }}>
            <span>GET (4.5%)</span><span>{fmt(get)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
            <span>Total</span><span>{fmt(total)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#0f766e', marginTop: 4 }}>
            <span>50% Deposit</span><span>{fmt(deposit)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={generateQuote} disabled={generating}
          style={{ flex: 2, padding: '11px', borderRadius: 12, background: generating ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: generating ? '#94a3b8' : 'white', border: 'none', fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer', boxShadow: generating ? 'none' : '0 4px 16px rgba(15,118,110,0.3)' }}>
          {generating ? 'Generating...' : `Generate Quote — ${fmt(total)}`}
        </button>
      </div>
    </div>
  );
}
