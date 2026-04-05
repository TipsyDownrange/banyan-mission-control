'use client';
import { useEffect, useState, useCallback } from 'react';

type Issue = {
  id: string; kID: string; projectName: string; type: string;
  occurredAt: string; recordedAt: string; performedBy: string; recordedBy: string;
  note: string; location: string; unit: string;
  // Fields that may come from extended sheet columns or be derived
  issue_category?: string; severity?: string; blocking_flag?: string;
  assigned_to?: string; status?: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

type FilterTab = 'all' | 'open' | 'resolved' | 'blocking';

function formatTime(raw: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return raw; }
}

function displayName(email: string): string {
  if (!email) return '';
  if (email.includes('@')) return email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return email;
}

function deriveSeverity(note: string, blocking: boolean): string {
  if (blocking) return 'HIGH';
  const lower = (note || '').toLowerCase();
  if (lower.includes('critical') || lower.includes('stop work') || lower.includes('safety')) return 'CRITICAL';
  if (lower.includes('remediat') || lower.includes('misalign') || lower.includes('damage')) return 'HIGH';
  if (lower.includes('shim') || lower.includes('waiting') || lower.includes('delay')) return 'MEDIUM';
  return 'LOW';
}

function deriveBlocking(note: string): boolean {
  const lower = (note || '').toLowerCase();
  return lower.includes('block') || lower.includes('stop work') || lower.includes('waiting on') || lower.includes('cannot proceed');
}

const SEVERITY_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: '#fef2f2', color: '#991b1b', border: 'rgba(239,68,68,0.3)' },
  HIGH:     { bg: '#fef2f2', color: '#b91c1c', border: 'rgba(239,68,68,0.2)' },
  MEDIUM:   { bg: '#fffbeb', color: '#92400e', border: 'rgba(245,158,11,0.2)' },
  LOW:      { bg: '#f8fafc', color: '#64748b', border: 'rgba(148,163,184,0.2)' },
};

interface IssuesPanelProps {
  onNavigate?: (view: string, params?: Record<string, string>) => void;
}

