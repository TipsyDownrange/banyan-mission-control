'use client';
import { useEffect, useState } from 'react';

type Section = 'wip' | 'financials' | 'vendors' | 'compliance' | 'hr' | 'safety' | 'fleet';

const SECTION_META: Record<Section, { title: string; subtitle: string; icon: string; built: boolean }> = {
  wip:         { title: 'WIP Report',        subtitle: 'Work in Progress — live financial position across all active projects', icon: '📊', built: false },
  financials:  { title: 'Financials',         subtitle: 'AR/AP, cash flow, P&L — live QuickBooks data',                        icon: '💰', built: true  },
  vendors:     { title: 'Vendor Management',  subtitle: 'Suppliers, subcontractors, insurance expiry, performance tracking',   icon: '🏢', built: false },
  compliance:  { title: 'Union Compliance',   subtitle: 'CBA tracking, apprentice hours, trust fund payments, certifications', icon: '⚖️', built: false },
  hr:          { title: 'Human Resources',    subtitle: 'Employee records, career pipeline, PDPs, performance reviews',        icon: '👥', built: false },
  safety:      { title: 'Safety',             subtitle: 'JHA library, toolbox talks, OSHA 300 log, certifications',            icon: '🦺', built: false },
  fleet:       { title: 'Fleet & Equipment',  subtitle: 'Vehicles, lifts, forklifts — registration, maintenance, inspection',  icon: '🚛', built: false },
};

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:    { bg: '#f0fdf4', color: '#15803d', label: 'Paid' },
    unpaid:  { bg: '#eff6ff', color: '#1d4ed8', label: 'Unpaid' },
    overdue: { bg: '#fef2f2', color: '#b91c1c', label: 'Overdue' },
  };
  const s = map[status] || { bg: '#f8fafc', color: '#64748b', label: status };
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

type FinanceSummary = {
  ar: { total: number; overdue: number; aging: Record<string, number>; count: number };
  ap: { total: number; upcomingDue: number; count: number };
  pl: { revenueYtd: number; expensesYtd: number; netIncomeYtd: number; period: string };
  recentInvoices: { id: string; invoiceNumber: string; customer: string; amount: number; balance: number; dueDate: string | null; txnDate: string; status: string }[];
  recentBills: { id: string; vendor: string; amount: number; balance: number; dueDate: string | null; txnDate: string; status: string }[];
};

