'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface KBArticle {
  article_id: string;
  title: string;
  product_line_id: string;
  article_type: string;
  status: string;
  field_visible: string;
  revision: string;
  symptom_terms: string;
  safety_level: string;
  stop_conditions: string;
  quick_checks: string;
  likely_causes: string;
  parts_tools: string;
  escalation: string;
  source_document_ids: string[];
  last_reviewed_at: string;
  owner_user: string;
  approved_by: string;
  published_at: string;
  created_at: string;
  updated_at: string;
  archived_at: string;
  notes: string;
}

interface KBFeedback {
  feedback_id: string;
  article_id: string;
  submitted_at: string;
  submitted_by: string;
  user_email: string;
  source_app: string;
  kID: string;
  slot_id: string;
  feedback_type: string;
  feedback_text: string;
  status: string;
  triaged_by: string;
  triaged_at: string;
  resolution_notes: string;
  created_task_id: string;
}

interface KBProductLine {
  product_line_id: string;
  manufacturer: string;
  product_family: string;
  display_name: string;
  description: string;
  status: string;
  field_visible: string;
  sort_order: string;
  created_at: string;
  updated_at: string;
  last_reviewed_at: string;
  owner_notes: string;
  article_count?: number;
}

// ─── Status badge colors ──────────────────────────────────────────────────────
function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; border: string; color: string }> = {
    draft:      { bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.3)',   color: '#f59e0b' },
    in_review:  { bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.3)',   color: '#60a5fa' },
    approved:   { bg: 'rgba(167,139,250,0.12)',  border: 'rgba(167,139,250,0.3)',  color: '#a78bfa' },
    published:  { bg: 'rgba(20,184,166,0.12)',   border: 'rgba(20,184,166,0.3)',   color: '#14b8a6' },
    archived:   { bg: 'rgba(148,163,184,0.08)',  border: 'rgba(148,163,184,0.2)',  color: 'rgba(148,163,184,0.5)' },
  };
  const s = map[status] || map['draft'];
  return {
    fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px',
    background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    display: 'inline-block',
  };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isUrl(s: string) {
  return /^https?:\/\//i.test(s.trim());
}

