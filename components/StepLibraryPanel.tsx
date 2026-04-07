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
  system_type: string;
  manufacturer: string;
  installation_type: string;
}

interface GoldDataEntry {
  system_type: string;
  step_name: string;
  step_category: string;
  avg_hours: number;
  sample_count: number;
  min_hours: number;
  max_hours: number;
  avg_allotted: number;
  avg_delta: number;
  last_updated: string;
}

interface GoldSummary {
  templates_with_data: number;
  most_accurate: { template: string; avg_abs_delta: number } | null;
  needs_review: { template: string; avg_delta: number } | null;
  last_computed: string;
  by_step: GoldDataEntry[];
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

// Common system type options (editable free-form too)
const SYSTEM_TYPE_OPTIONS = [
  '', 'Storefront', 'Curtainwall', 'Window Wall', 'IGU', 'Mirror', 'Shower',
  'Sliding Door', 'Railing', 'Automatic Entrances', 'Window',
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

// ─── Delta Badge ──────────────────────────────────────────────────────────────
function DeltaBadge({ delta }: { delta: number }) {
  const abs = Math.abs(delta);
  const sign = delta > 0 ? '+' : '-';
  const color = delta > 0 ? 'rgba(239,68,68,0.85)' : 'rgba(34,197,94,0.85)';
  const arrow = delta > 0 ? '↑' : '↓';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: delta > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
      color, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
      letterSpacing: '0.02em',
    }}>
      {arrow} {sign}{abs.toFixed(1)}h
    </span>
  );
}

// ─── Gold Data Cell ───────────────────────────────────────────────────────────
function GoldCell({ entry, defaultHours, onUpdateFromActuals }: {
  entry: GoldDataEntry | null;
  defaultHours: number;
  onUpdateFromActuals: () => void;
}) {
  if (!entry || entry.sample_count === 0) {
    return (
      <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.35)', fontStyle: 'italic' }}>
        No data yet
      </div>
    );
  }

  const delta = entry.avg_hours - defaultHours;
  const pctDelta = defaultHours > 0 ? Math.abs(delta) / defaultHours : 0;
  const significantlyOff = pctDelta > 0.2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(148,163,184,0.8)' }}>
          {entry.avg_hours.toFixed(1)}h
        </span>
        <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>
          n={entry.sample_count}
        </span>
        <DeltaBadge delta={delta} />
      </div>
      {significantlyOff && (
        <button
          onClick={onUpdateFromActuals}
          title={`Update default hours from ${defaultHours}h → ${entry.avg_hours.toFixed(1)}h`}
          style={{
            background: 'none',
            border: '1px solid rgba(148,163,184,0.2)',
            borderRadius: 5, padding: '2px 8px',
            color: 'rgba(148,163,184,0.5)', fontSize: 10, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.12s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(20,184,166,0.4)';
            e.currentTarget.style.color = '#14b8a6';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.2)';
            e.currentTarget.style.color = 'rgba(148,163,184,0.5)';
          }}
        >
          ↺ Use actuals
        </button>
      )}
    </div>
  );
}

