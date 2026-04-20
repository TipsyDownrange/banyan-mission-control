'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type BuildPhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

interface BuildTask {
  label: string;
  done: boolean;
  notes?: string;
}

interface BuildPhase {
  phase_number: number;
  phase_name: string;
  short_label: string;
  estimated_weeks: string;
  status: BuildPhaseStatus;
  tasks: BuildTask[];
  notes?: string;
}

interface BuildTimelineData {
  phases: BuildPhase[];
  last_updated: string;
  overall_pct_complete: number;
  current_phase_number: number;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function phaseColors(status: BuildPhaseStatus, isCurrent: boolean) {
  if (status === 'complete') return { bg: '#059669', text: '#fff', border: '#059669' };
  if (status === 'blocked')  return { bg: '#dc2626', text: '#fff', border: '#dc2626' };
  if (isCurrent || status === 'in_progress') return { bg: '#0f766e', text: '#fff', border: '#14b8a6' };
  return { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PhaseChip({
  phase, isCurrent, isExpanded, onClick,
}: {
  phase: BuildPhase;
  isCurrent: boolean;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const { bg, text, border } = phaseColors(phase.status, isCurrent);
  const done = phase.tasks.filter((t) => t.done).length;
  const total = phase.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
        background: isExpanded ? bg : bg === '#f1f5f9' ? '#fff' : bg,
        border: `1.5px solid ${isExpanded ? border : border}`,
        boxShadow: isCurrent ? '0 0 0 3px rgba(20,184,166,0.2)' : 'none',
        minWidth: 72, flex: '1 1 72px', maxWidth: 90,
        transition: 'all 0.15s',
        animation: isCurrent ? 'pulseBorder 2s ease-in-out infinite' : 'none',
      }}
    >
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: isExpanded ? text : phase.status === 'not_started' ? '#94a3b8' : text, lineHeight: 1 }}>
        Ph {phase.phase_number}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: isExpanded ? text : phase.status === 'not_started' ? '#64748b' : text, lineHeight: 1.2, textAlign: 'center' }}>
        {phase.short_label}
      </span>
      {phase.status === 'complete' && (
        <span style={{ fontSize: 10, color: isExpanded ? 'rgba(255,255,255,0.85)' : '#059669' }}>✓</span>
      )}
      {(phase.status === 'in_progress' || isCurrent) && total > 0 && (
        <span style={{ fontSize: 9, color: isExpanded ? 'rgba(255,255,255,0.85)' : '#0f766e', fontWeight: 700 }}>{pct}%</span>
      )}
      {phase.status === 'not_started' && (
        <span style={{ fontSize: 8, color: '#94a3b8', letterSpacing: '0.04em' }}>{phase.estimated_weeks.replace('Weeks ', 'Wk ')}</span>
      )}
    </button>
  );
}

function PhaseDetailPanel({ phase }: { phase: BuildPhase }) {
  const done = phase.tasks.filter((t) => t.done).length;
  const total = phase.tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{
      marginTop: 12, padding: '16px 18px', borderRadius: 12,
      background: 'white', border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
            Phase {phase.phase_number}: {phase.phase_name}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{phase.estimated_weeks}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#94a3b8' }}>
            {pct}%
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>{done}/{total} tasks</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: '#f1f5f9', marginBottom: 14 }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#94a3b8',
          width: `${pct}%`, transition: 'width 0.4s',
        }} />
      </div>

      {/* Task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {phase.tasks.map((task, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{
              flexShrink: 0, width: 16, height: 16, borderRadius: '50%', marginTop: 1,
              background: task.done ? '#059669' : 'transparent',
              border: task.done ? 'none' : '1.5px solid #cbd5e1',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {task.done && <span style={{ fontSize: 9, color: '#fff', fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: 12, color: task.done ? '#64748b' : '#0f172a', lineHeight: 1.4, textDecoration: task.done ? 'line-through' : 'none' }}>
              {task.label}
            </span>
          </div>
        ))}
      </div>

      {phase.notes && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
          {phase.notes}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BuildLifecycleTimeline() {
  const [data, setData] = useState<BuildTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/build-state');
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
        setError(null);
      } else {
        setError(json.error || 'Failed to load build state');
      }
    } catch (e) {
      console.error('[BuildLifecycleTimeline] fetch error:', e);
      setError('Network error loading build state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  if (loading) {
    return (
      <div style={{ padding: '20px 24px', borderRadius: 12, background: 'white', border: '1px solid #e2e8f0', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading build state…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '16px 24px', borderRadius: 12, background: 'white', border: '1px solid #fca5a5', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#dc2626' }}>Build state unavailable: {error}</div>
      </div>
    );
  }

  const currentPhase = data.phases.find((p) => p.phase_number === data.current_phase_number);
  const pct = data.overall_pct_complete;

  return (
    <div style={{ padding: '0 0 20px' }}>
      <style>{`
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 0 2px rgba(20,184,166,0.15); }
          50% { box-shadow: 0 0 0 4px rgba(20,184,166,0.30); }
        }
      `}</style>

      {/* Header card */}
      <div style={{
        background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '16px 20px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 2 }}>
            BanyanOS Build Progress
          </div>
          {currentPhase && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f766e' }}>
              Currently in Phase {currentPhase.phase_number}: {currentPhase.phase_name}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Updated {new Date(data.last_updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#94a3b8', lineHeight: 1 }}>
              {pct}%
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>complete</div>
          </div>
          <div style={{ width: 120 }}>
            <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9' }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: pct >= 75 ? '#059669' : pct >= 40 ? '#d97706' : '#14b8a6',
                width: `${pct}%`, transition: 'width 0.5s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
              {data.phases.filter((p) => p.status === 'complete').length} of {data.phases.length} phases
            </div>
          </div>
        </div>
      </div>

      {/* Phase chip row */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        padding: '12px 16px', background: 'white', borderRadius: 12,
        border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {data.phases.map((phase) => (
          <PhaseChip
            key={phase.phase_number}
            phase={phase}
            isCurrent={phase.phase_number === data.current_phase_number}
            isExpanded={expandedPhase === phase.phase_number}
            onClick={() => setExpandedPhase(expandedPhase === phase.phase_number ? null : phase.phase_number)}
          />
        ))}
      </div>

      {/* Expanded detail panel */}
      {expandedPhase !== null && (() => {
        const phase = data.phases.find((p) => p.phase_number === expandedPhase);
        return phase ? <PhaseDetailPanel phase={phase} /> : null;
      })()}
    </div>
  );
}
