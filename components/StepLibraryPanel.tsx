'use client';
import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  id: string; // local uuid for react key
  step_seq: number;
  step_name: string;
  default_hours: number;
  category: string;
  notes: string;
}

interface Template {
  name: string;
  steps: Step[];
}

const CATEGORIES = [
  'Mobilization',
  'Delivery',
  'Material Handling',
  'Spotting',
  'Installation',
  'Demobilization',
  'QA/Punch',
  'Admin/Paperwork',
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function totalHours(steps: Step[]) {
  return steps.reduce((sum, s) => sum + (s.default_hours || 0), 0);
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: type === 'success' ? 'rgba(20,184,166,0.95)' : 'rgba(239,68,68,0.95)',
      color: '#fff', padding: '12px 20px', borderRadius: 10,
      fontSize: 14, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      animation: 'slideUp 0.2s ease',
    }}>
      {message}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StepLibraryPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [search, setSearch] = useState('');

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/step-templates');
      const data = await res.json();
      if (data.templates) {
        const parsed: Template[] = Object.entries(data.templates).map(([name, steps]) => ({
          name,
          steps: (steps as { step_seq: number; step_name: string; default_hours: number; category: string; notes: string }[]).map(s => ({
            id: uid(),
            step_seq: s.step_seq,
            step_name: s.step_name,
            default_hours: s.default_hours,
            category: s.category,
            notes: s.notes,
          })),
        }));
        setTemplates(parsed);
        if (!selectedName && parsed.length > 0) setSelectedName(parsed[0].name);
      }
    } catch {
      showToast('Failed to load templates', 'error');
    }
    setLoading(false);
  }, [selectedName]);

  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selected template ─────────────────────────────────────────────────────
  const selected = templates.find(t => t.name === selectedName) || null;

  function updateSelected(fn: (t: Template) => Template) {
    setTemplates(prev => prev.map(t => t.name === selectedName ? fn(t) : t));
  }

  // ── New template ──────────────────────────────────────────────────────────
  async function handleNewTemplate() {
    const name = `New Template ${templates.length + 1}`;
    setSaving(true);
    try {
      const res = await fetch('/api/step-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: name, steps: [] }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Failed to create template', 'error');
        return;
      }
      const newT: Template = { name, steps: [] };
      setTemplates(prev => [...prev, newT]);
      setSelectedName(name);
      showToast('Template created');
    } catch {
      showToast('Failed to create template', 'error');
    }
    setSaving(false);
  }

  // ── Save steps ────────────────────────────────────────────────────────────
  async function handleSaveSteps(t: Template) {
    setSaving(true);
    try {
      const res = await fetch('/api/step-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: t.name,
          steps: t.steps.map((s, i) => ({
            step_seq: i + 1,
            step_name: s.step_name,
            default_hours: s.default_hours,
            category: s.category,
            notes: s.notes,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      showToast('Saved!');
    } catch {
      showToast('Save failed', 'error');
    }
    setSaving(false);
  }

  // ── Rename template ───────────────────────────────────────────────────────
  async function handleRename() {
    if (!selected || pendingName === selected.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/step-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: selected.name, new_name: pendingName }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Rename failed', 'error');
        setSaving(false);
        return;
      }
      setTemplates(prev => prev.map(t => t.name === selected.name ? { ...t, name: pendingName } : t));
      setSelectedName(pendingName);
      setEditingName(false);
      showToast('Renamed!');
    } catch {
      showToast('Rename failed', 'error');
    }
    setSaving(false);
  }

  // ── Delete template ───────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Delete template "${selected.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await fetch('/api/step-templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: selected.name }),
      });
      const remaining = templates.filter(t => t.name !== selected.name);
      setTemplates(remaining);
      setSelectedName(remaining[0]?.name || null);
      showToast('Template deleted');
    } catch {
      showToast('Delete failed', 'error');
    }
    setSaving(false);
  }

  // ── Duplicate template ────────────────────────────────────────────────────
  async function handleDuplicate() {
    if (!selected) return;
    const newName = `${selected.name} (Copy)`;
    setSaving(true);
    try {
      const res = await fetch('/api/step-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: newName,
          steps: selected.steps.map((s, i) => ({
            step_seq: i + 1,
            step_name: s.step_name,
            default_hours: s.default_hours,
            category: s.category,
            notes: s.notes,
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Duplicate failed', 'error');
        setSaving(false);
        return;
      }
      const duped: Template = { name: newName, steps: selected.steps.map(s => ({ ...s, id: uid() })) };
      setTemplates(prev => [...prev, duped]);
      setSelectedName(newName);
      showToast('Template duplicated');
    } catch {
      showToast('Duplicate failed', 'error');
    }
    setSaving(false);
  }

  // ── Step operations ───────────────────────────────────────────────────────
  function handleAddStep() {
    updateSelected(t => ({
      ...t,
      steps: [...t.steps, { id: uid(), step_seq: t.steps.length + 1, step_name: '', default_hours: 0, category: 'Installation', notes: '' }],
    }));
  }

  function handleDeleteStep(id: string) {
    updateSelected(t => ({ ...t, steps: t.steps.filter(s => s.id !== id) }));
  }

  function handleStepChange(id: string, field: keyof Step, value: string | number) {
    updateSelected(t => ({
      ...t,
      steps: t.steps.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));
  }

  function moveStep(id: string, dir: -1 | 1) {
    updateSelected(t => {
      const idx = t.steps.findIndex(s => s.id === id);
      if (idx < 0) return t;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= t.steps.length) return t;
      const steps = [...t.steps];
      [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
      return { ...t, steps };
    });
  }

  // ── Filtered sidebar ──────────────────────────────────────────────────────
  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#0c1a26', fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
    }}>
      {toast && <Toast {...toast} />}

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <div style={{
        width: 280, minWidth: 280, flexShrink: 0,
        background: '#0d1f2d', borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(20,184,166,0.5)', marginBottom: 2 }}>Operations</div>
              <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>Step Library</h1>
            </div>
            <button
              onClick={handleNewTemplate}
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, rgba(20,184,166,0.25) 0%, rgba(13,148,136,0.15) 100%)',
                border: '1px solid rgba(20,184,166,0.4)',
                borderRadius: 8, padding: '6px 12px',
                color: '#14b8a6', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              + New
            </button>
          </div>
          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Template list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {loading ? (
            <div style={{ color: 'rgba(148,163,184,0.5)', fontSize: 13, textAlign: 'center', paddingTop: 32 }}>Loading…</div>
          ) : filteredTemplates.length === 0 ? (
            <div style={{ color: 'rgba(148,163,184,0.4)', fontSize: 13, textAlign: 'center', paddingTop: 32 }}>No templates found</div>
          ) : (
            filteredTemplates.map(t => {
              const isActive = t.name === selectedName;
              const hrs = totalHours(t.steps);
              return (
                <button
                  key={t.name}
                  onClick={() => setSelectedName(t.name)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(20,184,166,0.18) 0%, rgba(13,148,136,0.08) 100%)'
                      : 'transparent',
                    border: isActive ? '1px solid rgba(20,184,166,0.35)' : '1px solid transparent',
                    borderRadius: 10, padding: '10px 12px', marginBottom: 4,
                    cursor: 'pointer', transition: 'all 0.12s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? '#14b8a6' : '#cbd5e1', letterSpacing: '-0.01em' }}>
                      {t.name}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                      background: isActive ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.07)',
                      color: isActive ? '#14b8a6' : 'rgba(148,163,184,0.6)',
                    }}>
                      {t.steps.length}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: isActive ? 'rgba(20,184,166,0.7)' : 'rgba(148,163,184,0.4)' }}>
                    {hrs.toFixed(1)} hrs total
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Editor ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(148,163,184,0.4)', fontSize: 15 }}>
            {loading ? 'Loading templates…' : 'Select a template or create a new one'}
          </div>
        ) : (
          <>
            {/* Header bar */}
            <div style={{
              padding: '20px 28px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'linear-gradient(180deg, #071722 0%, #0c2330 100%)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                {/* Template name (editable) */}
                <div>
                  {editingName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        autoFocus
                        value={pendingName}
                        onChange={e => setPendingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false); }}
                        style={{
                          fontSize: 22, fontWeight: 800, background: 'rgba(255,255,255,0.07)',
                          border: '1px solid rgba(20,184,166,0.5)', borderRadius: 8,
                          padding: '4px 10px', color: '#f8fafc', outline: 'none', letterSpacing: '-0.02em',
                          minWidth: 240,
                        }}
                      />
                      <button onClick={handleRename} disabled={saving} style={btnStyle('#14b8a6')}>Save</button>
                      <button onClick={() => setEditingName(false)} style={btnStyle('rgba(148,163,184,0.6)')}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                        {selected.name}
                      </h2>
                      <button
                        onClick={() => { setPendingName(selected.name); setEditingName(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,0.4)', fontSize: 14, padding: '2px 4px' }}
                        title="Rename"
                      >
                        ✎
                      </button>
                    </div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>
                    {selected.steps.length} steps · {totalHours(selected.steps).toFixed(1)} hrs total
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={handleDuplicate} disabled={saving} style={btnStyle('rgba(148,163,184,0.5)')}>
                    Duplicate Template
                  </button>
                  <button onClick={handleDelete} disabled={saving} style={btnStyle('rgba(239,68,68,0.6)')}>
                    Delete
                  </button>
                  <button
                    onClick={() => handleSaveSteps(selected)}
                    disabled={saving}
                    style={btnStyle('#14b8a6', true)}
                  >
                    {saving ? 'Saving…' : 'Save Steps'}
                  </button>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
              {/* Column headers */}
              {selected.steps.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 90px 180px 1fr 40px 36px',
                  gap: 8, padding: '0 8px 8px',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'rgba(148,163,184,0.4)',
                }}>
                  <div />
                  <div>Step Name</div>
                  <div>Hours</div>
                  <div>Category</div>
                  <div>Notes</div>
                  <div />
                  <div />
                </div>
              )}

              {/* Step rows */}
              {selected.steps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(148,163,184,0.4)', fontSize: 14 }}>
                  No steps yet. Click "+ Add Step" to get started.
                </div>
              ) : (
                selected.steps.map((step, idx) => (
                  <div
                    key={step.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr 90px 180px 1fr 40px 36px',
                      gap: 8, alignItems: 'center',
                      background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderRadius: 8, padding: '6px 8px', marginBottom: 4,
                    }}
                  >
                    {/* Order arrows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                      <button
                        onClick={() => moveStep(step.id, -1)}
                        disabled={idx === 0}
                        style={{ background: 'none', border: 'none', color: idx === 0 ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.5)', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12, lineHeight: 1, padding: '2px 4px' }}
                      >▲</button>
                      <button
                        onClick={() => moveStep(step.id, 1)}
                        disabled={idx === selected.steps.length - 1}
                        style={{ background: 'none', border: 'none', color: idx === selected.steps.length - 1 ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.5)', cursor: idx === selected.steps.length - 1 ? 'default' : 'pointer', fontSize: 12, lineHeight: 1, padding: '2px 4px' }}
                      >▼</button>
                    </div>

                    {/* Step name */}
                    <input
                      value={step.step_name}
                      onChange={e => handleStepChange(step.id, 'step_name', e.target.value)}
                      placeholder="Step name…"
                      style={inputStyle()}
                    />

                    {/* Hours */}
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={step.default_hours}
                      onChange={e => handleStepChange(step.id, 'default_hours', parseFloat(e.target.value) || 0)}
                      style={inputStyle()}
                    />

                    {/* Category */}
                    <select
                      value={step.category}
                      onChange={e => handleStepChange(step.id, 'category', e.target.value)}
                      style={{
                        ...inputStyle(),
                        background: 'rgba(255,255,255,0.05)',
                        cursor: 'pointer',
                      }}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0d1f2d' }}>{c}</option>)}
                    </select>

                    {/* Notes */}
                    <input
                      value={step.notes}
                      onChange={e => handleStepChange(step.id, 'notes', e.target.value)}
                      placeholder="Notes…"
                      style={inputStyle()}
                    />

                    {/* Seq badge */}
                    <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(148,163,184,0.3)', fontWeight: 600 }}>
                      {idx + 1}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteStep(step.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,0.5)', fontSize: 16, lineHeight: 1, padding: '4px', borderRadius: 6, transition: 'color 0.12s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.9)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239,68,68,0.5)')}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}

              {/* Add step + auto-save row */}
              <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
                <button
                  onClick={handleAddStep}
                  style={{
                    background: 'rgba(20,184,166,0.1)', border: '1px dashed rgba(20,184,166,0.35)',
                    borderRadius: 8, padding: '9px 18px', color: '#14b8a6',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.18)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.1)')}
                >
                  + Add Step
                </button>
                <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)' }}>
                  Remember to click "Save Steps" after making changes.
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Style helpers ─────────────────────────────────────────────────────────────
function inputStyle(): React.CSSProperties {
  return {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 7, padding: '7px 10px', color: '#e2e8f0', fontSize: 13,
    outline: 'none', transition: 'border-color 0.12s',
  };
}

function btnStyle(color: string, solid = false): React.CSSProperties {
  return {
    background: solid ? `${color}` : 'transparent',
    border: `1px solid ${color}`,
    borderRadius: 8, padding: '7px 14px',
    color: solid ? '#fff' : color,
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    transition: 'all 0.12s ease',
  };
}
