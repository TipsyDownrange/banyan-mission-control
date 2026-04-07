'use client';
import { useState, useEffect, useRef } from 'react';
import WorkBreakdown from '@/components/shared/WorkBreakdown';

type WorkOrder = {
  id: string; name: string; description: string;
  status: string; rawStatus: string; island: string;
  assignedTo: string; dateReceived: string; dueDate: string;
  scheduledDate: string; startDate: string;
  hoursEstimated: string; hoursActual: string; hoursToMeasure: string;
  men: string; done: boolean;
  comments: string; contact: string; address: string; lane: string;
  folderUrl?: string;
};

type CrewMember = { user_id: string; name: string; role: string; island: string };

const STAGES = [
  { key: 'lead',        label: 'New Lead',         color: '#64748b' },
  { key: 'quote',       label: 'Quote Requested',   color: '#0369a1' },
  { key: 'approved',    label: 'Need to Schedule',  color: '#92400e' },
  { key: 'scheduled',   label: 'Scheduled',          color: '#4338ca' },
  { key: 'in_progress', label: 'In Progress',        color: '#0f766e' },
  { key: 'closed',      label: 'Completed',          color: '#15803d' },
];

const STAGE_BG: Record<string, string> = {
  lead: '#f8fafc', quote: '#eff6ff', approved: '#fffbeb',
  scheduled: '#eef2ff', in_progress: '#f0fdfa', closed: '#f0fdf4',
};

function toTitleCase(str: string): string {
  if (!str) return str;
  const letters = str.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 2 && letters === letters.toUpperCase()) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return str;
}

const INP: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: 'white',
  fontSize: 13, color: '#0f172a', outline: 'none',
  boxSizing: 'border-box',
};

const LBL: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: '#94a3b8',
  marginBottom: 4, display: 'block',
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: '#64748b',
  borderBottom: '1px solid #f1f5f9', paddingBottom: 8,
  marginBottom: 14, marginTop: 4,
};

interface WODetailPanelProps {
  wo: WorkOrder | null;
  allCrew: CrewMember[];
  readOnly?: boolean;
  onClose: () => void;
  onSave: (woId: string, fields: Partial<WorkOrder> & { hoursEstimated?: string; hoursActual?: string; _woName?: string; _island?: string }) => Promise<void>;
  onStageChange: (woId: string, stage: string) => Promise<void>;
  onQuote: (woId: string) => void;
  onFolderLinked?: (woId: string, folderUrl: string) => void;
}

