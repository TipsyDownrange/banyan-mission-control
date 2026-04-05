'use client';
import { useState, useEffect } from 'react';

type InstallItem = {
  install_id: string; kID: string; location_ref: string; system_type: string;
  system_ref: string; step_name: string; step_sequence: number;
  hours_assigned: number; hours_completed: number; pct_complete: number;
  status: string; assigned_to: string; target_date: string; completed_date: string;
  qc_passed: boolean; qc_notes: string; evidence_ref: string;
};

type ProjectSummary = {
  kID: string; totalSteps: number; completedSteps: number; inProgressSteps: number;
  notStartedSteps: number; qcFailed: number; pctComplete: number; qcPassRate: number;
  locationCount: number; locations: string[]; systems: string[];
  hoursAssigned: number; hoursCompleted: number; hoursRemaining: number;
};

type Project = { kID: string; name: string };

const STATUS_COLOR: Record<string, string> = {
  'Complete': '#059669',
  'In Progress': '#d97706',
  'Not Started': '#94a3b8',
  'Failed QC': '#dc2626',
};

const SYSTEM_COLOR: Record<string, string> = {
  'Storefront': '#0369a1',
  'Curtainwall': '#7c3aed',
  'Shower': '#0d9488',
  'Euro Wall': '#c2410c',
  'Window': '#0284c7',
  'Door': '#9333ea',
  'General': '#64748b',
};

const CARD: React.CSSProperties = {
  background: 'white', borderRadius: 18, padding: '20px 24px',
  border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
};

