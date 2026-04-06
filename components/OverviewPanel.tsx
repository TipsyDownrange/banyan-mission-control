'use client';
import { useEffect, useState } from 'react';
import DashboardHeader, { KPI, ActionItem } from './DashboardHeader';

type Project = { kID: string; name: string; pm: string; island: string; issues: number; eventCount: number };
type Event = { id: string; kID: string; projectName: string; type: string; occurredAt: string; recordedBy: string; note: string; location: string };
type SubmittalSummary = { total: number; pending: number; approved: number; overdue: number };
type COSummary = { total: number; pending: number; approved: number; totalExposure: number };

const ISLAND_COLOR: Record<string, string> = { Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e' };

const EVENT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  DAILY_LOG:    { label: 'Daily Log',   color: '#0369a1', bg: 'rgba(239,246,255,0.9)' },
  FIELD_ISSUE:  { label: 'Field Issue', color: '#b91c1c', bg: 'rgba(254,242,242,0.9)' },
  INSTALL_STEP: { label: 'Install',     color: '#0f766e', bg: 'rgba(240,253,250,0.9)' },
  NOTE:         { label: 'Note',        color: '#475569', bg: 'rgba(248,250,252,0.9)' },
};

function displayName(email: string): string {
  if (!email) return '';
  if (email.includes('@')) return email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return email;
}

function formatTime(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return raw; }
}

type QboKpis = { revenueThisMonth: number; netIncomeYtd: number; arOutstanding: number; apOutstanding: number } | null;