// ─── Gold Data Summary Card ───────────────────────────────────────────────────
function GoldSummaryCard({ summary, totalTemplates, onRefresh, refreshing }: {
  summary: GoldSummary | null;
  totalTemplates: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (!summary) return null;

  const hasData = summary.templates_with_data > 0;
  const lastComputed = summary.last_computed
    ? new Date(summary.last_computed).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div style={{
      margin: '0 28px 20px',
      background: 'linear-gradient(135deg, rgba(20,184,166,0.06) 0%, rgba(13,148,136,0.03) 100%)',
      border: '1px solid rgba(20,184,166,0.15)',
      borderRadius: 12, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
    }}>
      {/* Coverage */}
      <div style={{ minWidth: 160 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(20,184,166,0.5)', marginBottom: 4 }}>
          Gold Data Coverage
        </div>
        {hasData ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
            <span style={{ color: '#14b8a6', fontWeight: 800 }}>{summary.templates_with_data}</span>
            {totalTemplates > 0 && <span style={{ color: 'rgba(148,163,184,0.5)' }}> of {totalTemplates}</span>}
            <span style={{ color: 'rgba(148,163,184,0.5)' }}> system types have actuals</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', fontStyle: 'italic' }}>No field data yet</div>
        )}
      </div>

      {/* Most accurate */}
      {summary.most_accurate && (
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(34,197,94,0.5)', marginBottom: 4 }}>
            Most Accurate
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
            <span style={{ color: 'rgba(34,197,94,0.8)' }}>{summary.most_accurate.template}</span>
            <span style={{ color: 'rgba(148,163,184,0.5)', marginLeft: 6, fontSize: 11 }}>
              ±{summary.most_accurate.avg_abs_delta.toFixed(1)}h avg
            </span>
          </div>
        </div>
      )}

      {/* Needs review */}
      {summary.needs_review && Math.abs(summary.needs_review.avg_delta) > 0.1 && (
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(239,68,68,0.5)', marginBottom: 4 }}>
            Needs Review
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
            <span style={{ color: 'rgba(239,68,68,0.8)' }}>{summary.needs_review.template}</span>
            <span style={{ color: 'rgba(148,163,184,0.5)', marginLeft: 6, fontSize: 11 }}>
              avg {summary.needs_review.avg_delta > 0 ? '+' : ''}{summary.needs_review.avg_delta.toFixed(1)}h vs estimate
            </span>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Last computed + refresh */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        {lastComputed && (
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)' }}>
            Last computed: {lastComputed}
          </div>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            background: 'rgba(20,184,166,0.1)',
            border: '1px solid rgba(20,184,166,0.25)',
            borderRadius: 7, padding: '5px 12px',
            color: refreshing ? 'rgba(148,163,184,0.4)' : '#14b8a6',
            fontSize: 11, fontWeight: 700, cursor: refreshing ? 'default' : 'pointer',
            transition: 'all 0.12s',
          }}
        >
          {refreshing ? 'Computing…' : '⟳ Refresh Gold Data'}
        </button>
      </div>
    </div>
  );
}

// ─── Metadata Badge ────────────────────────────────────────────────────────────
function MetaBadge({ label }: { label: string }) {
  if (!label) return null;
  return (
    <span style={{
      display: 'inline-block',
      background: 'rgba(20,184,166,0.1)',
      border: '1px solid rgba(20,184,166,0.2)',
      color: 'rgba(20,184,166,0.7)',
      fontSize: 10, fontWeight: 600,
      padding: '1px 7px', borderRadius: 99,
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  );
}

// ─── Metadata Field ────────────────────────────────────────────────────────────
function MetaField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options?: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.5)' }}>
        {label}
      </label>
      {options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            ...inputStyle(),
            background: 'rgba(255,255,255,0.05)',
            cursor: 'pointer',
          }}
        >
          {options.map(o => (
            <option key={o} value={o} style={{ background: '#0d1f2d' }}>{o || '— none —'}</option>
          ))}
          {/* If current value not in options, show it */}
          {value && !options.includes(value) && (
            <option value={value} style={{ background: '#0d1f2d' }}>{value}</option>
          )}
        </select>
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          style={inputStyle()}
        />
      )}
    </div>
  );
}