export default function InstallTrackingPanel({ projects }: { projects: Project[] }) {
  const [items, setItems] = useState<InstallItem[]>([]);
  const [summary, setSummary] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState('ALL');
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');

  useEffect(() => {
    const url = selectedProject === 'ALL' ? '/api/install' : `/api/install?kID=${selectedProject}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        setItems(d.items || []);
        setSummary(d.summary || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedProject]);

  function toggleLocation(loc: string) {
    setExpandedLocations(prev => {
      const next = new Set(prev);
      next.has(loc) ? next.delete(loc) : next.add(loc);
      return next;
    });
  }

  const projectName = (kID: string) => projects.find(p => p.kID === kID)?.name || kID;

  // Aggregate stats
  const totalSteps = summary.reduce((s, p) => s + p.totalSteps, 0);
  const totalComplete = summary.reduce((s, p) => s + p.completedSteps, 0);
  const totalInProgress = summary.reduce((s, p) => s + p.inProgressSteps, 0);
  const totalFailed = summary.reduce((s, p) => s + p.qcFailed, 0);
  const overallPct = totalSteps > 0 ? Math.round((totalComplete / totalSteps) * 100) : 0;
  const overallQcRate = totalComplete > 0
    ? Math.round((summary.reduce((s, p) => s + (p.qcPassRate * p.completedSteps / 100), 0) / totalComplete) * 100)
    : 0;
  const totalHoursAssigned = summary.reduce((s, p) => s + p.hoursAssigned, 0);
  const totalHoursCompleted = summary.reduce((s, p) => s + p.hoursCompleted, 0);

  // Group items by location for detail view
  const locationGroups = items.reduce((acc, item) => {
    const key = `${item.kID}::${item.location_ref}`;
    if (!acc[key]) acc[key] = { kID: item.kID, location: item.location_ref, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {} as Record<string, { kID: string; location: string; items: InstallItem[] }>);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header + Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.03em' }}>
            QA / Install Tracking
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>
            {totalSteps} install steps across {summary.length} projects
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={selectedProject}
            onChange={e => { setSelectedProject(e.target.value); setLoading(true); }}
            style={{ padding: '10px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 600, background: 'white', color: '#0f172a', cursor: 'pointer' }}
          >
            <option value="ALL">All Projects</option>
            {projects.filter(p => summary.some(s => s.kID === p.kID)).map(p => (
              <option key={p.kID} value={p.kID}>{p.name}</option>
            ))}
          </select>
          <div style={{ display: 'flex', borderRadius: 10, border: '1.5px solid #e2e8f0', overflow: 'hidden' }}>
            {(['overview', 'detail'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: viewMode === mode ? '#0f172a' : 'white',
                  color: viewMode === mode ? 'white' : '#64748b',
                }}>
                {mode === 'overview' ? 'Overview' : 'Detail'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Overall Progress</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>{overallPct}%</div>
          <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: overallPct >= 75 ? '#059669' : overallPct >= 40 ? '#d97706' : '#94a3b8', width: `${overallPct}%`, transition: 'width 0.5s' }} />
          </div>
        </div>
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Steps Complete</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#059669', letterSpacing: '-0.03em' }}>{totalComplete}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{totalInProgress} in progress · {totalSteps - totalComplete - totalInProgress - totalFailed} remaining</div>
        </div>
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>QC Pass Rate</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: overallQcRate >= 90 ? '#059669' : overallQcRate >= 70 ? '#d97706' : '#dc2626', letterSpacing: '-0.03em' }}>
            {overallQcRate > 0 ? `${overallQcRate}%` : '—'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{totalFailed > 0 ? `${totalFailed} failed QC` : 'No failures'}</div>
        </div>
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Hours Tracked</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em' }}>
            {totalHoursCompleted > 0 ? totalHoursCompleted.toFixed(0) : '—'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            {totalHoursAssigned > 0 ? `${totalHoursAssigned.toFixed(0)} assigned · ${(totalHoursAssigned - totalHoursCompleted).toFixed(0)} remaining` : 'Start tracking hours on new projects'}
          </div>
        </div>
      </div>

      {viewMode === 'overview' ? (
        /* ── OVERVIEW: Project cards with completion bars ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {summary.length === 0 ? (
            <div style={{ ...CARD, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b' }}>No install data yet</div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>Install tracking data will appear here as projects are set up with QA checklists.</div>
            </div>
          ) : summary.sort((a, b) => b.totalSteps - a.totalSteps).map(proj => (
            <button key={proj.kID} onClick={() => { setSelectedProject(proj.kID); setViewMode('detail'); setLoading(true); }}
              style={{ ...CARD, cursor: 'pointer', textAlign: 'left', display: 'block', width: '100%', transition: 'box-shadow 0.15s', border: '1.5px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{projectName(proj.kID)}</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                    {proj.kID} · {proj.locationCount} locations · {proj.systems.join(', ')}
                  </div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: proj.pctComplete >= 75 ? '#059669' : proj.pctComplete >= 40 ? '#d97706' : '#64748b' }}>
                  {proj.pctComplete}%
                </div>
              </div>
              {/* Stacked progress bar */}
              <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden', display: 'flex' }}>
                <div style={{ height: '100%', background: '#059669', width: `${(proj.completedSteps / proj.totalSteps) * 100}%` }} />
                <div style={{ height: '100%', background: '#d97706', width: `${(proj.inProgressSteps / proj.totalSteps) * 100}%` }} />
                {proj.qcFailed > 0 && <div style={{ height: '100%', background: '#dc2626', width: `${(proj.qcFailed / proj.totalSteps) * 100}%` }} />}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, fontWeight: 600 }}>
                <span style={{ color: '#059669' }}>● {proj.completedSteps} complete</span>
                <span style={{ color: '#d97706' }}>● {proj.inProgressSteps} in progress</span>
                <span style={{ color: '#94a3b8' }}>● {proj.notStartedSteps} remaining</span>
                {proj.qcFailed > 0 && <span style={{ color: '#dc2626' }}>● {proj.qcFailed} failed</span>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* ── DETAIL: Location-by-location breakdown ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedProject !== 'ALL' && (
            <button onClick={() => { setSelectedProject('ALL'); setViewMode('overview'); setLoading(true); }}
              style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: 'white', fontSize: 13, fontWeight: 700, color: '#64748b', cursor: 'pointer', marginBottom: 8 }}>
              ← All Projects
            </button>
          )}
          {Object.values(locationGroups).sort((a, b) => a.location.localeCompare(b.location)).map(group => {
            const complete = group.items.filter(i => i.status === 'Complete').length;
            const total = group.items.length;
            const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
            const isExpanded = expandedLocations.has(group.location);
            
            return (
              <div key={`${group.kID}::${group.location}`} style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                <button onClick={() => toggleLocation(group.location)}
                  style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{group.location}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {projectName(group.kID)} · {[...new Set(group.items.map(i => i.system_type))].filter(Boolean).join(', ')} · {total} steps
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#94a3b8', width: `${pct}%` }} />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 800, color: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#64748b', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {group.items.sort((a, b) => a.step_sequence - b.step_sequence).map(item => (
                      <div key={item.install_id}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f8fafc', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                            background: STATUS_COLOR[item.status] || '#94a3b8',
                          }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.step_name}
                            </div>
                            {item.system_type && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                background: `${SYSTEM_COLOR[item.system_type] || '#64748b'}15`,
                                color: SYSTEM_COLOR[item.system_type] || '#64748b',
                              }}>
                                {item.system_type}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                          {item.assigned_to && <span style={{ fontSize: 12, color: '#64748b' }}>{item.assigned_to}</span>}
                          {item.completed_date && <span style={{ fontSize: 12, color: '#94a3b8' }}>{item.completed_date}</span>}
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                            background: `${STATUS_COLOR[item.status] || '#94a3b8'}15`,
                            color: STATUS_COLOR[item.status] || '#94a3b8',
                          }}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {Object.keys(locationGroups).length === 0 && (
            <div style={{ ...CARD, textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#64748b' }}>No install data for this project</div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 8 }}>QA checklists will appear here once install tracking is set up for this project.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