function fmtKpi(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function OverviewPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittals, setSubmittals] = useState<SubmittalSummary>({ total: 0, pending: 0, approved: 0, overdue: 0 });
  const [cos, setCos] = useState<COSummary>({ total: 0, pending: 0, approved: 0, totalExposure: 0 });
  const [crewDeployed, setCrewDeployed] = useState(0);
  const [crewTotal, setCrewTotal] = useState(42);
  const [qboKpis, setQboKpis] = useState<QboKpis>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/events?limit=20').then(r => r.json()),
      fetch('/api/crew').then(r => r.json()).catch(() => ({ crew: [], all: [] })),
      fetch('/api/dispatch-schedule?days=1').then(r => r.json()).catch(() => ({ slots: [] })),
    ]).then(([pData, eData, cData, dData]) => {
      setProjects(pData.projects || []);
      setEvents(eData.events || []);
      
      // Count dispatched crew today
      const todaySlots = (dData.slots || []).filter((s: Record<string, string>) => {
        const d = new Date(s.date + 'T12:00:00');
        return d.toDateString() === new Date().toDateString();
      });
      const deployedNames = new Set<string>();
      todaySlots.forEach((s: Record<string, string>) => {
        (s.assigned_crew || '').split(',').forEach((n: string) => { if (n.trim()) deployedNames.add(n.trim()); });
      });
      setCrewDeployed(deployedNames.size);
      setCrewTotal((cData.all || []).length || 42);
      
      setLoading(false);
    }).catch(() => setLoading(false));

    // Fetch submittal and CO summaries (catch errors silently — these are supplementary)
    fetch('/api/pm/submittals').then(r => r.json()).then(d => {
      const subs = d.submittals || [];
      const pending = subs.filter((s: Record<string, string>) => !s.status || s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW' || s.status === 'PENDING');
      const approved = subs.filter((s: Record<string, string>) => s.status === 'APPROVED');
      setSubmittals({ total: subs.length, pending: pending.length, approved: approved.length, overdue: 0 });
    }).catch(() => {});

    // QBO KPIs — non-blocking, best-effort
    fetch('/api/qbo/kpis').then(r => r.json()).then(d => {
      if (!d.error) setQboKpis(d);
    }).catch(() => {});

    fetch('/api/pm/change-orders').then(r => r.json()).then(d => {
      const items = d.cos || [];
      const pending = items.filter((c: Record<string, string>) => c.status === 'PENDING' || c.status === 'IDENTIFIED' || c.status === 'SUBMITTED' || c.status === 'IN_NEGOTIATION');
      const approved = items.filter((c: Record<string, string>) => c.status === 'APPROVED');
      const exposure = pending.reduce((s: number, c: Record<string, string>) => s + (parseFloat(c.amount_requested) || 0), 0);
      setCos({ total: items.length, pending: pending.length, approved: approved.length, totalExposure: exposure });
    }).catch(() => {});
  }, []);

  // Build KPIs
  const totalIssues = projects.reduce((s, p) => s + p.issues, 0);
  const byIsland = projects.reduce((acc, p) => { acc[p.island] = (acc[p.island] || 0) + 1; return acc; }, {} as Record<string, number>);
  const utilizationPct = crewTotal > 0 ? Math.round((crewDeployed / crewTotal) * 100) : 0;

  const qboKpiCards: KPI[] = qboKpis ? [
    {
      label: 'Revenue This Month',
      value: fmtKpi(qboKpis.revenueThisMonth),
      subtitle: 'From QuickBooks',
      color: '#0f766e',
    },
    {
      label: 'AR Outstanding',
      value: fmtKpi(qboKpis.arOutstanding),
      subtitle: 'Unpaid invoices',
      color: qboKpis.arOutstanding > 200000 ? '#d97706' : '#0f172a',
    },
    {
      label: 'AP Outstanding',
      value: fmtKpi(qboKpis.apOutstanding),
      subtitle: 'Unpaid bills',
      color: qboKpis.apOutstanding > 100000 ? '#d97706' : '#0f172a',
    },
    {
      label: 'Net Income YTD',
      value: fmtKpi(Math.abs(qboKpis.netIncomeYtd)),
      subtitle: qboKpis.netIncomeYtd >= 0 ? 'Profitable YTD' : 'Loss YTD',
      color: qboKpis.netIncomeYtd >= 0 ? '#059669' : '#dc2626',
    },
  ] : [];

  const kpis: KPI[] = [
    ...qboKpiCards,
    {
      label: 'Active Projects',
      value: projects.length,
      subtitle: Object.entries(byIsland).map(([k, v]) => `${k}: ${v}`).join(' · '),
    },
    {
      label: 'Crew Utilization',
      value: `${utilizationPct}%`,
      subtitle: `${crewDeployed} deployed / ${crewTotal} total`,
      progress: utilizationPct,
      color: utilizationPct >= 70 ? '#059669' : utilizationPct >= 40 ? '#d97706' : '#94a3b8',
    },
    {
      label: 'Open Submittals',
      value: submittals.pending,
      subtitle: `${submittals.approved} approved · ${submittals.total} total`,
      color: submittals.pending > 20 ? '#dc2626' : submittals.pending > 10 ? '#d97706' : '#0f172a',
    },
    {
      label: 'Pending Change Orders',
      value: cos.pending,
      subtitle: cos.totalExposure > 0 ? `$${(cos.totalExposure / 1000).toFixed(0)}K exposure` : `${cos.total} total`,
      color: cos.pending > 5 ? '#dc2626' : cos.pending > 2 ? '#d97706' : '#0f172a',
    },
    {
      label: 'Open Issues',
      value: totalIssues,
      subtitle: 'Across all projects',
      color: totalIssues > 10 ? '#dc2626' : totalIssues > 3 ? '#d97706' : '#059669',
    },
  ];

  // Build action items
  const actionItems: ActionItem[] = [];
  if (totalIssues > 0) actionItems.push({ text: 'Open field issues', severity: totalIssues > 5 ? 'high' : 'medium', count: totalIssues });
  if (submittals.pending > 10) actionItems.push({ text: 'Submittals pending review', severity: 'medium', count: submittals.pending });
  if (cos.pending > 0) actionItems.push({ text: 'Change orders pending', severity: cos.totalExposure > 50000 ? 'high' : 'medium', count: cos.pending });

  // Projects with most activity
  const topProjects = [...projects].sort((a, b) => b.eventCount - a.eventCount).slice(0, 8);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Dashboard Header */}
      <DashboardHeader
        title="Operations Overview"
        subtitle={`${projects.length} active projects across ${Object.keys(byIsland).length} islands`}
        kpis={kpis}
        actionItems={actionItems}
      />

      {/* Two-column layout: Projects by island + Recent Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 8 }}>
        {/* Projects by Island */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 16 }}>
            Projects by Island
          </div>
          {['Oahu', 'Maui', 'Kauai', 'Hawaii'].map(island => {
            const islandProjects = projects.filter(p => p.island === island);
            if (islandProjects.length === 0) return null;
            return (
              <div key={island} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ISLAND_COLOR[island] }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: ISLAND_COLOR[island] }}>{island}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>({islandProjects.length})</span>
                </div>
                {islandProjects.map(p => (
                  <div key={p.kID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0 6px 16px', fontSize: 13 }}>
                    <span style={{ color: '#334155', fontWeight: 500 }}>{p.name}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.issues > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#fef2f2', color: '#dc2626' }}>{p.issues} issues</span>}
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{p.pm?.split(' ')[0] || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Recent Activity */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 16 }}>
            Recent Activity
          </div>
          {events.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No recent events</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {events.slice(0, 12).map((ev, i) => {
                const style = EVENT_STYLE[ev.type] || EVENT_STYLE.NOTE;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < 11 ? '1px solid #f8fafc' : 'none' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: style.bg, color: style.color, whiteSpace: 'nowrap', marginTop: 1 }}>
                      {style.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#334155', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.note || ev.projectName}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {ev.projectName} · {displayName(ev.recordedBy)} · {formatTime(ev.occurredAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Most Active Projects */}
      {topProjects.length > 0 && (
        <div style={{ marginTop: 20, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: '20px 24px', boxShadow: '0 1px 3px rgba(15,23,42,0.03)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', marginBottom: 16 }}>
            Project Activity (Last 30 Days)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
            {topProjects.map(p => {
              const maxEvents = Math.max(...topProjects.map(x => x.eventCount), 1);
              const barWidth = (p.eventCount / maxEvents) * 100;
              return (
                <div key={p.kID} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, background: ISLAND_COLOR[p.island] || '#64748b', width: `${barWidth}%` }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', minWidth: 30, textAlign: 'right' }}>{p.eventCount}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
