'use client';
import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InstallPlan {
  install_plan_id: string;
  job_id: string;
  system_type: string;
  location: string;
  estimated_total_hours: number;
  estimated_qty: number;
  status: string;
}

interface InstallStep {
  install_step_id: string;
  install_plan_id: string;
  step_seq: number;
  step_name: string;
  allotted_hours: number;
  acceptance_criteria: string;
  required_photo_yn: string;
}

interface StepCompletion {
  step_completion_id: string;
  install_step_id: string;
  mark_id: string;
  date: string;
  crew_lead: string;
  hours_spent: number;
  percent_complete: number;
  notes: string;
  photo_urls: string;
}

// ─── Step Templates ────────────────────────────────────────────────────────────

const STEP_TEMPLATES: Record<string, { name: string; hours: number }[]> = {
  'Sliding Door': [
    { name: 'Remove existing door', hours: 0.5 },
    { name: 'Install track', hours: 1.0 },
    { name: 'Set panels', hours: 1.0 },
    { name: 'Seal frame', hours: 0.5 },
    { name: 'Install weatherstrip', hours: 0.5 },
    { name: 'QA / Final check', hours: 0.25 },
  ],
  'Storefront': [
    { name: 'Layout and snap lines', hours: 0.5 },
    { name: 'Install frame', hours: 2.0 },
    { name: 'Set glass', hours: 1.5 },
    { name: 'Seal', hours: 0.75 },
    { name: 'Install hardware', hours: 0.5 },
    { name: 'QA / Final check', hours: 0.25 },
  ],
  'IGU Replacement': [
    { name: 'Remove existing IGU', hours: 0.5 },
    { name: 'Clean opening', hours: 0.25 },
    { name: 'Install new IGU', hours: 0.75 },
    { name: 'Seal', hours: 0.5 },
    { name: 'QA / Final check', hours: 0.25 },
  ],
  'Mirror': [
    { name: 'Measure and mark wall', hours: 0.25 },
    { name: 'Cut mirror to size', hours: 0.5 },
    { name: 'Install mirror', hours: 0.75 },
    { name: 'Clean and inspect', hours: 0.25 },
  ],
  'Shower Enclosure': [
    { name: 'Template and measure', hours: 0.75 },
    { name: 'Install track and channels', hours: 1.0 },
    { name: 'Set glass panels', hours: 1.5 },
    { name: 'Install hardware', hours: 0.5 },
    { name: 'Seal', hours: 0.5 },
    { name: 'QA / Final check', hours: 0.25 },
  ],
  'Curtainwall': [
    { name: 'Anchor installation', hours: 1.5 },
    { name: 'Frame assembly', hours: 2.0 },
    { name: 'Set glass', hours: 2.0 },
    { name: 'Install pressure plate', hours: 1.0 },
    { name: 'Install cap', hours: 0.75 },
    { name: 'Seal', hours: 1.0 },
    { name: 'QA / Final check', hours: 0.5 },
  ],
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface WorkBreakdownProps {
  jobId: string;
  jobType: 'wo' | 'project';
  quotedHours?: number;
  readOnly?: boolean;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#94a3b8',
  marginBottom: 4, display: 'block',
};

const INP: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 13, color: '#0f172a', outline: 'none',
  boxSizing: 'border-box',
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, Math.max(0, pct))}%`,
        background: pct >= 100 ? '#15803d' : '#14b8a6',
        borderRadius: 2,
        transition: 'width 0.3s',
      }} />
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'not_started' | 'in_progress' | 'complete' }) {
  const configs = {
    not_started: { color: '#cbd5e1', label: 'Not Started' },
    in_progress:  { color: '#f59e0b', label: 'In Progress' },
    complete:     { color: '#15803d', label: 'Complete' },
  };
  const c = configs[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: c.color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

// ─── Hours display ────────────────────────────────────────────────────────────

function HoursDelta({ quoted, planned, actual }: { quoted?: number; planned: number; actual: number }) {
  const overPlanned = actual > planned && planned > 0;
  const underPlanned = actual <= planned || planned === 0;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {quoted !== undefined && quoted > 0 && (
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
          {quoted}h quoted
        </span>
      )}
      <span style={{ fontSize: 10, color: '#475569', fontWeight: 700 }}>
        {planned.toFixed(1)}h planned
      </span>
      {actual > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 800,
          color: overPlanned ? '#dc2626' : '#15803d',
          background: overPlanned ? 'rgba(220,38,38,0.08)' : 'rgba(21,128,61,0.08)',
          padding: '1px 6px', borderRadius: 4,
        }}>
          {actual.toFixed(1)}h actual
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkBreakdown({ jobId, jobType, quotedHours, readOnly = false }: WorkBreakdownProps) {
  const [plans, setPlans] = useState<InstallPlan[]>([]);
  const [steps, setSteps] = useState<InstallStep[]>([]);
  const [completions, setCompletions] = useState<StepCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI state
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set());
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [expandedMarks, setExpandedMarks] = useState<Set<string>>(new Set());

  // Add forms
  const [showAddScope, setShowAddScope] = useState(false);
  const [addingStepToPlan, setAddingStepToPlan] = useState<string | null>(null);
  const [showTemplateFor, setShowTemplateFor] = useState<string | null>(null);

  // Form state
  const [scopeForm, setScopeForm] = useState({ system_type: '', location: '', estimated_total_hours: '', estimated_qty: '1' });
  const [stepForm, setStepForm] = useState({ step_name: '', allotted_hours: '', acceptance_criteria: '', required_photo_yn: 'N' });

  // Saving state
  const [savingNote, setSavingNote] = useState<string | null>(null);

  // ─── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/work-breakdown/${jobId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPlans(data.plans || []);
      setSteps(data.steps || []);
      setCompletions(data.completions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Auto-expand for simple WOs ─────────────────────────────────────────────
  useEffect(() => {
    if (plans.length === 1) {
      setExpandedScopes(new Set([plans[0].install_plan_id]));
    }
  }, [plans]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function getStepsForPlan(planId: string) {
    return steps.filter(s => s.install_plan_id === planId).sort((a, b) => a.step_seq - b.step_seq);
  }

  function getCompletionsForStep(stepId: string) {
    return completions.filter(c => c.install_step_id === stepId);
  }

  function getActualHoursForPlan(planId: string) {
    const planSteps = getStepsForPlan(planId);
    return planSteps.reduce((sum, s) => {
      const comps = getCompletionsForStep(s.install_step_id);
      return sum + comps.reduce((cs, c) => cs + c.hours_spent, 0);
    }, 0);
  }

  function getPlannedHoursForPlan(planId: string) {
    return getStepsForPlan(planId).reduce((sum, s) => sum + s.allotted_hours, 0);
  }

  function getCompletedStepsForPlan(planId: string) {
    const planSteps = getStepsForPlan(planId);
    return planSteps.filter(s => {
      const comps = getCompletionsForStep(s.install_step_id);
      return comps.some(c => c.percent_complete >= 100);
    }).length;
  }

  function getMarkStatus(markId: string, stepIds: string[]): 'not_started' | 'in_progress' | 'complete' {
    const markCompletions = completions.filter(c => c.mark_id === markId && stepIds.includes(c.install_step_id));
    if (markCompletions.length === 0) return 'not_started';
    const allComplete = markCompletions.every(c => c.percent_complete >= 100);
    if (allComplete && markCompletions.length === stepIds.length) return 'complete';
    return 'in_progress';
  }

  function getStepStatus(stepId: string, markId: string): 'not_started' | 'in_progress' | 'complete' {
    const comp = completions.find(c => c.install_step_id === stepId && c.mark_id === markId);
    if (!comp) return 'not_started';
    if (comp.percent_complete >= 100) return 'complete';
    if (comp.percent_complete > 0) return 'in_progress';
    return 'not_started';
  }

  // Auto-detect simple vs complex
  const isSimple = plans.length <= 1 && plans[0]?.estimated_qty <= 1;

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleAddScope() {
    if (!scopeForm.system_type || !scopeForm.location) return;
    try {
      const res = await fetch(`/api/work-breakdown/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'plan',
          system_type: scopeForm.system_type,
          location: scopeForm.location,
          estimated_total_hours: parseFloat(scopeForm.estimated_total_hours) || 0,
          estimated_qty: parseInt(scopeForm.estimated_qty) || 1,
        }),
      });
      if (!res.ok) throw new Error();
      setScopeForm({ system_type: '', location: '', estimated_total_hours: '', estimated_qty: '1' });
      setShowAddScope(false);
      await loadData();
    } catch {
      alert('Failed to add scope');
    }
  }

  async function handleAddStep(planId: string) {
    if (!stepForm.step_name) return;
    const planSteps = getStepsForPlan(planId);
    const nextSeq = planSteps.length + 1;
    try {
      const res = await fetch(`/api/work-breakdown/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'step',
          install_plan_id: planId,
          step_seq: nextSeq,
          step_name: stepForm.step_name,
          allotted_hours: parseFloat(stepForm.allotted_hours) || 0,
          acceptance_criteria: stepForm.acceptance_criteria,
          required_photo_yn: stepForm.required_photo_yn,
        }),
      });
      if (!res.ok) throw new Error();
      setStepForm({ step_name: '', allotted_hours: '', acceptance_criteria: '', required_photo_yn: 'N' });
      setAddingStepToPlan(null);
      await loadData();
    } catch {
      alert('Failed to add step');
    }
  }

  async function handleApplyTemplate(planId: string, templateName: string) {
    const template = STEP_TEMPLATES[templateName];
    if (!template) return;
    const planSteps = getStepsForPlan(planId);
    const startSeq = planSteps.length + 1;

    try {
      for (let i = 0; i < template.length; i++) {
        await fetch(`/api/work-breakdown/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'step',
            install_plan_id: planId,
            step_seq: startSeq + i,
            step_name: template[i].name,
            allotted_hours: template[i].hours,
            acceptance_criteria: '',
            required_photo_yn: 'N',
          }),
        });
      }
      setShowTemplateFor(null);
      await loadData();
    } catch {
      alert('Failed to apply template');
    }
  }

  async function handleToggleStep(stepId: string, markId: string, currentStatus: string) {
    if (readOnly) return;
    setSavingNote(stepId + markId);
    const isComplete = currentStatus === 'complete';
    const existing = completions.find(c => c.install_step_id === stepId && c.mark_id === markId);

    try {
      if (existing) {
        await fetch(`/api/work-breakdown/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'completion',
            id: existing.step_completion_id,
            percent_complete: isComplete ? 0 : 100,
          }),
        });
      } else {
        const step = steps.find(s => s.install_step_id === stepId);
        await fetch(`/api/work-breakdown/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'completion',
            install_step_id: stepId,
            mark_id: markId,
            date: new Date().toISOString().split('T')[0],
            crew_lead: '',
            hours_spent: step?.allotted_hours || 0,
            percent_complete: 100,
            notes: '',
            photo_urls: '',
          }),
        });
      }
      await loadData();
    } catch {
      // silently fail
    } finally {
      setSavingNote(null);
    }
  }

  async function handleSaveNote(stepId: string, markId: string, notes: string) {
    const existing = completions.find(c => c.install_step_id === stepId && c.mark_id === markId);
    if (!existing) return;
    setSavingNote(stepId + markId + 'note');
    try {
      await fetch(`/api/work-breakdown/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'completion',
          id: existing.step_completion_id,
          notes,
        }),
      });
      await loadData();
    } finally {
      setSavingNote(null);
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm('Remove this step?')) return;
    await fetch(`/api/work-breakdown/${jobId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'step', id: stepId }),
    });
    await loadData();
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  function renderStepRow(step: InstallStep, markId: string) {
    const status = getStepStatus(step.install_step_id, markId);
    const completion = completions.find(c => c.install_step_id === step.install_step_id && c.mark_id === markId);
    const isSaving = savingNote === step.install_step_id + markId;

    return (
      <div key={step.install_step_id + markId} style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '10px 12px',
        background: status === 'complete' ? 'rgba(21,128,61,0.04)' : 'white',
        borderRadius: 8,
        border: '1px solid',
        borderColor: status === 'complete' ? 'rgba(21,128,61,0.15)' : '#f1f5f9',
        opacity: isSaving ? 0.6 : 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Big checkbox — 44px touch target */}
          {!readOnly && (
            <button
              onClick={() => handleToggleStep(step.install_step_id, markId, status)}
              disabled={!!savingNote}
              style={{
                width: 44, height: 44, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: status === 'complete' ? '#15803d' : 'white',
                border: `2px solid ${status === 'complete' ? '#15803d' : '#cbd5e1'}`,
                borderRadius: 10, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              aria-label={status === 'complete' ? 'Mark incomplete' : 'Mark complete'}
            >
              {status === 'complete' && (
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: status === 'complete' ? '#64748b' : '#0f172a',
                textDecoration: status === 'complete' ? 'line-through' : 'none',
              }}>
                {step.step_name}
              </span>
              {step.allotted_hours > 0 && (
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                  {step.allotted_hours}h
                </span>
              )}
              {step.required_photo_yn === 'Y' && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#eff6ff', color: '#0369a1', border: '1px solid #bfdbfe' }}>
                  PHOTO
                </span>
              )}
            </div>
            {step.acceptance_criteria && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{step.acceptance_criteria}</div>
            )}
          </div>

          {!readOnly && (
            <button
              onClick={() => handleDeleteStep(step.install_step_id)}
              style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 16, padding: '4px 6px', lineHeight: 1 }}
              title="Remove step"
            >
              ×
            </button>
          )}
        </div>

        {/* Notes field (only if step has a completion record) */}
        {completion && !readOnly && (
          <NoteField
            value={completion.notes}
            onSave={(notes) => handleSaveNote(step.install_step_id, markId, notes)}
          />
        )}
      </div>
    );
  }

  function renderMarkTree(plan: InstallPlan) {
    const planSteps = getStepsForPlan(plan.install_plan_id);
    const stepIds = planSteps.map(s => s.install_step_id);
    const markCount = plan.estimated_qty;
    const marks = Array.from({ length: markCount }, (_, i) => {
      const prefix = plan.system_type.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
      return { id: `${prefix}-${i + 1}`, label: `${prefix}-${i + 1}` };
    });

    return marks.map(mark => {
      const markStatus = getMarkStatus(mark.id, stepIds);
      const markKey = plan.install_plan_id + mark.id;
      const isExpanded = expandedMarks.has(markKey);

      return (
        <div key={mark.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: 'white' }}>
          {/* Mark header */}
          <button
            onClick={() => setExpandedMarks(prev => {
              const n = new Set(prev);
              if (n.has(markKey)) n.delete(markKey); else n.add(markKey);
              return n;
            })}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 11, color: '#94a3b8', width: 14, flexShrink: 0 }}>
              {isExpanded ? '▼' : '▶'}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', flex: 1 }}>
              {mark.label}
            </span>
            <StatusDot status={markStatus} />
          </button>

          {/* Steps */}
          {isExpanded && (
            <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {planSteps.length === 0 ? (
                <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No steps yet.</div>
              ) : (
                planSteps.map(step => renderStepRow(step, mark.id))
              )}
            </div>
          )}
        </div>
      );
    });
  }

  // ─── Flat step list (simple WO mode) ─────────────────────────────────────────

  function renderFlatSteps(plan: InstallPlan) {
    const planSteps = getStepsForPlan(plan.install_plan_id);
    const markId = `${plan.job_id}-default`;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {planSteps.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>
            No steps yet. Add steps or apply a template.
          </div>
        ) : (
          planSteps.map(step => renderStepRow(step, markId))
        )}
      </div>
    );
  }

  // ─── Scope row ────────────────────────────────────────────────────────────────

  function renderScopeRow(plan: InstallPlan) {
    const planSteps = getStepsForPlan(plan.install_plan_id);
    const plannedHours = getPlannedHoursForPlan(plan.install_plan_id);
    const actualHours = getActualHoursForPlan(plan.install_plan_id);
    const completedSteps = getCompletedStepsForPlan(plan.install_plan_id);
    const totalSteps = planSteps.length;
    const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const isExpanded = expandedScopes.has(plan.install_plan_id);
    const isAddingStep = addingStepToPlan === plan.install_plan_id;
    const isShowingTemplate = showTemplateFor === plan.install_plan_id;

    return (
      <div key={plan.install_plan_id} style={{
        border: '1px solid #e2e8f0', borderRadius: 14,
        overflow: 'hidden', background: 'white',
        boxShadow: isExpanded ? '0 2px 12px rgba(15,23,42,0.06)' : 'none',
      }}>
        {/* Scope header */}
        <button
          onClick={() => setExpandedScopes(prev => {
            const n = new Set(prev);
            if (n.has(plan.install_plan_id)) n.delete(plan.install_plan_id); else n.add(plan.install_plan_id);
            return n;
          })}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', background: isExpanded ? 'rgba(240,253,250,0.6)' : 'white',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
          }}
        >
          <span style={{ fontSize: 12, color: '#94a3b8', width: 16, flexShrink: 0 }}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                {plan.system_type || 'Unnamed Scope'}
              </span>
              {plan.location && (
                <span style={{ fontSize: 11, color: '#64748b' }}>{plan.location}</span>
              )}
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '2px 8px', borderRadius: 999,
                background: pct === 100 ? 'rgba(21,128,61,0.1)' : 'rgba(15,118,110,0.08)',
                color: pct === 100 ? '#15803d' : '#0f766e',
                border: `1px solid ${pct === 100 ? 'rgba(21,128,61,0.2)' : 'rgba(15,118,110,0.15)'}`,
              }}>
                {completedSteps}/{totalSteps} steps
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <ProgressBar pct={pct} />
              <HoursDelta quoted={quotedHours} planned={plannedHours} actual={actualHours} />
            </div>
          </div>
        </button>

        {/* Scope body */}
        {isExpanded && (
          <div style={{ padding: '14px 16px' }}>
            {/* Simple mode: flat step list */}
            {isSimple ? (
              renderFlatSteps(plan)
            ) : (
              /* Complex mode: area > mark > steps */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Areas — group by location (just using the plan's single location for now) */}
                <div style={{ border: '1px solid #f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{plan.location || 'Default Area'}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{plan.estimated_qty} mark{plan.estimated_qty !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {renderMarkTree(plan)}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            {!readOnly && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setAddingStepToPlan(isAddingStep ? null : plan.install_plan_id); setShowTemplateFor(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: isAddingStep ? '#0f766e' : 'white',
                    color: isAddingStep ? 'white' : '#0f766e',
                    border: '1px solid rgba(15,118,110,0.3)',
                  }}
                >
                  {isAddingStep ? '— Cancel' : '+ Add Step'}
                </button>
                <button
                  onClick={() => { setShowTemplateFor(isShowingTemplate ? null : plan.install_plan_id); setAddingStepToPlan(null); }}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: isShowingTemplate ? '#0369a1' : 'white',
                    color: isShowingTemplate ? 'white' : '#0369a1',
                    border: '1px solid rgba(3,105,161,0.3)',
                  }}
                >
                  Apply Template
                </button>
              </div>
            )}

            {/* Add Step form */}
            {isAddingStep && !readOnly && (
              <div style={{ marginTop: 10, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                  <div>
                    <label style={LBL}>Step Name</label>
                    <input
                      style={INP}
                      value={stepForm.step_name}
                      onChange={e => setStepForm(f => ({ ...f, step_name: e.target.value }))}
                      placeholder="e.g. Install frame"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleAddStep(plan.install_plan_id); }}
                    />
                  </div>
                  <div>
                    <label style={LBL}>Hours</label>
                    <input
                      style={{ ...INP, width: 80 }}
                      type="number"
                      value={stepForm.allotted_hours}
                      onChange={e => setStepForm(f => ({ ...f, allotted_hours: e.target.value }))}
                      placeholder="0"
                      min="0"
                      step="0.25"
                    />
                  </div>
                </div>
                <div>
                  <label style={LBL}>Acceptance Criteria (optional)</label>
                  <input
                    style={INP}
                    value={stepForm.acceptance_criteria}
                    onChange={e => setStepForm(f => ({ ...f, acceptance_criteria: e.target.value }))}
                    placeholder="How do we know it's done?"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ ...LBL, margin: 0, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={stepForm.required_photo_yn === 'Y'}
                      onChange={e => setStepForm(f => ({ ...f, required_photo_yn: e.target.checked ? 'Y' : 'N' }))}
                    />
                    Requires Photo
                  </label>
                  <button
                    onClick={() => handleAddStep(plan.install_plan_id)}
                    disabled={!stepForm.step_name}
                    style={{
                      marginLeft: 'auto',
                      padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: stepForm.step_name ? 'pointer' : 'default',
                      background: stepForm.step_name ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                      color: stepForm.step_name ? 'white' : '#94a3b8',
                      border: 'none',
                    }}
                  >
                    Add Step
                  </button>
                </div>
              </div>
            )}

            {/* Template picker */}
            {isShowingTemplate && !readOnly && (
              <div style={{ marginTop: 10, padding: 14, background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Choose Template
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {Object.keys(STEP_TEMPLATES).map(name => (
                    <button
                      key={name}
                      onClick={() => handleApplyTemplate(plan.install_plan_id, name)}
                      style={{
                        padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        background: 'white', color: '#0369a1',
                        border: '1px solid #bfdbfe',
                        transition: 'all 0.1s',
                      }}
                    >
                      {name}
                      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 5 }}>
                        ({STEP_TEMPLATES[name].length} steps)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading work breakdown…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '16px', background: '#fef2f2', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c' }}>
        Failed to load: {error}
        <button onClick={loadData} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Retry</button>
      </div>
    );
  }

  const totalPlannedHours = plans.reduce((sum, p) => sum + getPlannedHoursForPlan(p.install_plan_id), 0);
  const totalActualHours = plans.reduce((sum, p) => sum + getActualHoursForPlan(p.install_plan_id), 0);
  const totalCompletedSteps = plans.reduce((sum, p) => sum + getCompletedStepsForPlan(p.install_plan_id), 0);
  const totalSteps = steps.length;
  const overallPct = totalSteps > 0 ? Math.round((totalCompletedSteps / totalSteps) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary bar */}
      {plans.length > 0 && (
        <div style={{
          padding: '12px 16px', background: 'white', borderRadius: 12,
          border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Overall Progress
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: overallPct === 100 ? '#15803d' : '#0f172a' }}>
                {overallPct}%
              </span>
            </div>
            <ProgressBar pct={overallPct} />
          </div>
          <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
            {quotedHours !== undefined && quotedHours > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quoted</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{quotedHours}h</div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Planned</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{totalPlannedHours.toFixed(1)}h</div>
            </div>
            {totalActualHours > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actual</div>
                <div style={{
                  fontSize: 16, fontWeight: 800,
                  color: totalActualHours > totalPlannedHours ? '#dc2626' : '#15803d',
                }}>
                  {totalActualHours.toFixed(1)}h
                </div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Steps</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{totalCompletedSteps}/{totalSteps}</div>
            </div>
          </div>
        </div>
      )}

      {/* Scopes */}
      {plans.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', background: 'white', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            No work breakdown defined yet.
            {!readOnly && ' Add a scope to get started.'}
          </div>
          {!readOnly && (
            <button
              onClick={() => setShowAddScope(true)}
              style={{ padding: '9px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              + Add Scope
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map(plan => renderScopeRow(plan))}
        </div>
      )}

      {/* Add Scope button (when there are already scopes) */}
      {!readOnly && plans.length > 0 && (
        <button
          onClick={() => setShowAddScope(p => !p)}
          style={{
            width: '100%', padding: '10px 16px', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: showAddScope ? '#0f172a' : 'white',
            color: showAddScope ? 'white' : '#0f172a',
            border: '1px dashed #e2e8f0',
            textAlign: 'center',
          }}
        >
          {showAddScope ? '— Cancel' : '+ Add Scope / System'}
        </button>
      )}

      {/* Add Scope form */}
      {showAddScope && !readOnly && (
        <div style={{ padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            New Scope
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LBL}>System Type</label>
              <input
                style={INP}
                value={scopeForm.system_type}
                onChange={e => setScopeForm(f => ({ ...f, system_type: e.target.value }))}
                placeholder="e.g. Sliding Glass Door"
                list="system-types"
                autoFocus
              />
              <datalist id="system-types">
                {Object.keys(STEP_TEMPLATES).map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div>
              <label style={LBL}>Location / Area</label>
              <input
                style={INP}
                value={scopeForm.location}
                onChange={e => setScopeForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Master Bedroom"
              />
            </div>
            <div>
              <label style={LBL}>Est. Total Hours</label>
              <input
                style={INP}
                type="number"
                value={scopeForm.estimated_total_hours}
                onChange={e => setScopeForm(f => ({ ...f, estimated_total_hours: e.target.value }))}
                placeholder="0"
                min="0"
                step="0.5"
              />
            </div>
            <div>
              <label style={LBL}>Number of Marks / Units</label>
              <input
                style={INP}
                type="number"
                value={scopeForm.estimated_qty}
                onChange={e => setScopeForm(f => ({ ...f, estimated_qty: e.target.value }))}
                placeholder="1"
                min="1"
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleAddScope}
              disabled={!scopeForm.system_type || !scopeForm.location}
              style={{
                padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer',
                background: scopeForm.system_type && scopeForm.location ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : '#e2e8f0',
                color: scopeForm.system_type && scopeForm.location ? 'white' : '#94a3b8',
              }}
            >
              Create Scope
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Note Field (inline) ──────────────────────────────────────────────────────

function NoteField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  return (
    <textarea
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (draft !== value) onSave(draft); }}
      placeholder="Field notes…"
      rows={focused ? 3 : 1}
      style={{
        width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 11,
        border: `1px solid ${focused ? '#14b8a6' : '#e2e8f0'}`,
        background: '#f8fafc', color: '#475569', resize: 'none',
        outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        transition: 'border-color 0.15s',
      }}
    />
  );
}