// ─── Filter Select ─────────────────────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      title={label}
      style={{
        flex: 1, minWidth: 0,
        background: value ? 'rgba(20,184,166,0.12)' : 'rgba(255,255,255,0.05)',
        border: value ? '1px solid rgba(20,184,166,0.35)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 7, padding: '6px 8px',
        color: value ? '#14b8a6' : 'rgba(148,163,184,0.5)',
        fontSize: 12, fontWeight: value ? 600 : 400,
        cursor: 'pointer', outline: 'none',
      }}
    >
      <option value="" style={{ background: '#0d1f2d', color: '#94a3b8' }}>{label}</option>
      {options.map(o => (
        <option key={o} value={o} style={{ background: '#0d1f2d', color: '#e2e8f0' }}>{o}</option>
      ))}
    </select>
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

  // Filter state
  const [filterSystemType, setFilterSystemType] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('');
  const [filterInstallationType, setFilterInstallationType] = useState('');

  // Gold data state
  const [goldSummary, setGoldSummary] = useState<GoldSummary | null>(null);
  const [goldLoading, setGoldLoading] = useState(false);
  const [refreshingGold, setRefreshingGold] = useState(false);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Load templates ────────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/step-templates');
      const data = await res.json();
      if (data.error) {
        console.error('Step templates API error:', data.error);
        showToast(`API error: ${data.error}`, 'error');
      } else if (data.templates) {
        const meta = data.template_meta || {};
        const parsed: Template[] = Object.entries(data.templates).map(([name, steps]) => ({
          name,
          system_type: meta[name]?.system_type || '',
          manufacturer: meta[name]?.manufacturer || '',
          installation_type: meta[name]?.installation_type || '',
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

  // ── Load gold data (read-only, from Production_Rates) ────────────────────
  const loadGoldData = useCallback(async () => {
    setGoldLoading(true);
    try {
      const res = await fetch('/api/gold-data');
      const data = await res.json();
      if (data.ok && data.summary) {
        setGoldSummary(data.summary as GoldSummary);
      }
    } catch {
      // Gold data is optional; fail silently
    }
    setGoldLoading(false);
  }, []);

  useEffect(() => { loadGoldData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh gold data (triggers computation) ──────────────────────────────
  async function handleRefreshGoldData() {
    setRefreshingGold(true);
    try {
      const res = await fetch('/api/gold-data', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        await loadGoldData();
        showToast('Gold data refreshed!');
      } else {
        showToast(data.error || 'Failed to compute gold data', 'error');
      }
    } catch {
      showToast('Failed to compute gold data', 'error');
    }
    setRefreshingGold(false);
  }

  // ── Get gold entry for a step ─────────────────────────────────────────────
  function getGoldEntry(templateName: string, stepName: string): GoldDataEntry | null {
    if (!goldSummary) return null;
    return goldSummary.by_step.find(
      e => e.system_type === templateName && e.step_name === stepName
    ) || null;
  }

  // ── Update from actuals ───────────────────────────────────────────────────
  async function handleUpdateFromActuals(step: Step, goldEntry: GoldDataEntry) {
    if (!selected) return;
    const newHours = parseFloat(goldEntry.avg_hours.toFixed(2));
    if (!confirm(`Update "${step.step_name}" default hours from ${step.default_hours}h → ${newHours}h?`)) return;

    setSaving(true);
    try {
      updateSelected(t => ({
        ...t,
        steps: t.steps.map(s => s.id === step.id ? { ...s, default_hours: newHours } : s),
      }));

      const res = await fetch('/api/gold-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_name: selected.name,
          step_name: step.step_name,
          new_default_hours: newHours,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Failed to update step hours', 'error');
      } else {
        showToast(`Updated "${step.step_name}" to ${newHours}h`);
      }
    } catch {
      showToast('Failed to update step hours', 'error');
    }
    setSaving(false);
  }

  // ── Selected template ─────────────────────────────────────────────────────
  const selected = templates.find(t => t.name === selectedName) || null;

  function updateSelected(fn: (t: Template) => Template) {
    setTemplates(prev => prev.map(t => t.name === selectedName ? fn(t) : t));
  }

  // ── Save template metadata ────────────────────────────────────────────────
  async function handleSaveMeta(field: 'system_type' | 'manufacturer' | 'installation_type', value: string) {
    if (!selected) return;
    try {
      const res = await fetch('/api/step-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: selected.name, [field]: value }),
      });
      if (!res.ok) {
        const d = await res.json();
        showToast(d.error || 'Failed to save', 'error');
      }
    } catch {
      showToast('Failed to save metadata', 'error');
    }
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
      const newT: Template = { name, steps: [], system_type: '', manufacturer: '', installation_type: '' };
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
          system_type: t.system_type,
          manufacturer: t.manufacturer,
          installation_type: t.installation_type,
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
          system_type: selected.system_type,
          manufacturer: selected.manufacturer,
          installation_type: selected.installation_type,
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
      const duped: Template = {
        name: newName,
        system_type: selected.system_type,
        manufacturer: selected.manufacturer,
        installation_type: selected.installation_type,
        steps: selected.steps.map(s => ({ ...s, id: uid() })),
      };
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

  // ── Template-level gold summary ───────────────────────────────────────────
  function templateGoldSummary(t: Template) {
    if (!goldSummary || goldSummary.by_step.length === 0) return null;
    const entries = t.steps
      .map(s => goldSummary.by_step.find(e => e.system_type === t.name && e.step_name === s.step_name))
      .filter(Boolean) as GoldDataEntry[];
    if (entries.length === 0) return null;
    const totalActual = entries.reduce((sum, e) => sum + e.avg_hours, 0);
    const totalEstimated = t.steps.reduce((sum, s) => {
      const e = goldSummary.by_step.find(e => e.system_type === t.name && e.step_name === s.step_name);
      return e ? sum + s.default_hours : sum;
    }, 0);
    return { totalActual, totalEstimated, covered: entries.length, total: t.steps.length };
  }

  // ── Unique filter options from loaded templates ────────────────────────────
  const uniqueSystemTypes = [...new Set(templates.map(t => t.system_type).filter(Boolean))].sort();
  const uniqueManufacturers = [...new Set(templates.map(t => t.manufacturer).filter(Boolean))].sort();
  const uniqueInstallationTypes = [...new Set(templates.map(t => t.installation_type).filter(Boolean))].sort();

  const hasFilters = filterSystemType || filterManufacturer || filterInstallationType;

  // ── Filtered sidebar ──────────────────────────────────────────────────────
  const filteredTemplates = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterSystemType && t.system_type !== filterSystemType) return false;
    if (filterManufacturer && t.manufacturer !== filterManufacturer) return false;
    if (filterInstallationType && t.installation_type !== filterInstallationType) return false;
    return true;
  });

  // ── Gold data for current template ────────────────────────────────────────
  const selectedGold = selected ? templateGoldSummary(selected) : null;

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
              outline: 'none', marginBottom: 8,
            }}
          />

          {/* Filter bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <FilterSelect
                label="System Type"
                value={filterSystemType}
                options={uniqueSystemTypes}
                onChange={setFilterSystemType}
              />
              <FilterSelect
                label="Manufacturer"
                value={filterManufacturer}
                options={uniqueManufacturers}
                onChange={setFilterManufacturer}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <FilterSelect
                label="Install Type"
                value={filterInstallationType}
                options={uniqueInstallationTypes}
                onChange={setFilterInstallationType}
              />
              {hasFilters && (
                <button
                  onClick={() => { setFilterSystemType(''); setFilterManufacturer(''); setFilterInstallationType(''); }}
                  style={{
                    background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 7, padding: '5px 10px',
                    color: 'rgba(239,68,68,0.6)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                  title="Clear all filters"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Filter status */}
          {hasFilters && (
            <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(20,184,166,0.5)', fontWeight: 600 }}>
              {filteredTemplates.length} of {templates.length} shown
            </div>
          )}
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
              const gs = templateGoldSummary(t);
              const hasBadges = t.manufacturer || t.installation_type;
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasBadges ? 4 : 0 }}>
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

                  {/* Metadata badges */}
                  {hasBadges && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                      {t.manufacturer && <MetaBadge label={t.manufacturer} />}
                      {t.installation_type && <MetaBadge label={t.installation_type} />}
                    </div>
                  )}

                  <div style={{ fontSize: 11, color: isActive ? 'rgba(20,184,166,0.7)' : 'rgba(148,163,184,0.4)' }}>
                    {hrs.toFixed(1)} hrs
                    {gs && (
                      <span style={{ color: isActive ? 'rgba(20,184,166,0.5)' : 'rgba(148,163,184,0.3)', marginLeft: 6 }}>
                        · {gs.totalActual.toFixed(1)}h actual
                      </span>
                    )}
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
                  <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(148,163,184,0.5)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{selected.steps.length} steps · {totalHours(selected.steps).toFixed(1)} hrs estimated</span>
                    {selectedGold && (
                      <span style={{ color: 'rgba(20,184,166,0.6)' }}>
                        · {selectedGold.totalActual.toFixed(1)} hrs actual
                        <span style={{ marginLeft: 6 }}>
                          <DeltaBadge delta={selectedGold.totalActual - selectedGold.totalEstimated} />
                        </span>
                      </span>
                    )}
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

              {/* ── Template metadata fields ── */}
              <div style={{
                marginTop: 16,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
                display: 'flex', gap: 16, flexWrap: 'wrap',
              }}>
                <MetaField
                  label="System Type"
                  value={selected.system_type}
                  options={SYSTEM_TYPE_OPTIONS}
                  onChange={v => {
                    updateSelected(t => ({ ...t, system_type: v }));
                    handleSaveMeta('system_type', v);
                  }}
                />
                <MetaField
                  label="Manufacturer"
                  value={selected.manufacturer}
                  onChange={v => {
                    updateSelected(t => ({ ...t, manufacturer: v }));
                    handleSaveMeta('manufacturer', v);
                  }}
                />
                <MetaField
                  label="Installation Type"
                  value={selected.installation_type}
                  onChange={v => {
                    updateSelected(t => ({ ...t, installation_type: v }));
                    handleSaveMeta('installation_type', v);
                  }}
                />
              </div>
            </div>

            {/* Gold Data Summary Card */}
            <GoldSummaryCard
              summary={goldSummary}
              totalTemplates={templates.length}
              onRefresh={handleRefreshGoldData}
              refreshing={refreshingGold}
            />

            {/* Steps */}
            <div style={{ flex: 1, padding: '0 28px 20px', overflowY: 'auto' }}>
              {/* Column headers */}
              {selected.steps.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr 90px 140px 160px 1fr 40px 36px',
                  gap: 8, padding: '0 8px 8px',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'rgba(148,163,184,0.4)',
                }}>
                  <div />
                  <div>Step Name</div>
                  <div>Est. Hours</div>
                  <div>Category</div>
                  <div style={{ color: 'rgba(20,184,166,0.4)' }}>
                    Gold Data {goldLoading && <span style={{ fontWeight: 400 }}>(loading…)</span>}
                  </div>
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
                selected.steps.map((step, idx) => {
                  const goldEntry = getGoldEntry(selected.name, step.step_name);
                  return (
                    <div
                      key={step.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '36px 1fr 90px 140px 160px 1fr 40px 36px',
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

                      {/* Est. Hours */}
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

                      {/* Gold Data column */}
                      <GoldCell
                        entry={goldEntry}
                        defaultHours={step.default_hours}
                        onUpdateFromActuals={() => goldEntry && handleUpdateFromActuals(step, goldEntry)}
                      />

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
                  );
                })
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