function FinancialsPanel() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/qbo/finance-summary')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Admin & Finance</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Financials</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Live QuickBooks data — AR/AP, P&L, invoices &amp; bills</p>
      </div>

      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Loading QuickBooks data…</div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid rgba(185,28,28,0.2)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c', marginBottom: 4 }}>⚠️ QuickBooks Connection Error</div>
          <div style={{ fontSize: 12, color: '#7f1d1d', fontFamily: 'monospace' }}>{error}</div>
        </div>
      )}

      {data && (
        <>
          {/* Summary KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {/* AR */}
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>AR Outstanding</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>{fmt$(data.ar.total)}</div>
              <div style={{ fontSize: 12, color: data.ar.overdue > 0 ? '#b91c1c' : '#64748b' }}>
                {data.ar.overdue > 0 ? `${fmt$(data.ar.overdue)} overdue` : 'No overdue invoices'} · {data.ar.count} open
              </div>
              {/* Aging buckets */}
              <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['current', '0-30', '31-60', '61-90', '90+'] as const).map(bucket => {
                  const val = data.ar.aging[bucket] || 0;
                  if (!val) return null;
                  const isOld = bucket === '61-90' || bucket === '90+';
                  return (
                    <div key={bucket} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: isOld ? '#fef2f2' : '#f8fafc', color: isOld ? '#b91c1c' : '#64748b', fontWeight: 700 }}>
                      {bucket}: {fmt$(val)}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* AP */}
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>AP Outstanding</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>{fmt$(data.ap.total)}</div>
              <div style={{ fontSize: 12, color: data.ap.upcomingDue > 0 ? '#d97706' : '#64748b' }}>
                {data.ap.upcomingDue > 0 ? `${fmt$(data.ap.upcomingDue)} due next 7 days` : 'Nothing due soon'} · {data.ap.count} open
              </div>
            </div>
            {/* P&L */}
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${data.pl.netIncomeYtd >= 0 ? 'rgba(15,118,110,0.2)' : 'rgba(185,28,28,0.2)'}`, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Net Income {data.pl.period}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: data.pl.netIncomeYtd >= 0 ? '#0f766e' : '#b91c1c', marginBottom: 4 }}>
                {data.pl.netIncomeYtd >= 0 ? '' : '−'}{fmt$(Math.abs(data.pl.netIncomeYtd))}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Rev: {fmt$(data.pl.revenueYtd)} · Exp: {fmt$(data.pl.expensesYtd)}
              </div>
            </div>
          </div>

          {/* Recent Invoices */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Recent Invoices (AR)</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Last 10 · last 90 days</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Invoice #', 'Customer', 'Amount', 'Balance', 'Due', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentInvoices.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: '#0369a1' }}>{inv.invoiceNumber || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: '#0f172a', maxWidth: 200 }}>{inv.customer}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmt$(Number(inv.amount))}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: Number(inv.balance) > 0 ? '#b91c1c' : '#64748b' }}>{fmt$(Number(inv.balance))}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(inv.dueDate)}</td>
                    <td style={{ padding: '11px 16px' }}><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recent Bills */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Recent Bills (AP)</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Last 10 · last 90 days</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Vendor', 'Amount', 'Balance', 'Due Date', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentBills.map(bill => (
                  <tr key={bill.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: '#0f172a', maxWidth: 220 }}>{bill.vendor}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmt$(Number(bill.amount))}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: Number(bill.balance) > 0 ? '#b91c1c' : '#64748b' }}>{fmt$(Number(bill.balance))}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(bill.dueDate)}</td>
                    <td style={{ padding: '11px 16px' }}><StatusBadge status={bill.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// WIP stub — shows live data structure from projects
function WIPPanel() {
  const [projects, setProjects] = useState<{kID:string;name:string;island:string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => {
      setProjects(d.projects || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Admin & Finance</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>WIP Report</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Work in Progress — financial position across all active projects</p>
      </div>

      {/* Coming soon notice */}
      <div style={{ background: 'linear-gradient(135deg, rgba(15,118,110,0.06), rgba(20,184,166,0.04))', border: '1px solid rgba(15,118,110,0.15)', borderRadius: 20, padding: '24px 28px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(15,118,110,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>WIP Engine — Next Build</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              QuickBooks is now connected. The WIP report will show: contract value, % complete, earned revenue, billings to date, overbilling/underbilling per project — queryable to any historical date and exportable as a bank-ready PDF.
            </div>
          </div>
        </div>
      </div>

      {/* Project list preview */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Active Projects ({projects.length})</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>WIP calculation in queue</div>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Project', 'Island', 'Contract Value', '% Complete', 'Billed to Date', 'Overbilling / Underbilling'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.kID} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{p.name}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#f0fdfa', color: '#0f766e', border: '1px solid rgba(15,118,110,0.2)' }}>{p.island}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Coming soon</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>—</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>—</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Union Compliance stub
function CompliancePanel() {
  const APPRENTICES = [
    { name: 'Owen Nakamura', pct: 90, island: 'Maui', hoursToNext: 'At Journeyman threshold' },
    { name: 'Ninja Thang', pct: 90, island: 'Oahu', hoursToNext: 'At Journeyman threshold' },
    { name: 'Santia-Jacob Pascual', pct: 90, island: 'Oahu', hoursToNext: 'Temp layoff' },
    { name: 'Christian Altman', pct: 70, island: 'Maui (temp)', hoursToNext: '~1,000 hrs to 80%' },
    { name: 'Holden Ioanis', pct: 55, island: 'Maui', hoursToNext: '~1,500 hrs to 60%' },
    { name: 'Quintin Castro-Perry', pct: 45, island: 'Maui', hoursToNext: '~1,000 hrs to 50%' },
    { name: 'Layton Domingo', pct: 45, island: 'Maui (temp)', hoursToNext: '~1,000 hrs to 50%' },
    { name: 'Wena Hun', pct: 45, island: 'Kauai (temp)', hoursToNext: '~1,000 hrs to 50%' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Admin & Finance</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Union Compliance</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>CBA — Local 1889, AFL-CIO · Effective July 1, 2022 through June 30, 2027</p>
      </div>

      {/* Key alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Next Wage Increase</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 2 }}>July 1, 2026</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>87 days · 5-Trade Raise Average</div>
        </div>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Trust Fund Due</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 2 }}>April 25</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>March contributions · 21 days</div>
        </div>
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid rgba(245,158,11,0.3)', padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Apprentice Upgrades</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#92400e', marginBottom: 2 }}>3 near threshold</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Owen, Ninja, Santia-Jacob at 90%</div>
        </div>
      </div>

      {/* Apprentice tracker */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Apprentice Progression Tracker</div>
        </div>
        {APPRENTICES.map(a => (
          <div key={a.name} style={{ padding: '12px 20px', borderBottom: '1px solid #f8fafc', display: 'grid', gridTemplateColumns: '1fr 120px 80px 1fr', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{a.name}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{a.island}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: '#f1f5f9' }}>
                <div style={{ width: `${a.pct}%`, height: '100%', borderRadius: 999, background: a.pct >= 90 ? '#0f766e' : a.pct >= 70 ? '#0369a1' : '#94a3b8' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: a.pct >= 90 ? '#0f766e' : '#334155', whiteSpace: 'nowrap' }}>{a.pct}%</span>
            </div>
            <div style={{ fontSize: 11, color: a.pct >= 90 ? '#0f766e' : '#64748b', fontWeight: a.pct >= 90 ? 700 : 400 }}>{a.hoursToNext}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fffbeb', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '14px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>⚡ Action Required — Monday</div>
        <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>Owen Nakamura, Ninja Thang, and Santia-Jacob Pascual are at 90% apprentice level. Discuss journeyman promotion timeline with superintendents. Update payroll rate when promoted (100% journeyman rate).</div>
      </div>
    </div>
  );
}

// Generic coming-soon panel
function ComingSoonPanel({ section }: { section: Section }) {
  const meta = SECTION_META[section];
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Admin & Finance</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>{meta.title}</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{meta.subtitle}</p>
      </div>
      <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: '60px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{meta.icon}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{meta.title} — In Build Queue</div>
        <div style={{ fontSize: 14, color: '#64748b', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>{meta.subtitle}.</div>
        <div style={{ marginTop: 20, fontSize: 12, color: '#94a3b8' }}>Architecture specced April 4, 2026 · Build scheduled</div>
      </div>
    </div>
  );
}

export default function AdminPanel({ section }: { section: Section }) {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {section === 'wip' && <WIPPanel />}
      {section === 'financials' && <FinancialsPanel />}
      {section === 'compliance' && <CompliancePanel />}
      {(section === 'vendors' || section === 'hr' || section === 'safety' || section === 'fleet') && (
        <ComingSoonPanel section={section} />
      )}
    </div>
  );
}