export default function IssuesPanel({ onNavigate }: IssuesPanelProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [assignModalIssue, setAssignModalIssue] = useState<Issue | null>(null);
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  // Track local status overrides (issue id → status)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  // Track local assignee overrides
  const [assignOverrides, setAssignOverrides] = useState<Record<string, string>>({});

  const fetchIssues = useCallback(() => {
    fetch('/api/events?type=FIELD_ISSUE&limit=200')
      .then(r => r.json())
      .then(d => { setIssues(d.events || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchIssues();
    fetch('/api/crew').then(r => r.json()).then(d => setCrew(d.all || d.crew || [])).catch(() => {});
  }, [fetchIssues]);

  // Enrich issues with derived fields
  const enrichedIssues = issues.map(issue => {
    const blocking = issue.blocking_flag === 'true' || issue.blocking_flag === 'TRUE' || deriveBlocking(issue.note);
    const severity = issue.severity || deriveSeverity(issue.note, blocking);
    const status = statusOverrides[issue.id] || issue.status || 'OPEN';
    const assigned = assignOverrides[issue.id] || issue.assigned_to || '';
    return { ...issue, severity, blocking, status, assigned_to: assigned };
  });

  // Sort: blocking first, then newest
  const sortedIssues = [...enrichedIssues].sort((a, b) => {
    if (a.blocking && !b.blocking) return -1;
    if (!a.blocking && b.blocking) return 1;
    return new Date(b.recordedAt || b.occurredAt).getTime() - new Date(a.recordedAt || a.occurredAt).getTime();
  });

  // Filter
  const filteredIssues = sortedIssues.filter(issue => {
    if (filter === 'open') return issue.status !== 'RESOLVED';
    if (filter === 'resolved') return issue.status === 'RESOLVED';
    if (filter === 'blocking') return issue.blocking;
    return true;
  });

  const counts = {
    all: enrichedIssues.length,
    open: enrichedIssues.filter(i => i.status !== 'RESOLVED').length,
    resolved: enrichedIssues.filter(i => i.status === 'RESOLVED').length,
    blocking: enrichedIssues.filter(i => i.blocking).length,
  };

  async function handleClose(issue: Issue) {
    setSaving(true);
    try {
      await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: issue.id, status: 'RESOLVED' }),
      });
      setStatusOverrides(prev => ({ ...prev, [issue.id]: 'RESOLVED' }));
    } catch {
      // Optimistic update even if API fails
      setStatusOverrides(prev => ({ ...prev, [issue.id]: 'RESOLVED' }));
    }
    setSaving(false);
  }

  async function handleAssign() {
    if (!assignModalIssue || !assignee) return;
    setSaving(true);
    try {
      await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: assignModalIssue.id, assigned_to: assignee }),
      });
      setAssignOverrides(prev => ({ ...prev, [assignModalIssue.id]: assignee }));
    } catch {
      setAssignOverrides(prev => ({ ...prev, [assignModalIssue.id]: assignee }));
    }
    setAssignModalIssue(null);
    setAssignee('');
    setSaving(false);
  }

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'open', label: `Open (${counts.open})` },
    { key: 'resolved', label: `Resolved (${counts.resolved})` },
    { key: 'blocking', label: `Blocking (${counts.blocking})` },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Issues</h1>
          {!loading && <span style={{ fontSize: 13, color: '#94a3b8', paddingBottom: 4 }}>{counts.open} open field issue{counts.open !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      {/* Filter tabs */}
      {!loading && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 14, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 800, transition: 'all 0.15s',
                background: filter === t.key ? 'white' : 'transparent',
                color: filter === t.key ? (t.key === 'blocking' ? '#b91c1c' : '#0f172a') : '#64748b',
                boxShadow: filter === t.key ? '0 1px 4px rgba(15,23,42,0.08)' : 'none',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading issues...</div>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 20 }}>{error}</div>}

      {!loading && filteredIssues.length === 0 && !error && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 20, marginBottom: 8, color: '#14b8a6' }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
            {filter === 'all' ? 'No issues found' : `No ${filter} issues`}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>
            {filter === 'all' ? 'Field issues logged by crew will appear here.' : 'Try a different filter.'}
          </div>
        </div>
      )}

      {/* Issue cards */}
      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredIssues.map(issue => {
            const sev = SEVERITY_COLORS[issue.severity || 'LOW'] || SEVERITY_COLORS.LOW;
            const isResolved = issue.status === 'RESOLVED';

            return (
              <div key={issue.id} style={{
                background: isResolved ? '#f8faf8' : sev.bg,
                borderRadius: 16,
                border: `1px solid ${isResolved ? 'rgba(34,197,94,0.2)' : sev.border}`,
                padding: '16px 20px',
                opacity: isResolved ? 0.7 : 1,
                transition: 'opacity 0.2s',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>{issue.id}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: sev.bg, color: sev.color, border: `1px solid ${sev.border}` }}>
                      {issue.severity}
                    </span>
                    {issue.blocking && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#fef2f2', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.3)' }}>
                        🚫 BLOCKING
                      </span>
                    )}
                    {isResolved && (
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#15803d', border: '1px solid rgba(34,197,94,0.3)' }}>
                        ✓ RESOLVED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{formatTime(issue.occurredAt || issue.recordedAt)}</div>
                </div>

                {/* Project */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>{issue.projectName}</div>

                {/* Note / description */}
                {issue.note && <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, marginBottom: 8 }}>{issue.note}</div>}

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#64748b', marginBottom: 10 }}>
                  {issue.type && <span>Type: <strong>{issue.type.replace(/_/g, ' ')}</strong></span>}
                  {issue.location && <span>Location: <strong>{issue.location}</strong></span>}
                  {issue.unit && <span>Unit: <strong>{issue.unit}</strong></span>}
                  {(issue.performedBy || issue.recordedBy) && (
                    <span>By: <strong>{displayName(issue.performedBy || issue.recordedBy)}</strong></span>
                  )}
                  {issue.assigned_to && (
                    <span>Assigned: <strong style={{ color: '#0f766e' }}>{issue.assigned_to}</strong></span>
                  )}
                </div>

                {/* Action buttons */}
                {!isResolved && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setAssignModalIssue(issue); setAssignee(issue.assigned_to || ''); }}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: '#eff6ff', border: '1px solid rgba(3,105,161,0.2)', color: '#0369a1',
                      }}>
                      👤 Assign
                    </button>
                    <button
                      onClick={() => handleClose(issue)}
                      disabled={saving}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                        background: '#f0fdfa', border: '1px solid rgba(15,118,110,0.2)', color: '#0f766e',
                        opacity: saving ? 0.5 : 1,
                      }}>
                      ✓ Close
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Modal */}
      {assignModalIssue && (
        <>
          <div onClick={() => setAssignModalIssue(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', borderRadius: 24, padding: 28, zIndex: 301,
            width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(15,23,42,0.15)',
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>Assign Issue</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>{assignModalIssue.id} — {assignModalIssue.projectName}</div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>Assign To</div>
            <select
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12,
                border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                marginBottom: 20,
              }}>
              <option value="">Select crew member...</option>
              {crew.map(c => (
                <option key={c.user_id} value={c.name}>{c.name} — {c.role} ({c.island})</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setAssignModalIssue(null)}
                style={{ flex: 1, padding: 11, borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleAssign} disabled={!assignee || saving}
                style={{
                  flex: 2, padding: 11, borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: assignee ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                  color: assignee ? 'white' : '#94a3b8',
                }}>
                {saving ? 'Saving...' : 'Assign'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
