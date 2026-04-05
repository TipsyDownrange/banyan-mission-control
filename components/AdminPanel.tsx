'use client';
import { useEffect, useState } from 'react';

type Section = 'wip' | 'financials' | 'vendors' | 'compliance' | 'hr' | 'safety' | 'fleet';

const SECTION_META: Record<Section, { title: string; subtitle: string; icon: string; built: boolean }> = {
  wip:         { title: 'WIP Report',        subtitle: 'Work in Progress — live financial position across all active projects', icon: '📊', built: false },
  financials:  { title: 'Financials',         subtitle: 'Cash flow, AR/AP, QuickBooks sync, Bill.com integration',             icon: '💰', built: false },
  vendors:     { title: 'Vendor Management',  subtitle: 'Suppliers, subcontractors, insurance expiry, performance tracking',   icon: '🏢', built: false },
  compliance:  { title: 'Union Compliance',   subtitle: 'CBA tracking, apprentice hours, trust fund payments, certifications', icon: '⚖️', built: false },
  hr:          { title: 'Human Resources',    subtitle: 'Employee records, career pipeline, PDPs, performance reviews',        icon: '👥', built: false },
  safety:      { title: 'Safety',             subtitle: 'JHA library, toolbox talks, OSHA 300 log, certifications',            icon: '🦺', built: false },
  fleet:       { title: 'Fleet & Equipment',  subtitle: 'Vehicles, lifts, forklifts — registration, maintenance, inspection',  icon: '🚛', built: false },
};

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
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>WIP Engine — Building Now</div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              The WIP report requires QuickBooks authorization (Jenny, Monday) to pull actual job costs. Once connected, this panel will show: contract value, % complete, earned revenue, billings to date, overbilling/underbilling per project — queryable to any historical date and exportable as a bank-ready PDF in seconds.
            </div>
          </div>
        </div>
      </div>

      {/* Project list preview */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Active Projects ({projects.length})</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>QB sync pending</div>
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
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Pending QB sync</td>
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
      {section === 'compliance' && <CompliancePanel />}
      {(section === 'financials' || section === 'vendors' || section === 'hr' || section === 'safety' || section === 'fleet') && (
        <ComingSoonPanel section={section} />
      )}
    </div>
  );
}
