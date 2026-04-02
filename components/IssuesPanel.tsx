'use client';
import { useEffect, useState } from 'react';

type Issue = {
  id: string; kID: string; projectName: string; type: string;
  occurredAt: string; recordedAt: string; performedBy: string; recordedBy: string;
  note: string; location: string; unit: string;
};

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

export default function IssuesPanel() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/events?type=FIELD_ISSUE&limit=200')
      .then(r => r.json())
      .then(d => { setIssues(d.events || []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  // Group by project
  const byProject: Record<string, Issue[]> = {};
  for (const i of issues) {
    const key = i.projectName || i.kID || 'Unknown';
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(i);
  }

  return (
    <div style={{ padding: '32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>Operations</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>Issues</h1>
          {!loading && <span style={{ fontSize: 13, color: '#94a3b8', paddingBottom: 4 }}>{issues.length} open field issue{issues.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(15,118,110,0.12)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading issues...</div>
        </div>
      )}

      {error && <div style={{ padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', marginBottom: 20 }}>{error}</div>}

      {!loading && issues.length === 0 && !error && (
        <div style={{ padding: 48, textAlign: 'center', borderRadius: 20, background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>No open issues</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Field issues logged by crew will appear here.</div>
        </div>
      )}

      {!loading && Object.entries(byProject).map(([project, projectIssues]) => (
        <div key={project} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>
            {project} · {projectIssues.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projectIssues.map(issue => (
              <div key={issue.id} style={{ background: 'rgba(254,242,242,0.8)', borderRadius: 16, border: '1px solid rgba(239,68,68,0.15)', padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: issue.note ? 8 : 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>{issue.id}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{formatTime(issue.occurredAt || issue.recordedAt)}</div>
                </div>
                {issue.note && <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, marginBottom: 6 }}>{issue.note}</div>}
                {issue.location && <div style={{ fontSize: 12, color: '#64748b' }}>Location: {issue.location}</div>}
                {(issue.performedBy || issue.recordedBy) && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Logged by {displayName(issue.performedBy || issue.recordedBy)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
