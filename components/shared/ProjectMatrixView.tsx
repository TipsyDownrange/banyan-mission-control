'use client';
import { useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InstallPlan {
  install_plan_id: string;
  job_id: string;
  system_type: string;
  location: string;
  estimated_qty: number;
  status: string;
}

interface InstallStep {
  install_step_id: string;
  install_plan_id: string;
  step_seq: number;
  step_name: string;
  allotted_hours: number;
  category: string;
  planned_start_date: string;
  planned_end_date: string;
  assigned_crew: string;
}

interface StepCompletion {
  step_completion_id: string;
  install_step_id: string;
  mark_id: string;
  percent_complete: number;
  date: string;
  notes: string;
  status: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CellStatus = 'not_started' | 'in_progress' | 'complete' | 'blocked';

function cellStatus(
  planId: string,
  stepType: string,
  stepsByPlan: Map<string, InstallStep[]>,
  completionsByStep: Map<string, StepCompletion[]>
): { status: CellStatus; done: number; total: number } {
  const planSteps = (stepsByPlan.get(planId) || []).filter(
    s => s.step_name.toLowerCase().includes(stepType.toLowerCase()) ||
         (s.category || '').toLowerCase().includes(stepType.toLowerCase())
  );

  if (planSteps.length === 0) return { status: 'not_started', done: 0, total: 0 };

  let done = 0;
  let blocked = false;
  let inProgress = false;

  for (const step of planSteps) {
    const comps = completionsByStep.get(step.install_step_id) || [];
    const blocked_ = comps.some(c => (c.status || '').toUpperCase() === 'BLOCKED' || (c.notes || '').toUpperCase().includes('BLOCK'));
    const maxPct = comps.length ? Math.max(...comps.map(c => c.percent_complete)) : 0;
    if (blocked_) blocked = true;
    if (maxPct >= 100) done++;
    else if (maxPct > 0) inProgress = true;
  }

  if (blocked) return { status: 'blocked', done, total: planSteps.length };
  if (done === planSteps.length && planSteps.length > 0) return { status: 'complete', done, total: planSteps.length };
  if (done > 0 || inProgress) return { status: 'in_progress', done, total: planSteps.length };
  return { status: 'not_started', done: 0, total: planSteps.length };
}

const STATUS_STYLE: Record<CellStatus, { bg: string; border: string; text: string; label: string }> = {
  not_started: { bg: 'rgba(148,163,184,0.08)',  border: 'rgba(148,163,184,0.15)', text: '#64748b', label: '⬜ Not started' },
  in_progress:  { bg: 'rgba(59,130,246,0.15)',   border: 'rgba(59,130,246,0.3)',  text: '#93c5fd', label: '🔄 In progress' },
  complete:     { bg: 'rgba(21,128,61,0.15)',    border: 'rgba(21,128,61,0.3)',   text: '#86efac', label: '✅ Complete' },
  blocked:      { bg: 'rgba(220,38,38,0.15)',    border: 'rgba(220,38,38,0.3)',   text: '#fca5a5', label: '❌ Blocked' },
};

// ─── Schedule Slide ────────────────────────────────────────────────────────

function ScheduleSlide({ steps, completionsByStep }: {
  steps: InstallStep[];
  completionsByStep: Map<string, StepCompletion[]>;
}) {
  const stepsWithDates = steps.filter(s => s.planned_start_date);
  if (stepsWithDates.length === 0) {
    return <div style={{ padding: '16px 0', color: '#94a3b8', fontSize: 13 }}>No planned dates assigned yet</div>;
  }

  function deltaLabel(planned: string, actual: string): { label: string; color: string } {
    if (!actual) return { label: 'In progress', color: '#94a3b8' };
    const p = new Date(planned).getTime();
    const a = new Date(actual).getTime();
    const days = Math.round((a - p) / (1000 * 60 * 60 * 24));
    if (days <= 0) return { label: '✅ On time', color: '#86efac' };
    if (days <= 2) return { label: `⚠️ +${days}d`, color: '#fde68a' };
    return { label: `🔴 +${days}d`, color: '#fca5a5' };
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 700 }}>Step</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b', fontWeight: 700 }}>Planned Start</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b', fontWeight: 700 }}>Actual</th>
            <th style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b', fontWeight: 700 }}>Delta</th>
          </tr>
        </thead>
        <tbody>
          {stepsWithDates.map(step => {
            const comps = completionsByStep.get(step.install_step_id) || [];
            const completeComp = comps.find(c => c.percent_complete >= 100);
            const actualDate = completeComp?.date || '';
            const delta = deltaLabel(step.planned_start_date, actualDate);
            return (
              <tr key={step.install_step_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{step.step_name}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{step.planned_start_date || '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{actualDate || '—'}</td>
                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: delta.color }}>{delta.label}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cell Detail Flyout ───────────────────────────────────────────────────────

function CellDetail({
  plan,
  stepType,
  steps,
  completionsByStep,
  onClose,
}: {
  plan: InstallPlan;
  stepType: string;
  steps: InstallStep[];
  completionsByStep: Map<string, StepCompletion[]>;
  onClose: () => void;
}) {
  const matchingSteps = steps.filter(
    s => s.step_name.toLowerCase().includes(stepType.toLowerCase()) ||
         (s.category || '').toLowerCase().includes(stepType.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: '90%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto',
        background: '#0d1f2d', borderRadius: 16, padding: 20,
        border: '1px solid rgba(255,255,255,0.1)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>{plan.location}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{stepType}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 10px', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>

        {matchingSteps.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>No matching steps</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matchingSteps.map(step => {
              const comps = completionsByStep.get(step.install_step_id) || [];
              const maxPct = comps.length ? Math.max(...comps.map(c => c.percent_complete)) : 0;
              const isBlocked = comps.some(c => (c.status || '').toUpperCase() === 'BLOCKED');
              return (
                <div key={step.install_step_id} style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{step.step_name}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 800,
                      color: isBlocked ? '#fca5a5' : maxPct >= 100 ? '#86efac' : maxPct > 0 ? '#93c5fd' : '#64748b',
                    }}>
                      {isBlocked ? '❌ Blocked' : maxPct >= 100 ? '✅ Done' : maxPct > 0 ? `🔄 ${maxPct}%` : '⬜ Not started'}
                    </span>
                  </div>
                  {step.planned_start_date && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Planned: {step.planned_start_date}{step.planned_end_date ? ` → ${step.planned_end_date}` : ''}
                    </div>
                  )}
                  {step.assigned_crew && (
                    <div style={{ fontSize: 11, color: '#64748b' }}>Crew: {step.assigned_crew}</div>
                  )}
                  {comps.length > 0 && (
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 6 }}>
                      <div style={{ height: '100%', width: `${maxPct}%`, background: isBlocked ? '#dc2626' : maxPct >= 100 ? '#22c55e' : '#3b82f6', borderRadius: 2 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProjectMatrixViewProps {
  jobId: string;
}

export default function ProjectMatrixView({ jobId }: ProjectMatrixViewProps) {
  const [plans, setPlans] = useState<InstallPlan[]>([]);
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const [completions, setCompletions] = useState<StepCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ plan: InstallPlan; stepType: string } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'schedule-slide'>('matrix');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/work-breakdown/${jobId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPlans((data.plans || []).filter((p: InstallPlan) => p.system_type !== '__JOB_DOCS__'));
      setSteps(data.steps || []);
      setCompletions(data.completions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // Build indexes
  const stepsByPlan = new Map<string, InstallStep[]>();
  steps.forEach(s => {
    if (!stepsByPlan.has(s.install_plan_id)) stepsByPlan.set(s.install_plan_id, []);
    stepsByPlan.get(s.install_plan_id)!.push(s);
  });

  const completionsByStep = new Map<string, StepCompletion[]>();
  completions.forEach(c => {
    if (!completionsByStep.has(c.install_step_id)) completionsByStep.set(c.install_step_id, []);
    completionsByStep.get(c.install_step_id)!.push(c);
  });

  // Derive step types from unique step names/categories
  const stepTypes = Array.from(
    new Set(steps.map(s => s.category || s.step_name).filter(Boolean))
  ).sort();

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(20,184,166,0.2)', borderTopColor: '#14b8a6', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ color: '#94a3b8', fontSize: 13 }}>Loading work breakdown…</div>
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: 24, color: '#fca5a5', fontSize: 13 }}>{error}</div>;
  }

  if (plans.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        No work breakdown yet. Add install plans in the Work Breakdown tab.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif' }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'matrix', label: '⊞ Matrix' },
          { key: 'schedule-slide', label: '📅 Schedule Slide' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveSubTab(key as typeof activeSubTab)}
            style={{
              padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: activeSubTab === key ? 'rgba(20,184,166,0.2)' : 'transparent',
              color: activeSubTab === key ? '#5eead4' : '#94a3b8',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeSubTab === 'matrix' && (
        <div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            {Object.entries(STATUS_STYLE).map(([key, s]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: s.bg, border: `1px solid ${s.border}` }} />
                <span style={{ fontSize: 10, color: '#64748b' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {stepTypes.length === 0 ? (
            <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>No steps defined yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '3px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', minWidth: 120, whiteSpace: 'nowrap' }}>
                      Step / Area →
                    </th>
                    {plans.map(plan => (
                      <th key={plan.install_plan_id} style={{
                        padding: '6px 8px', textAlign: 'center',
                        fontSize: 10, fontWeight: 700, color: '#94a3b8',
                        minWidth: 90, maxWidth: 110,
                      }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {plan.location}
                        </div>
                        <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, marginTop: 1 }}>
                          {plan.system_type}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stepTypes.map(stepType => (
                    <tr key={stepType}>
                      <td style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                        {stepType}
                      </td>
                      {plans.map(plan => {
                        const cell = cellStatus(plan.install_plan_id, stepType, stepsByPlan, completionsByStep);
                        const s = STATUS_STYLE[cell.status];
                        return (
                          <td key={plan.install_plan_id} style={{ padding: 3 }}>
                            <button
                              onClick={() => setSelectedCell({ plan, stepType })}
                              style={{
                                width: '100%',
                                minHeight: 46,
                                borderRadius: 8,
                                background: s.bg,
                                border: `1px solid ${s.border}`,
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                padding: '4px 6px',
                              }}
                              title={`${plan.location} — ${stepType}: ${cell.done}/${cell.total}`}
                            >
                              {cell.total > 0 ? (
                                <>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: s.text }}>
                                    {cell.done}/{cell.total}
                                  </span>
                                  <div style={{ width: '80%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${cell.total > 0 ? (cell.done / cell.total) * 100 : 0}%`,
                                      background: s.text,
                                      borderRadius: 2,
                                    }} />
                                  </div>
                                </>
                              ) : (
                                <span style={{ fontSize: 9, color: '#475569' }}>—</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'schedule-slide' && (
        <ScheduleSlide steps={steps} completionsByStep={completionsByStep} />
      )}

      {selectedCell && (
        <CellDetail
          plan={selectedCell.plan}
          stepType={selectedCell.stepType}
          steps={stepsByPlan.get(selectedCell.plan.install_plan_id) || []}
          completionsByStep={completionsByStep}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </div>
  );
}