function formatDate(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const VOTED_KEY = 'banyan_kb_voted';
function getVoted(): Record<string, 'helpful' | 'not_helpful'> {
  try {
    return JSON.parse(localStorage.getItem(VOTED_KEY) || '{}');
  } catch {
    return {};
  }
}
function setVoted(articleId: string, vote: 'helpful' | 'not_helpful') {
  const voted = getVoted();
  voted[articleId] = vote;
  localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
}

// ─── New Article Form ─────────────────────────────────────────────────────────
function NewArticleForm({
  productLines,
  onSave,
  onCancel,
}: {
  productLines: KBProductLine[];
  onSave: (article: KBArticle) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [productLineId, setProductLineId] = useState('');
  const [articleType, setArticleType] = useState('troubleshooting');
  const [status, setStatus] = useState('draft');
  const [fieldVisible, setFieldVisible] = useState(false);
  const [revision, setRevision] = useState('0.1');
  const [symptomTerms, setSymptomTerms] = useState('');
  const [safetyLevel, setSafetyLevel] = useState('low');
  const [stopConditions, setStopConditions] = useState('');
  const [quickChecks, setQuickChecks] = useState('');
  const [likelyCauses, setLikelyCauses] = useState('');
  const [partsTools, setPartsTools] = useState('');
  const [escalation, setEscalation] = useState('');
  const [sourceDocumentIds, setSourceDocumentIds] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!title.trim() || !productLineId) {
      setError('Title and product line are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          product_line_id: productLineId,
          article_type: articleType,
          status,
          field_visible: fieldVisible ? 'TRUE' : 'FALSE',
          revision,
          symptom_terms: symptomTerms,
          safety_level: safetyLevel,
          stop_conditions: stopConditions,
          quick_checks: quickChecks,
          likely_causes: likelyCauses,
          parts_tools: partsTools,
          escalation,
          source_document_ids: sourceDocumentIds.split(',').map(s => s.trim()).filter(Boolean),
          notes,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to save');
      const artRes = await fetch(`/api/knowledge/${data.article_id}`);
      const artData = await artRes.json();
      if (artData.ok) onSave(artData.article);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'rgba(248,250,252,0.85)', fontSize: 13,
    padding: '8px 10px', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.6)',
    letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block',
  };
  const ALL_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#0f1c29', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: 28, width: 600, maxWidth: '95vw',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'rgba(248,250,252,0.85)', marginBottom: 20 }}>
          New Article
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f87171', marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Article title" />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Product Line</label>
            <select value={productLineId} onChange={e => setProductLineId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Select product line…</option>
              {productLines.map(pl => (
                <option key={pl.product_line_id} value={pl.product_line_id}>{pl.display_name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Article Type</label>
            <select value={articleType} onChange={e => setArticleType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="troubleshooting">Troubleshooting</option>
              <option value="install">Install</option>
              <option value="reference">Reference</option>
              <option value="service_bulletin">Service Bulletin</option>
              <option value="sop">SOP</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ALL_STATUSES.map(s => (
                <button key={s} onClick={() => setStatus(s)} style={{
                  ...statusBadgeStyle(s),
                  cursor: 'pointer',
                  opacity: status === s ? 1 : 0.45,
                  outline: status === s ? '2px solid rgba(255,255,255,0.2)' : 'none',
                  outlineOffset: 1,
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Safety Level</label>
            <select value={safetyLevel} onChange={e => setSafetyLevel(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Revision</label>
            <input value={revision} onChange={e => setRevision(e.target.value)} style={inputStyle} placeholder="0.1" />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(148,163,184,0.75)', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={fieldVisible}
                onChange={e => setFieldVisible(e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              Field Visible
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Symptom Terms (comma-separated)</label>
          <input value={symptomTerms} onChange={e => setSymptomTerms(e.target.value)} style={inputStyle} placeholder="e.g. door reverses, safety edge, fault code" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Stop Conditions</label>
          <textarea value={stopConditions} onChange={e => setStopConditions(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Safety stops and hard limits" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Quick Checks</label>
          <textarea value={quickChecks} onChange={e => setQuickChecks(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Numbered quick check steps" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Likely Causes</label>
          <textarea value={likelyCauses} onChange={e => setLikelyCauses(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Comma-separated likely causes" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Parts & Tools</label>
          <textarea value={partsTools} onChange={e => setPartsTools(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Parts and tools required" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Escalation</label>
          <textarea value={escalation} onChange={e => setEscalation(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Escalation path and criteria" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Source Document IDs (comma-separated)</label>
          <input value={sourceDocumentIds} onChange={e => setSourceDocumentIds(e.target.value)} style={inputStyle} placeholder="e.g. src-001, src-002" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Internal notes" />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(148,163,184,0.7)',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? 'rgba(20,184,166,0.3)' : 'rgba(20,184,166,0.2)',
            border: '1px solid rgba(20,184,166,0.4)',
            color: '#14b8a6',
          }}>
            {saving ? 'Saving…' : 'Save Article'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section block ────────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Article Detail ───────────────────────────────────────────────────────────
function ArticleDetail({
  article,
  productLines,
  isManagement,
  onUpdate,
  onDelete,
}: {
  article: KBArticle;
  productLines: KBProductLine[];
  isManagement: boolean;
  onUpdate: (updated: KBArticle) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  // Edit state mirrors all canon fields
  const [editTitle, setEditTitle] = useState(article.title);
  const [editProductLineId, setEditProductLineId] = useState(article.product_line_id);
  const [editArticleType, setEditArticleType] = useState(article.article_type);
  const [editStatus, setEditStatus] = useState(article.status);
  const [editFieldVisible, setEditFieldVisible] = useState(article.field_visible === 'TRUE');
  const [editRevision, setEditRevision] = useState(article.revision);
  const [editSymptomTerms, setEditSymptomTerms] = useState(article.symptom_terms);
  const [editSafetyLevel, setEditSafetyLevel] = useState(article.safety_level);
  const [editStopConditions, setEditStopConditions] = useState(article.stop_conditions);
  const [editQuickChecks, setEditQuickChecks] = useState(article.quick_checks);
  const [editLikelyCauses, setEditLikelyCauses] = useState(article.likely_causes);
  const [editPartsTools, setEditPartsTools] = useState(article.parts_tools);
  const [editEscalation, setEditEscalation] = useState(article.escalation);
  const [editSourceDocumentIds, setEditSourceDocumentIds] = useState(article.source_document_ids.join(', '));
  const [editOwnerUser, setEditOwnerUser] = useState(article.owner_user);
  const [editNotes, setEditNotes] = useState(article.notes);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voted, setVotedState] = useState<'helpful' | 'not_helpful' | undefined>(
    getVoted()[article.article_id]
  );
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Reset edit state when article changes
  useEffect(() => {
    setEditing(false);
    setEditTitle(article.title);
    setEditProductLineId(article.product_line_id);
    setEditArticleType(article.article_type);
    setEditStatus(article.status);
    setEditFieldVisible(article.field_visible === 'TRUE');
    setEditRevision(article.revision);
    setEditSymptomTerms(article.symptom_terms);
    setEditSafetyLevel(article.safety_level);
    setEditStopConditions(article.stop_conditions);
    setEditQuickChecks(article.quick_checks);
    setEditLikelyCauses(article.likely_causes);
    setEditPartsTools(article.parts_tools);
    setEditEscalation(article.escalation);
    setEditSourceDocumentIds(article.source_document_ids.join(', '));
    setEditOwnerUser(article.owner_user);
    setEditNotes(article.notes);
    setVotedState(getVoted()[article.article_id]);
  }, [
    article.article_id, article.title, article.product_line_id, article.article_type,
    article.status, article.field_visible, article.revision, article.symptom_terms,
    article.safety_level, article.stop_conditions, article.quick_checks, article.likely_causes,
    article.parts_tools, article.escalation, article.source_document_ids, article.owner_user,
    article.notes,
  ]);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/knowledge/${article.article_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          product_line_id: editProductLineId,
          article_type: editArticleType,
          status: editStatus,
          field_visible: editFieldVisible ? 'TRUE' : 'FALSE',
          revision: editRevision,
          symptom_terms: editSymptomTerms,
          safety_level: editSafetyLevel,
          stop_conditions: editStopConditions,
          quick_checks: editQuickChecks,
          likely_causes: editLikelyCauses,
          parts_tools: editPartsTools,
          escalation: editEscalation,
          source_document_ids: editSourceDocumentIds.split(',').map(s => s.trim()).filter(Boolean),
          owner_user: editOwnerUser,
          notes: editNotes,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      onUpdate({
        ...article,
        title: editTitle,
        product_line_id: editProductLineId,
        article_type: editArticleType,
        status: editStatus,
        field_visible: editFieldVisible ? 'TRUE' : 'FALSE',
        revision: editRevision,
        symptom_terms: editSymptomTerms,
        safety_level: editSafetyLevel,
        stop_conditions: editStopConditions,
        quick_checks: editQuickChecks,
        likely_causes: editLikelyCauses,
        parts_tools: editPartsTools,
        escalation: editEscalation,
        source_document_ids: editSourceDocumentIds.split(',').map(s => s.trim()).filter(Boolean),
        owner_user: editOwnerUser,
        notes: editNotes,
        updated_at: new Date().toISOString(),
      });
      setEditing(false);
      showToast('Article saved', 'success');
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/knowledge/${article.article_id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Delete failed');
      onDelete(article.article_id);
    } catch (e) {
      showToast(String(e), 'error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleVote(type: 'helpful' | 'not_helpful') {
    if (voted) return;
    setVotedState(type);
    setVoted(article.article_id, type);
    try {
      await fetch('/api/knowledge/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: article.article_id,
          feedback_type: type,
          feedback_text: '',
          source_app: 'mission_control',
        }),
      });
    } catch { /* optimistic */ }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'rgba(248,250,252,0.85)', fontSize: 13,
    padding: '8px 10px', outline: 'none',
  };
  const taStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 };
  const ALL_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'];
  const blockText: React.CSSProperties = { fontSize: 13, color: 'rgba(248,250,252,0.75)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

  return (
    <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', minWidth: 0 }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Title */}
      <div style={{ marginBottom: 16 }}>
        {editing ? (
          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...inputStyle, fontSize: 18, fontWeight: 800, marginBottom: 8 }} />
        ) : (
          <div style={{ fontSize: 18, fontWeight: 800, color: 'rgba(248,250,252,0.9)', lineHeight: 1.3, marginBottom: 8 }}>
            {article.title}
          </div>
        )}

        {/* Meta chips row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {editing ? (
            <select value={editProductLineId} onChange={e => setEditProductLineId(e.target.value)} style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px' }}>
              {productLines.map(pl => (
                <option key={pl.product_line_id} value={pl.product_line_id}>{pl.display_name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.22)', color: '#14b8a6', borderRadius: 6, padding: '2px 8px' }}>
              {article.product_line_id}
            </span>
          )}

          {editing ? (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {ALL_STATUSES.map(s => (
                <button key={s} onClick={() => setEditStatus(s)} style={{
                  ...statusBadgeStyle(s),
                  cursor: 'pointer',
                  opacity: editStatus === s ? 1 : 0.4,
                  outline: editStatus === s ? '2px solid rgba(255,255,255,0.15)' : 'none',
                  outlineOffset: 1,
                }}>
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <span style={statusBadgeStyle(article.status)}>{article.status}</span>
          )}

          {!editing && (
            <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>
              Updated {formatDate(article.updated_at)}
            </span>
          )}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 20 }} />

      {/* Read mode: all canon fields */}
      {!editing && (
        <>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <Section label="Article Type">
              <span style={{ fontSize: 12, color: 'rgba(248,250,252,0.7)' }}>{article.article_type || '—'}</span>
            </Section>
            <Section label="Field Visible">
              <span style={{ fontSize: 12, color: article.field_visible === 'TRUE' ? '#14b8a6' : 'rgba(148,163,184,0.5)' }}>
                {article.field_visible === 'TRUE' ? 'Yes' : 'No'}
              </span>
            </Section>
            <Section label="Revision">
              <span style={{ fontSize: 12, color: 'rgba(248,250,252,0.7)' }}>{article.revision || '—'}</span>
            </Section>
            <Section label="Safety Level">
              <span style={{ fontSize: 12, color: article.safety_level === 'high' ? '#f87171' : article.safety_level === 'medium' ? '#f59e0b' : 'rgba(148,163,184,0.7)' }}>
                {article.safety_level || '—'}
              </span>
            </Section>
          </div>

          {article.symptom_terms && (
            <Section label="Symptom Terms">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {article.symptom_terms.split(',').map(t => t.trim()).filter(Boolean).map(term => (
                  <span key={term} style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.75)', borderRadius: 5, padding: '2px 8px' }}>
                    {term}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {article.stop_conditions && (
            <Section label="Stop Conditions">
              <div style={{ ...blockText, color: '#f87171' }}>{article.stop_conditions}</div>
            </Section>
          )}
          {article.quick_checks && (
            <Section label="Quick Checks">
              <div style={blockText}>{article.quick_checks}</div>
            </Section>
          )}
          {article.likely_causes && (
            <Section label="Likely Causes">
              <div style={blockText}>{article.likely_causes}</div>
            </Section>
          )}
          {article.parts_tools && (
            <Section label="Parts & Tools">
              <div style={blockText}>{article.parts_tools}</div>
            </Section>
          )}
          {article.escalation && (
            <Section label="Escalation">
              <div style={blockText}>{article.escalation}</div>
            </Section>
          )}

          {article.source_document_ids.length > 0 && (
            <Section label="Source Document IDs">
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {article.source_document_ids.map((src, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)', marginBottom: 4 }}>
                    {isUrl(src) ? (
                      <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: '#14b8a6', textDecoration: 'underline', wordBreak: 'break-all' }}>{src}</a>
                    ) : src}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            {article.owner_user && (
              <Section label="Owner">
                <span style={{ fontSize: 12, color: 'rgba(248,250,252,0.65)' }}>{article.owner_user}</span>
              </Section>
            )}
            {article.approved_by && (
              <Section label="Approved By">
                <span style={{ fontSize: 12, color: 'rgba(248,250,252,0.65)' }}>{article.approved_by}</span>
              </Section>
            )}
            {article.published_at && (
              <Section label="Published At">
                <span style={{ fontSize: 12, color: 'rgba(248,250,252,0.65)' }}>{formatDate(article.published_at)}</span>
              </Section>
            )}
            {article.last_reviewed_at && (
              <Section label="Last Reviewed At">
                <span style={{ fontSize: 12, color: 'rgba(248,250,252,0.65)' }}>{formatDate(article.last_reviewed_at)}</span>
              </Section>
            )}
            {article.created_at && (
              <Section label="Created At">
                <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>{formatDate(article.created_at)}</span>
              </Section>
            )}
            {article.updated_at && (
              <Section label="Updated At">
                <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>{formatDate(article.updated_at)}</span>
              </Section>
            )}
          </div>

          {article.notes && (
            <Section label="Notes">
              <div style={{ ...blockText, color: 'rgba(148,163,184,0.65)', fontStyle: 'italic' }}>{article.notes}</div>
            </Section>
          )}
        </>
      )}

      {/* Edit mode */}
      {editing && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Article Type</label>
              <select value={editArticleType} onChange={e => setEditArticleType(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="troubleshooting">Troubleshooting</option>
                <option value="install">Install</option>
                <option value="reference">Reference</option>
                <option value="service_bulletin">Service Bulletin</option>
                <option value="sop">SOP</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Safety Level</label>
              <select value={editSafetyLevel} onChange={e => setEditSafetyLevel(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Revision</label>
              <input value={editRevision} onChange={e => setEditRevision(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(148,163,184,0.75)', fontWeight: 600 }}>
                <input type="checkbox" checked={editFieldVisible} onChange={e => setEditFieldVisible(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
                Field Visible
              </label>
            </div>
          </div>

          {([
            ['Symptom Terms (comma-sep)', editSymptomTerms, setEditSymptomTerms, false],
            ['Stop Conditions', editStopConditions, setEditStopConditions, true],
            ['Quick Checks', editQuickChecks, setEditQuickChecks, true],
            ['Likely Causes', editLikelyCauses, setEditLikelyCauses, true],
            ['Parts & Tools', editPartsTools, setEditPartsTools, true],
            ['Escalation', editEscalation, setEditEscalation, true],
          ] as [string, string, (v: string) => void, boolean][]).map(([lbl, val, setter, isTA]) => (
            <div key={lbl} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>{lbl}</label>
              {isTA ? (
                <textarea value={val} onChange={e => setter(e.target.value)} style={{ ...taStyle, minHeight: 60 }} />
              ) : (
                <input value={val} onChange={e => setter(e.target.value)} style={inputStyle} />
              )}
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Source Document IDs (comma-sep)</label>
            <input value={editSourceDocumentIds} onChange={e => setEditSourceDocumentIds(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Owner</label>
            <input value={editOwnerUser} onChange={e => setEditOwnerUser(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.55)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Notes</label>
            <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} style={{ ...taStyle, minHeight: 60 }} />
          </div>
        </>
      )}

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '20px 0' }} />

      {/* Helpful / Not helpful vote */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)' }}>Was this helpful?</span>
        <button
          onClick={() => handleVote('helpful')}
          disabled={!!voted}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: voted ? 'default' : 'pointer',
            background: voted === 'helpful' ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${voted === 'helpful' ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.08)'}`,
            color: voted === 'helpful' ? '#14b8a6' : 'rgba(148,163,184,0.6)',
            opacity: voted && voted !== 'helpful' ? 0.5 : 1,
          }}
        >
          👍 Helpful
        </button>
        <button
          onClick={() => handleVote('not_helpful')}
          disabled={!!voted}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: voted ? 'default' : 'pointer',
            background: voted === 'not_helpful' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${voted === 'not_helpful' ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,
            color: voted === 'not_helpful' ? '#f87171' : 'rgba(148,163,184,0.6)',
            opacity: voted && voted !== 'not_helpful' ? 0.5 : 1,
          }}
        >
          👎 Not Helpful
        </button>
      </div>

      {/* Management actions */}
      {isManagement && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                background: 'rgba(20,184,166,0.2)', border: '1px solid rgba(20,184,166,0.4)', color: '#14b8a6',
              }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={{
                padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.7)',
              }}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={{
                padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.75)',
              }}>Edit</button>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)} style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171',
                }}>Delete</button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#f87171' }}>Delete this article?</span>
                  <button onClick={handleDelete} disabled={deleting} style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer',
                    background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171',
                  }}>
                    {deleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)',
                  }}>Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function KnowledgeLibraryPanel() {
  const { data: session } = useSession();
  const isManagement = session?.user?.email?.endsWith('@kulaglass.com') ?? false;

  const [tab, setTab] = useState<'articles' | 'feedback'>('articles');
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [productLines, setProductLines] = useState<KBProductLine[]>([]);
  const [feedback, setFeedback] = useState<KBFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLine, setSelectedLine] = useState<string>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [artRes, plRes] = await Promise.all([
        fetch('/api/knowledge'),
        fetch('/api/knowledge/product-lines'),
      ]);
      const artData = await artRes.json();
      const plData = await plRes.json();
      if (artData.ok) setArticles(artData.articles);
      if (plData.ok) setProductLines(plData.product_lines);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (tab === 'feedback' && isManagement) {
      fetch('/api/knowledge/feedback')
        .then(r => r.json())
        .then(d => { if (d.ok) setFeedback(d.feedback); })
        .catch(() => {});
    }
  }, [tab, isManagement]);

  // Filtered articles — use product_line_id and search over title, symptom_terms, quick_checks, notes
  const filteredArticles = articles.filter(a => {
    const matchLine = selectedLine === 'All' || a.product_line_id === selectedLine;
    const lower = search.toLowerCase().trim();
    const matchSearch = !lower || (
      a.title.toLowerCase().includes(lower) ||
      a.symptom_terms.toLowerCase().includes(lower) ||
      a.quick_checks.toLowerCase().includes(lower) ||
      a.notes.toLowerCase().includes(lower)
    );
    return matchLine && matchSearch;
  });

  const selectedArticle = filteredArticles.find(a => a.article_id === selectedId) || filteredArticles[0] || null;

  function handleArticleUpdated(updated: KBArticle) {
    setArticles(prev => prev.map(a => a.article_id === updated.article_id ? updated : a));
  }

  function handleArticleDeleted(id: string) {
    setArticles(prev => prev.filter(a => a.article_id !== id));
    setSelectedId(null);
    showToast('Article deleted', 'success');
  }

  function handleArticleSaved(article: KBArticle) {
    setArticles(prev => [article, ...prev]);
    setSelectedId(article.article_id);
    setShowNewForm(false);
    showToast('Article created', 'success');
  }

  return (
    <div style={{
      height: '100%', background: '#0f1c29',
      display: 'flex', flexDirection: 'column',
      fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
    }}>
      {toast && <Toast message={toast.message} type={toast.type} />}
      {showNewForm && (
        <NewArticleForm
          productLines={productLines}
          onSave={handleArticleSaved}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'rgba(248,250,252,0.85)', letterSpacing: '-0.02em', marginRight: 4 }}>
          Service Knowledge Library
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search articles…"
          style={{
            flex: 1, maxWidth: 280,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8, color: 'rgba(248,250,252,0.8)', fontSize: 13,
            padding: '6px 12px', outline: 'none',
          }}
        />
        {isManagement && (
          <button onClick={() => setShowNewForm(true)} style={{
            padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(20,184,166,0.15)', border: '1px solid rgba(20,184,166,0.35)',
            color: '#14b8a6', letterSpacing: '0.01em',
          }}>
            + New Article
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 20px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {(['articles', 'feedback'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 16px', borderRadius: '8px 8px 0 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: tab === t ? 'rgba(20,184,166,0.1)' : 'transparent',
            border: tab === t ? '1px solid rgba(20,184,166,0.25)' : '1px solid transparent',
            borderBottom: 'none',
            color: tab === t ? '#14b8a6' : 'rgba(148,163,184,0.55)',
          }}>
            {t === 'articles' ? 'Articles' : 'Feedback Queue'}
          </button>
        ))}
      </div>

      {/* Articles tab */}
      {tab === 'articles' && (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left sidebar */}
          <div style={{
            width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            background: '#0d1f2d',
          }}>
            {/* Product line filter pills — use display_name for label, product_line_id for value */}
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexWrap: 'wrap', gap: 5,
            }}>
              <button onClick={() => setSelectedLine('All')} style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: selectedLine === 'All' ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${selectedLine === 'All' ? 'rgba(20,184,166,0.35)' : 'rgba(255,255,255,0.07)'}`,
                color: selectedLine === 'All' ? '#14b8a6' : 'rgba(148,163,184,0.55)',
              }}>
                All
              </button>
              {productLines.map(pl => (
                <button key={pl.product_line_id} onClick={() => setSelectedLine(pl.product_line_id)} style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: selectedLine === pl.product_line_id ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selectedLine === pl.product_line_id ? 'rgba(20,184,166,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  color: selectedLine === pl.product_line_id ? '#14b8a6' : 'rgba(148,163,184,0.55)',
                }}>
                  {pl.display_name}
                </button>
              ))}
            </div>

            {/* Article list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
              {loading && (
                <div style={{ padding: '20px 10px', fontSize: 12, color: 'rgba(148,163,184,0.4)', textAlign: 'center' }}>
                  Loading…
                </div>
              )}
              {!loading && error && (
                <div style={{ padding: '12px 10px', fontSize: 12, color: '#f87171' }}>{error}</div>
              )}
              {!loading && !error && filteredArticles.length === 0 && (
                <div style={{ padding: '20px 10px', fontSize: 12, color: 'rgba(148,163,184,0.4)', textAlign: 'center' }}>
                  No articles found
                </div>
              )}
              {filteredArticles.map(a => {
                const isActive = a.article_id === (selectedArticle?.article_id);
                return (
                  <button
                    key={a.article_id}
                    onClick={() => setSelectedId(a.article_id)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'block',
                      padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                      background: isActive ? 'linear-gradient(135deg, rgba(20,184,166,0.15) 0%, rgba(14,116,144,0.08) 100%)' : 'rgba(255,255,255,0.02)',
                      border: isActive ? '1px solid rgba(20,184,166,0.25)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? 'rgba(248,250,252,0.9)' : 'rgba(248,250,252,0.75)', marginBottom: 5, lineHeight: 1.4 }}>
                      {a.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.15)', color: 'rgba(20,184,166,0.7)', borderRadius: 4, padding: '1px 6px' }}>
                        {a.product_line_id}
                      </span>
                      <span style={statusBadgeStyle(a.status)}>{a.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right detail */}
          {selectedArticle ? (
            <ArticleDetail
              key={selectedArticle.article_id}
              article={selectedArticle}
              productLines={productLines}
              isManagement={isManagement}
              onUpdate={handleArticleUpdated}
              onDelete={handleArticleDeleted}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.35)' }}>Select an article</div>
            </div>
          )}
        </div>
      )}

      {/* Feedback tab */}
      {tab === 'feedback' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {!isManagement && (
            <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.45)', textAlign: 'center', marginTop: 40 }}>
              Sign in with a Kula Glass account to view feedback.
            </div>
          )}
          {isManagement && feedback.length === 0 && (
            <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', textAlign: 'center', marginTop: 40 }}>
              No feedback yet
            </div>
          )}
          {isManagement && feedback.map(f => {
            const article = articles.find(a => a.article_id === f.article_id);
            const typeIcon = f.feedback_type === 'helpful' ? '👍'
              : f.feedback_type === 'not_helpful' ? '👎'
              : f.feedback_type === 'correction' ? '⚠️'
              : '❓';
            const fStatusStyle: React.CSSProperties = {
              fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px',
              background: f.status === 'open' ? 'rgba(245,158,11,0.12)' : f.status === 'triaged' ? 'rgba(96,165,250,0.12)' : 'rgba(20,184,166,0.12)',
              border: `1px solid ${f.status === 'open' ? 'rgba(245,158,11,0.3)' : f.status === 'triaged' ? 'rgba(96,165,250,0.3)' : 'rgba(20,184,166,0.3)'}`,
              color: f.status === 'open' ? '#f59e0b' : f.status === 'triaged' ? '#60a5fa' : '#14b8a6',
            };
            return (
              <div key={f.feedback_id} style={{
                background: '#0d1f2d', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 10,
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                  {typeIcon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(248,250,252,0.8)' }}>
                      {article?.title || f.article_id}
                    </div>
                    <span style={fStatusStyle}>{f.status || 'open'}</span>
                  </div>
                  {f.feedback_text && (
                    <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', marginBottom: 4, fontStyle: 'italic' }}>
                      &ldquo;{f.feedback_text}&rdquo;
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>
                    {f.user_email} · {formatDate(f.submitted_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
