'use client';
import { useEffect, useState } from 'react';

type TodayData = {
  bids_due: { name: string; due: string; assigned: string; kID: string }[];
  active_projects: { name: string; pm: string; status: string; kID?: string }[];
  date: string;
  error?: string;
};

type Project = { kID: string; name: string; island: string };

interface TodayPanelProps {
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}

export default function TodayPanel({ onNavigate }: TodayPanelProps) {
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showLogIssue, setShowLogIssue] = useState(false);
  const [issueProject, setIssueProject] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueSeverity, setIssueSeverity] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetch('/api/today')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  async function handleLogIssue() {
    if (!issueProject || !issueDesc) return;
    setSubmitting(true);
    try {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kID: issueProject, description: issueDesc, severity: issueSeverity, type: 'FIELD_ISSUE' }),
      });
      // Also create a task on the Task Board
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: [{
          id: `TSK-ISS-${Date.now()}`,
          title: `[ISSUE] ${issueDesc.slice(0, 60)}`,
          detail: `${issueDesc} | Project: ${issueProject} | Severity: ${issueSeverity}`,
          status: issueSeverity === 'CRITICAL' ? 'in_progress' : 'queued',
          priority: issueSeverity.toLowerCase(),
          category: 'Bug Report',
          assignedTo: 'Kai',
          createdAt: new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString().split('T')[0],
        }]}),
      }).catch(() => {});
      setShowLogIssue(false);
      setIssueProject('');
      setIssueDesc('');
      setIssueSeverity('MEDIUM');
      setToast('Issue logged successfully');
      setTimeout(() => setToast(''), 2000);
    } catch {
      setToast('Failed to log issue');
      setTimeout(() => setToast(''), 2000);
    }
    setSubmitting(false);
  }

  const highItems = [
    ...(data?.bids_due || []).map(b => ({
      id: b.kID, type: 'bid',
      title: `Bid due — ${b.name}`,
      detail: `Assigned to ${b.assigned || 'Unassigned'} · Due ${b.due ? new Date(b.due + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}`,
      tag: 'Bid Deadline', tagColor: '#92400e', tagBg: '#fffbeb',
    })),
  ];

  const watchItems = [
    { id: 'dr-today', type: 'report', title: 'Daily reports due at 3:30 PM', detail: 'Field leads on active jobs — check submissions by end of day', tag: 'Daily Report', tagColor: '#1d4ed8', tagBg: '#eff6ff' },
    ...(data?.active_projects || []).slice(0, 3).map((p, i) => ({
      id: p.kID || `proj-${i}`, type: 'project',
      title: p.name,
      detail: `Active · PM: ${p.pm}`,
      tag: 'Active Job', tagColor: '#0f766e', tagBg: '#f0fdfa',
      kID: p.kID,
    })),
  ];

  const hasNoEvents = !loading && highItems.length === 0 && (!data?.active_projects || data.active_projects.length === 0);

  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Assistant</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0, marginBottom: 4 }}>Today</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{today}</p>
          </div>
          <button
            onClick={() => setShowLogIssue(true)}
            style={{
              padding: '8px 16px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              background: 'linear-gradient(135deg,#ef4444,#f97316)', color: 'white', border: 'none',
              boxShadow: '0 2px 8px rgba(239,68,68,0.3)',
            }}>
            🚨 Log Issue
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24,
        padding: 18, borderRadius: 24,
        background: 'linear-gradient(135deg,rgba(255,255,255,0.98) 0%,rgba(240,249,255,0.92) 50%,rgba(248,250,252,0.96) 100%)',
        border: '1px solid rgba(148,163,184,0.18)', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
        {[
          { label: 'Bids due soon', value: data?.bids_due?.length ?? '—', helper: 'Due within 3 days' },
          { label: 'Active projects', value: data?.active_projects?.length ?? '—', helper: 'From Smartsheet' },
          { label: 'Daily reports', value: 'Due 3:30', helper: 'Field leads to submit' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.95)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#64748b' }}>{s.label}</div>
            <div style={{ marginTop: 6, fontSize: typeof s.value === 'number' && s.value > 0 ? 32 : 22, fontWeight: 900, letterSpacing: '-0.05em', color: '#0f172a', lineHeight: 1 }}>{s.value}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>{s.helper}</div>
          </div>
        ))}
      </div>

      {/* Kai posture */}
      {!loading && (
        <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 16, background: 'rgba(15,23,42,0.03)', border: '1px dashed rgba(148,163,184,0.35)', display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(15,118,110,0.7)', flexShrink: 0, marginTop: 2 }}>KAI</span>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            {highItems.length > 0 
              ? `${highItems.length} bid${highItems.length > 1 ? 's' : ''} due in the next 3 days. Review and make sure estimators are on track. Daily reports due at 3:30 PM.`
              : 'No bids due in the next 3 days. Daily reports due at 3:30 PM — field leads to submit before end of day.'}
          </div>
        </div>
      )}

      {loading && (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: 48, textAlign: 'center' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading live data...</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Empty state */}
      {hasNoEvents && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0', marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: '#14b8a6' }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Nothing logged today</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Quiet day or check the field app</div>
        </div>
      )}

      {/* High priority */}
      {!loading && highItems.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 10 }}>Needs Action</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {highItems.map(item => (
              <div key={item.id} style={{ background: 'white', borderRadius: 16, border: '1px solid rgba(239,68,68,0.15)', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', padding: '14px 18px', display: 'flex', gap: 12 }}>
                <div style={{ width: 3, borderRadius: 4, background: '#ef4444', flexShrink: 0, alignSelf: 'stretch', minHeight: 32 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: item.tagColor, background: item.tagBg, padding: '2px 8px', borderRadius: 999 }}>{item.tag}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watch — with View in PM buttons */}
      {!loading && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>Watch Today</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {watchItems.map(item => (
              <div key={item.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(15,23,42,0.04)', padding: '14px 18px', display: 'flex', gap: 12 }}>
                <div style={{ width: 3, borderRadius: 4, background: '#f59e0b', flexShrink: 0, alignSelf: 'stretch', minHeight: 28 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: item.tagColor, background: item.tagBg, padding: '2px 8px', borderRadius: 999 }}>{item.tag}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{item.detail}</div>
                </div>
                {item.type === 'project' && onNavigate && (
                  <button
                    onClick={() => onNavigate('Schedules', { kID: 'kID' in item ? String(item.kID) : '' })}
                    style={{
                      alignSelf: 'center', padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e',
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    View in PM →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 12,
          background: toast.includes('Failed') ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${toast.includes('Failed') ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.3)'}`,
          color: toast.includes('Failed') ? '#b91c1c' : '#15803d',
          fontSize: 13, fontWeight: 700, zIndex: 500,
          boxShadow: '0 4px 16px rgba(15,23,42,0.1)',
        }}>
          {toast.includes('Failed') ? '⚠️' : '✓'} {toast}
        </div>
      )}

      {/* Log Issue Modal */}
      {showLogIssue && (
        <>
          <div onClick={() => setShowLogIssue(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', borderRadius: 24, padding: 28, zIndex: 301,
            width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(15,23,42,0.15)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 18 }}>🚨 Log Field Issue</div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Project *</label>
                <select value={issueProject} onChange={e => setIssueProject(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.kID} value={p.kID}>{p.name} ({p.island})</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Description *</label>
                <textarea value={issueDesc} onChange={e => setIssueDesc(e.target.value)}
                  rows={3} placeholder="What happened?"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 4 }}>Severity</label>
                <select value={issueSeverity} onChange={e => setIssueSeverity(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowLogIssue(false)}
                style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleLogIssue} disabled={!issueProject || !issueDesc || submitting}
                style={{
                  flex: 2, padding: 11, borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: issueProject && issueDesc ? 'linear-gradient(135deg,#ef4444,#f97316)' : '#e2e8f0',
                  color: issueProject && issueDesc ? 'white' : '#94a3b8',
                }}>
                {submitting ? 'Logging...' : 'Log Issue'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