export default function WODetailPanel({ wo, allCrew, readOnly = false, onClose, onSave, onStageChange, onQuote, onFolderLinked }: WODetailPanelProps) {
  const [draft, setDraft] = useState<Partial<WorkOrder> & { hoursEstimated?: string; hoursActual?: string }>({});
  const [saving, setSaving] = useState(false);
  const [stageSaving, setStageSaving] = useState('');
  const [dirty, setDirty] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [stageError, setStageError] = useState('');
  const [linkingFolder, setLinkingFolder] = useState(false);
  const [linkFolderInput, setLinkFolderInput] = useState('');
  const [linkFolderSaving, setLinkFolderSaving] = useState(false);
  const [linkedFolderUrl, setLinkedFolderUrl] = useState<string | undefined>(undefined);
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync linkedFolderUrl from wo prop
  useEffect(() => { setLinkedFolderUrl(wo?.folderUrl); }, [wo?.folderUrl]);

  async function handleLinkFolder() {
    if (!linkFolderInput || !wo) return;
    setLinkFolderSaving(true);
    try {
      await fetch('/api/service/folder-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ woName: wo.name, folderUrl: linkFolderInput }),
      });
      setLinkedFolderUrl(linkFolderInput);
      onFolderLinked?.(wo.id, linkFolderInput);
      setLinkingFolder(false);
      setLinkFolderInput('');
    } catch {
      // swallow — not critical
    } finally {
      setLinkFolderSaving(false);
    }
  }

  useEffect(() => {
    if (!wo) return;
    setDraft({
      name: wo.name,
      description: wo.description,
      contact: wo.contact,
      address: wo.address,
      island: wo.island,
      scheduledDate: wo.scheduledDate,
      dueDate: wo.dueDate,
      hoursEstimated: wo.hoursEstimated,
      hoursActual: wo.hoursActual,
      men: wo.men,
      comments: wo.comments,
      lane: wo.lane,
    });
    setSelectedCrew(wo.assignedTo ? wo.assignedTo.split(',').map(s => s.trim()).filter(Boolean) : []);
    setDirty(false);
  }, [wo]);

  if (!wo) {
    return (
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, backdropFilter: 'blur(2px)' }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
          height: '40vh', background: '#f8fafc', borderRadius: '20px 20px 0 0',
          boxShadow: '0 -24px 80px rgba(15,23,42,0.18)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 32,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Work order not found</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20, textAlign: 'center' }}>The work order you selected could not be loaded. It may have been removed or the data is unavailable.</div>
          <button onClick={onClose} style={{ padding: '10px 24px', borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>Close</button>
        </div>
      </>
    );
  }
  const safeWo = wo;

  const stage = STAGES.find(s => s.key === safeWo.status) || STAGES[0];

  function update(field: string, value: string) {
    setDraft(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  function toggleCrew(name: string) {
    setSelectedCrew(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await onSave(safeWo.id, {
        ...draft,
        assignedTo: selectedCrew.join(', '),
        _woName: draft.name || safeWo.name,
        _island: draft.island || safeWo.island,
      });
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(stageKey: string) {
    setStageSaving(stageKey);
    setStageError('');
    try {
      await onStageChange(safeWo.id, stageKey);
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'Failed to update stage.');
    } finally {
      setStageSaving('');
    }
  }

  // Island-filtered field crew
  function areaToIsland(area: string): string {
    const a = (area || '').toLowerCase();
    if (['oahu','honolulu','kapolei','kailua','kaneohe','pearl city','aiea','ewa','hawaii kai'].some(c => a.includes(c))) return 'Oahu';
    if (['kauai','lihue','kapaa','poipu','princeville','koloa'].some(c => a.includes(c))) return 'Kauai';
    if (['hilo','kona','waimea','kohala','puna'].some(c => a.includes(c))) return 'Hawaii';
    if (a) return 'Maui';
    return '';
  }
  const woIsland = ['Oahu','Maui','Kauai','Hawaii'].includes(wo.island) ? wo.island : areaToIsland(wo.island);
  const islandCrew = allCrew.filter(c => {
    const isField = ['Superintendent','Journeyman','Apprentice'].some(r => c.role.includes(r));
    return isField && (!woIsland || c.island === woIsland);
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, backdropFilter: 'blur(2px)' }}
      />

      {/* Slide-up panel */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        height: '92vh',
        background: '#f8fafc',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -24px 80px rgba(15,23,42,0.18)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header strip */}
        <div style={{
          padding: '14px 20px 12px',
          background: 'white',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          {/* Drag handle */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, borderRadius: 2, background: '#e2e8f0' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <div style={{ width: 4, height: 36, borderRadius: 2, background: stage.color }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {toTitleCase(wo.name)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {wo.id && <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{wo.id}</span>}
                <span style={{ fontSize: 10, fontWeight: 800, color: stage.color, background: STAGE_BG[wo.status] || '#f8fafc', padding: '2px 8px', borderRadius: 999, border: `1px solid ${stage.color}33` }}>{stage.label}</span>
                {wo.island && <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{wo.island}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(linkedFolderUrl || wo.folderUrl) ? (
              <a
                href={linkedFolderUrl || wo.folderUrl}
                target="_blank"
                rel="noreferrer"
                title="Open project files in Drive"
                onClick={e => e.stopPropagation()}
                style={{ padding: '7px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid rgba(3,105,161,0.2)', color: '#0369a1', fontSize: 12, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                📁 Files
              </a>
            ) : (
              <button
                onClick={() => setLinkingFolder(p => !p)}
                title="Link Drive folder"
                style={{ padding: '7px 14px', borderRadius: 10, background: linkingFolder ? 'rgba(239,246,255,0.96)' : '#f8fafc', border: linkingFolder ? '1px solid rgba(3,105,161,0.4)' : '1px solid #e2e8f0', color: linkingFolder ? '#0369a1' : '#64748b', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                🔗 Link Folder
              </button>
            )}
            <button
              onClick={() => onQuote(wo.id)}
              title="Build quote"
              style={{ padding: '7px 14px', borderRadius: 10, background: '#eff6ff', border: '1px solid rgba(3,105,161,0.2)', color: '#0369a1', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              $ Quote
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`/api/service/dispatch-pdf?wo=${encodeURIComponent(wo.id)}`);
                  if (!res.ok) { alert('Failed to generate work order PDF'); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `WO-${wo.id}.pdf`; a.click();
                  URL.revokeObjectURL(url);
                } catch { alert('Failed to generate work order PDF'); }
              }}
              title="Print work order for field crew"
              style={{ padding: '7px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid rgba(21,128,61,0.2)', color: '#15803d', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              Print WO
            </button>
            {dirty && !readOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '7px 16px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 12, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 2px 8px rgba(15,118,110,0.3)' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            {readOnly && <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, padding: '4px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 8 }}>👁 View only</div>}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Error banners */}
        {saveError && (
          <div style={{ margin: '0 20px', padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {saveError}</span>
            <button onClick={() => setSaveError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}
        {stageError && (
          <div style={{ margin: '0 20px', padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#b91c1c', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {stageError}</span>
            <button onClick={() => setStageError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Link Folder input bar */}
        {linkingFolder && (
          <div style={{ padding: '10px 20px 12px', background: 'rgba(239,246,255,0.8)', borderBottom: '1px solid rgba(59,130,246,0.15)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#0369a1', flexShrink: 0 }}>Folder URL:</span>
            <input
              type="url"
              value={linkFolderInput}
              onChange={e => setLinkFolderInput(e.target.value)}
              placeholder="Paste Google Drive folder URL..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleLinkFolder(); if (e.key === 'Escape') { setLinkingFolder(false); setLinkFolderInput(''); } }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(3,105,161,0.3)', fontSize: 12, outline: 'none', background: 'white', color: '#0f172a' }}
            />
            <button
              onClick={handleLinkFolder}
              disabled={!linkFolderInput || linkFolderSaving}
              style={{ padding: '8px 16px', borderRadius: 8, background: linkFolderInput && !linkFolderSaving ? '#0369a1' : '#e2e8f0', color: linkFolderInput && !linkFolderSaving ? 'white' : '#94a3b8', border: 'none', fontSize: 12, fontWeight: 700, cursor: linkFolderInput && !linkFolderSaving ? 'pointer' : 'default', flexShrink: 0 }}>
              {linkFolderSaving ? 'Saving...' : 'Save Link'}
            </button>
            <button
              onClick={() => { setLinkingFolder(false); setLinkFolderInput(''); }}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontSize: 14, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>
              ✕
            </button>
          </div>
        )}

        {/* Scrollable body — two-column layout */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 1100, margin: '0 auto' }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Job Details */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Job Details</div>
                <div style={{ display: 'grid', gap: 12 }}>
                  <div>
                    <label style={LBL}>Job Name</label>
                    <input style={INP} value={draft.name || ''} onChange={e => update('name', e.target.value)} placeholder="Customer / job name" />
                  </div>
                  <div>
                    <label style={LBL}>Description / Scope</label>
                    <textarea
                      rows={3}
                      style={{ ...INP, resize: 'none' }}
                      value={draft.description || ''}
                      onChange={e => update('description', e.target.value)}
                      placeholder="What needs to be done…"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={LBL}>Island</label>
                      <select style={INP} value={draft.island || ''} onChange={e => update('island', e.target.value)}>
                        <option value="">Select…</option>
                        {['Maui','Oahu','Kauai','Hawaii','Molokai','Lanai'].map(isl => <option key={isl}>{isl}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={LBL}>Lane</label>
                      <input style={INP} value={draft.lane || ''} onChange={e => update('lane', e.target.value)} placeholder="Service lane" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer & Site */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Customer & Site</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <label style={LBL}>Contact Person / Phone</label>
                    <input style={INP} value={draft.contact || ''} onChange={e => update('contact', e.target.value)} placeholder="Name · 808-XXX-XXXX" />
                  </div>
                  <div>
                    <label style={LBL}>Address</label>
                    <input style={INP} value={draft.address || ''} onChange={e => update('address', e.target.value)} placeholder="Street address" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Notes & Comments</div>
                <textarea
                  rows={4}
                  style={{ ...INP, resize: 'none' }}
                  value={draft.comments || ''}
                  onChange={e => update('comments', e.target.value)}
                  placeholder="Internal notes, follow-ups, customer requests…"
                />
              </div>

              {/* Work Breakdown */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Work Breakdown</div>
                <WorkBreakdown
                  jobId={wo.id}
                  jobType="wo"
                  quotedHours={parseFloat(wo.hoursEstimated) || undefined}
                  readOnly={readOnly}
                />
              </div>

              {/* Job Files */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setJobFiles(prev => [...prev, ...files]);
                    e.target.value = '';
                  }}
                />
                <div style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span>Job Files</span>
                  {jobFiles.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0f766e', background: 'rgba(15,118,110,0.08)', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(15,118,110,0.15)' }}>
                      {jobFiles.length}
                    </span>
                  )}
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    const files = Array.from(e.dataTransfer.files);
                    setJobFiles(prev => [...prev, ...files]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDraggingOver ? '#14b8a6' : '#e2e8f0'}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                    textAlign: 'center' as const,
                    cursor: 'pointer',
                    background: isDraggingOver ? 'rgba(240,253,250,0.8)' : '#f8fafc',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 4 }}>📎</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isDraggingOver ? '#0f766e' : '#64748b' }}>
                    Drop files here or click to browse
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Images, PDFs, documents</div>
                </div>
                {jobFiles.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {jobFiles.map((file, i) => {
                      const isPDF = file.type === 'application/pdf';
                      const isImage = file.type.startsWith('image/');
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: 14 }}>{isPDF ? '📄' : isImage ? '🖼' : '📎'}</span>
                          <span style={{ flex: 1, fontSize: 12, color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(file.size / 1024).toFixed(0)} KB</span>
                          <button
                            onClick={e => { e.stopPropagation(); setJobFiles(prev => prev.filter((_, j) => j !== i)); }}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                          >×</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Scheduling */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Scheduling & Hours</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={LBL}>Scheduled Date</label>
                    <input type="date" style={INP} value={draft.scheduledDate || ''} onChange={e => update('scheduledDate', e.target.value)} />
                  </div>
                  <div>
                    <label style={LBL}>Due Date</label>
                    <input type="date" style={INP} value={draft.dueDate || ''} onChange={e => update('dueDate', e.target.value)} />
                  </div>
                  <div>
                    <label style={LBL}>Est. Hours</label>
                    <input type="number" style={INP} value={draft.hoursEstimated || ''} onChange={e => update('hoursEstimated', e.target.value)} placeholder="e.g. 4" min="0" step="0.5" />
                  </div>
                  <div>
                    <label style={LBL}>Actual Hours</label>
                    <input type="number" style={INP} value={draft.hoursActual || ''} onChange={e => update('hoursActual', e.target.value)} placeholder="After close" min="0" step="0.5" />
                  </div>
                  <div>
                    <label style={LBL}>Measure Hours</label>
                    <input type="number" style={INP} value={draft.hoursToMeasure || ''} onChange={e => update('hoursToMeasure' as keyof WorkOrder, e.target.value)} placeholder="—" min="0" step="0.5" />
                  </div>
                  <div>
                    <label style={LBL}>Men Required</label>
                    <input type="number" style={INP} value={draft.men || ''} onChange={e => update('men', e.target.value)} placeholder="e.g. 2" min="1" max="12" />
                  </div>
                </div>
                {/* Read-only meta */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {wo.dateReceived && (
                    <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ ...LBL, marginBottom: 2 }}>Date Received</div>
                      <div style={{ fontSize: 12, color: '#475569' }}>{wo.dateReceived}</div>
                    </div>
                  )}
                  {wo.rawStatus && (
                    <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ ...LBL, marginBottom: 2 }}>Smartsheet Status</div>
                      <div style={{ fontSize: 11, color: '#475569' }}>{wo.rawStatus}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Crew Assignment */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Crew Assignment — {woIsland || 'All Islands'}</div>
                {islandCrew.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No field crew found for {wo.island || 'this island'}.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {islandCrew.filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i).map(c => {
                      const sel = selectedCrew.includes(c.name);
                      return (
                        <button key={c.user_id} onClick={() => toggleCrew(c.name)} style={{
                          padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: sel ? '1px solid rgba(99,102,241,0.5)' : '1px solid #e2e8f0',
                          background: sel ? 'rgba(99,102,241,0.1)' : 'white',
                          color: sel ? '#4338ca' : '#64748b',
                          transition: 'all 0.1s',
                        }}>
                          {sel ? '✓ ' : ''}{c.name}
                          <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 4 }}>{c.role.split('/')[0].trim()}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedCrew.length > 0 && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', fontSize: 12, color: '#4338ca', fontWeight: 600 }}>
                    {selectedCrew.join(', ')}
                    {draft.scheduledDate ? ` → ${draft.scheduledDate}` : ''}
                  </div>
                )}
              </div>

              {/* Pipeline Stage */}
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
                <div style={SECTION_TITLE}>Pipeline Stage</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7 }}>
                  {STAGES.map(s => {
                    const isActive = wo.status === s.key;
                    const isSaving = stageSaving === s.key;
                    return (
                      <button key={s.key}
                        onClick={() => !isActive && !stageSaving && handleStageChange(s.key)}
                        disabled={isActive || !!stageSaving}
                        style={{
                          padding: '9px 6px', borderRadius: 10, fontSize: 10, fontWeight: 800,
                          textTransform: 'uppercase', letterSpacing: '0.05em',
                          cursor: isActive || stageSaving ? 'default' : 'pointer',
                          border: isActive ? `1.5px solid ${s.color}` : '1px solid #e2e8f0',
                          background: isSaving ? '#f1f5f9' : isActive ? STAGE_BG[s.key] || '#f8fafc' : 'white',
                          color: isActive ? s.color : '#94a3b8',
                          opacity: stageSaving && !isActive ? 0.5 : 1,
                          transition: 'all 0.1s',
                        }}>
                        {isSaving ? '…' : s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Bottom save bar — always visible */}
        {dirty && !readOnly && (
          <div style={{
            flexShrink: 0, padding: '12px 20px',
            background: 'white', borderTop: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            <button onClick={() => { setDraft({}); setDirty(false); onClose(); }}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Discard
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '10px 24px', borderRadius: 10, background: saving ? '#e2e8f0' : 'linear-gradient(135deg,#0f766e,#14b8a6)', color: saving ? '#94a3b8' : 'white', border: 'none', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 3px 10px rgba(15,118,110,0.3)' }}>
              {saving ? 'Saving…' : '✓ Save All Changes'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
