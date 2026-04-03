'use client';
import { useEffect, useState } from 'react';

type Tab = 'budget' | 'co' | 'schedule' | 'submittal';

const TABS: { key: Tab; label: string; color: string }[] = [
  { key: 'budget',   label: 'Budget',       color: '#0f766e' },
  { key: 'co',       label: 'Change Orders', color: '#92400e' },
  { key: 'schedule', label: 'Schedule',      color: '#4338ca' },
  { key: 'submittal',label: 'Submittals',    color: '#0369a1' },
];

const ISLAND_COLOR: Record<string, string> = {
  Oahu: '#0369a1', Maui: '#0f766e', Kauai: '#6d28d9', Hawaii: '#92400e',
};

type Project = { kID: string; name: string; pm: string; island: string };

export default function PMPanel({ defaultTab }: { defaultTab?: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>((defaultTab as Tab) || 'budget');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    setError('');
    setRows([]);
    fetch(`/api/pm?project=${encodeURIComponent(selectedProject)}&tab=${activeTab}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setError(d.error);
          setAvailableTabs(d.available || []);
        } else {
          setRows(d.rows || []);
          setAvailableTabs([]);
        }
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [selectedProject, activeTab]);

  const proj = projects.find(p => p.name === selectedProject);

  // Get column headers from first row
  const columns = rows.length > 0 ? Object.keys(rows[0]).filter(k => k && k.trim()) : [];

  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Project Management</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>
            {selectedProject || 'Select a Project'}
          </h1>
          {proj && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999, color: ISLAND_COLOR[proj.island] || '#64748b', background: 'rgba(255,255,255,0.9)', border: '1px solid currentColor', marginBottom: 4 }}>
              {proj.island} · {proj.pm}
            </span>
          )}
        </div>
      </div>

      {/* Project selector */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontSize: 13, color: '#0f172a', outline: 'none', cursor: 'pointer', minWidth: 240 }}
        >
          <option value="">Choose a project...</option>
          {projects.map(p => (
            <option key={p.kID} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      {selectedProject && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ padding: '7px 16px', borderRadius: 999, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', border: activeTab === t.key ? `1px solid ${t.color}` : '1px solid #e2e8f0', background: activeTab === t.key ? 'white' : 'white', color: activeTab === t.key ? t.color : '#94a3b8', boxShadow: activeTab === t.key ? `0 0 0 2px ${t.color}22` : 'none' }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {!selectedProject && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Select a project above</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Budget, change orders, schedule, and submittals pulled live from Smartsheet</div>
        </div>
      )}

      {selectedProject && loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading from Smartsheet...</div>
        </div>
      )}

      {selectedProject && !loading && error && (
        <div style={{ padding: '16px 20px', borderRadius: 16, background: '#fff7ed', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>No {activeTab} data found</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{error}</div>
          {availableTabs.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              Available: {availableTabs.map(t => <button key={t} onClick={() => setActiveTab(t as Tab)} style={{ marginLeft: 6, padding: '2px 8px', borderRadius: 6, background: 'white', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{t}</button>)}
            </div>
          )}
        </div>
      )}

      {selectedProject && !loading && !error && rows.length > 0 && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(15,23,42,0.04)' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8' }}>
              {TABS.find(t => t.key === activeTab)?.label} · {rows.length} rows
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Live from Smartsheet</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {columns.slice(0, 8).map(col => (
                    <th key={col} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                    {columns.slice(0, 8).map(col => (
                      <td key={col} style={{ padding: '10px 14px', color: '#334155', verticalAlign: 'top', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row[col] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              Showing 50 of {rows.length} rows
            </div>
          )}
        </div>
      )}

      {selectedProject && !loading && !error && rows.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0', fontSize: 13, color: '#94a3b8' }}>
          No data in this sheet yet
        </div>
      )}
    </div>
  );
}
