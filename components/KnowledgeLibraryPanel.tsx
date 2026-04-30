'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface KBArticle {
  article_id: string;
  title: string;
  body: string;
  product_line: string;
  tags: string[];
  status: 'draft' | 'published';
  author: string;
  created_at: string;
  updated_at: string;
  helpful_count: number;
  not_helpful_count: number;
  parts_refs: string[];
  sources: string[];
}

interface KBFeedback {
  feedback_id: string;
  article_id: string;
  helpful: boolean;
  comment: string;
  submitted_by: string;
  submitted_at: string;
}

interface KBProductLine {
  product_line_id: string;
  name: string;
  description: string;
  article_count?: number;
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
  const [body, setBody] = useState('');
  const [productLine, setProductLine] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!title.trim() || !body.trim() || !productLine) {
      setError('Title, body, and product line are required.');
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
          body: body.trim(),
          product_line: productLine,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
          status,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to save');
      // Fetch the created article
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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#0f1c29', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: 28, width: 560, maxWidth: '95vw',
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
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Product Line</label>
          <select value={productLine} onChange={e => setProductLine(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">Select product line…</option>
            {productLines.map(pl => (
              <option key={pl.product_line_id} value={pl.name}>{pl.name}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} style={inputStyle} placeholder="e.g. troubleshooting, sensor, motor" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Status</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['draft', 'published'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)} style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: status === s ? (s === 'published' ? 'rgba(20,184,166,0.2)' : 'rgba(245,158,11,0.2)') : 'rgba(255,255,255,0.04)',
                border: `1px solid ${status === s ? (s === 'published' ? 'rgba(20,184,166,0.5)' : 'rgba(245,158,11,0.5)') : 'rgba(255,255,255,0.08)'}`,
                color: status === s ? (s === 'published' ? '#14b8a6' : '#f59e0b') : 'rgba(148,163,184,0.6)',
              }}>
                {s === 'draft' ? 'Draft' : 'Published'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Body</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Article body (Markdown supported)"
          />
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
  const [editTitle, setEditTitle] = useState(article.title);
  const [editBody, setEditBody] = useState(article.body);
  const [editProductLine, setEditProductLine] = useState(article.product_line);
  const [editTags, setEditTags] = useState(article.tags.join(', '));
  const [editStatus, setEditStatus] = useState<'draft' | 'published'>(article.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [voted, setVotedState] = useState<'helpful' | 'not_helpful' | undefined>(
    getVoted()[article.article_id]
  );
  const [localHelpful, setLocalHelpful] = useState(article.helpful_count);
  const [localNotHelpful, setLocalNotHelpful] = useState(article.not_helpful_count);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Reset edit state when article changes
  useEffect(() => {
    setEditing(false);
    setEditTitle(article.title);
    setEditBody(article.body);
    setEditProductLine(article.product_line);
    setEditTags(article.tags.join(', '));
    setEditStatus(article.status);
    setVotedState(getVoted()[article.article_id]);
    setLocalHelpful(article.helpful_count);
    setLocalNotHelpful(article.not_helpful_count);
  }, [article.article_id, article.title, article.body, article.product_line, article.tags, article.status, article.helpful_count, article.not_helpful_count]);

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
          body: editBody,
          product_line: editProductLine,
          tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
          status: editStatus,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      onUpdate({
        ...article,
        title: editTitle,
        body: editBody,
        product_line: editProductLine,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        status: editStatus,
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

  async function handleVote(helpful: boolean) {
    if (voted) return;
    const voteType = helpful ? 'helpful' : 'not_helpful';
    setVotedState(voteType);
    setVoted(article.article_id, voteType);
    if (helpful) setLocalHelpful(n => n + 1);
    else setLocalNotHelpful(n => n + 1);
    try {
      await fetch('/api/knowledge/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: article.article_id, helpful }),
      });
    } catch {
      // Optimistic — ignore error
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, color: 'rgba(248,250,252,0.85)', fontSize: 13,
    padding: '8px 10px', outline: 'none',
  };

  return (
    <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', minWidth: 0 }}>
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        {editing ? (
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            style={{ ...inputStyle, fontSize: 18, fontWeight: 800, marginBottom: 12 }}
          />
        ) : (
          <div style={{ fontSize: 18, fontWeight: 800, color: 'rgba(248,250,252,0.9)', lineHeight: 1.3, marginBottom: 8 }}>
            {article.title}
          </div>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {editing ? (
            <select value={editProductLine} onChange={e => setEditProductLine(e.target.value)} style={{ ...inputStyle, width: 'auto', fontSize: 11, padding: '4px 8px' }}>
              {productLines.map(pl => (
                <option key={pl.product_line_id} value={pl.name}>{pl.name}</option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.25)', color: '#14b8a6', borderRadius: 6, padding: '2px 8px' }}>
              {article.product_line}
            </span>
          )}

          {editing ? (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['draft', 'published'] as const).map(s => (
                <button key={s} onClick={() => setEditStatus(s)} style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: editStatus === s ? (s === 'published' ? 'rgba(20,184,166,0.2)' : 'rgba(245,158,11,0.2)') : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${editStatus === s ? (s === 'published' ? 'rgba(20,184,166,0.4)' : 'rgba(245,158,11,0.4)') : 'rgba(255,255,255,0.08)'}`,
                  color: editStatus === s ? (s === 'published' ? '#14b8a6' : '#f59e0b') : 'rgba(148,163,184,0.5)',
                }}>
                  {s === 'draft' ? 'Draft' : 'Published'}
                </button>
              ))}
            </div>
          ) : (
            <span style={{
              fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 8px',
              background: article.status === 'published' ? 'rgba(20,184,166,0.1)' : 'rgba(245,158,11,0.1)',
              border: `1px solid ${article.status === 'published' ? 'rgba(20,184,166,0.25)' : 'rgba(245,158,11,0.25)'}`,
              color: article.status === 'published' ? '#14b8a6' : '#f59e0b',
            }}>
              {article.status === 'published' ? 'Published' : 'Draft'}
            </span>
          )}

          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>
            Updated {formatDate(article.updated_at)}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(148,163,184,0.45)' }}>
            by {article.author}
          </span>
        </div>

        {/* Tags */}
        <div style={{ marginTop: 10 }}>
          {editing ? (
            <input value={editTags} onChange={e => setEditTags(e.target.value)} style={{ ...inputStyle, fontSize: 12 }} placeholder="Tags (comma-separated)" />
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {article.tags.map(tag => (
                <span key={tag} style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.7)', borderRadius: 5, padding: '2px 8px' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 20 }} />

      {/* Body */}
      {editing ? (
        <textarea
          value={editBody}
          onChange={e => setEditBody(e.target.value)}
          style={{ ...inputStyle, minHeight: 300, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
        />
      ) : (
        <div style={{ fontSize: 13, color: 'rgba(248,250,252,0.8)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {article.body}
        </div>
      )}

      {/* Parts refs */}
      {!editing && article.parts_refs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Parts References</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {article.parts_refs.map((ref, i) => (
              <li key={i} style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)', marginBottom: 4 }}>{ref}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sources */}
      {!editing && article.sources.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.5)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>Sources</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {article.sources.map((src, i) => (
              <li key={i} style={{ fontSize: 12, color: 'rgba(148,163,184,0.75)', marginBottom: 4 }}>
                {isUrl(src) ? (
                  <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: '#14b8a6', textDecoration: 'underline', wordBreak: 'break-all' }}>{src}</a>
                ) : src}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '20px 0' }} />

      {/* Helpful / Not helpful */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.6)' }}>Was this helpful?</span>
        <button
          onClick={() => handleVote(true)}
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
          👍 {localHelpful}
        </button>
        <button
          onClick={() => handleVote(false)}
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
          👎 {localNotHelpful}
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

  // Filtered articles
  const filteredArticles = articles.filter(a => {
    const matchLine = selectedLine === 'All' || a.product_line === selectedLine;
    const matchSearch = !search.trim() || (
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.body.toLowerCase().includes(search.toLowerCase()) ||
      a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
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

      {/* Body */}
      {tab === 'articles' && (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left sidebar */}
          <div style={{
            width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            background: '#0d1f2d',
          }}>
            {/* Product line pills */}
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexWrap: 'wrap', gap: 5,
            }}>
              {['All', ...productLines.map(pl => pl.name)].map(pl => (
                <button key={pl} onClick={() => setSelectedLine(pl)} style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: selectedLine === pl ? 'rgba(20,184,166,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${selectedLine === pl ? 'rgba(20,184,166,0.35)' : 'rgba(255,255,255,0.07)'}`,
                  color: selectedLine === pl ? '#14b8a6' : 'rgba(148,163,184,0.55)',
                }}>
                  {pl}
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
                        {a.product_line}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                        background: a.status === 'published' ? 'rgba(20,184,166,0.08)' : 'rgba(245,158,11,0.1)',
                        border: `1px solid ${a.status === 'published' ? 'rgba(20,184,166,0.15)' : 'rgba(245,158,11,0.2)'}`,
                        color: a.status === 'published' ? 'rgba(20,184,166,0.7)' : '#f59e0b',
                      }}>
                        {a.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                      <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', marginLeft: 'auto' }}>
                        👍 {a.helpful_count}
                      </span>
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
            return (
              <div key={f.feedback_id} style={{
                background: '#0d1f2d', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 10,
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                  {f.helpful ? '👍' : '👎'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(248,250,252,0.8)', marginBottom: 4 }}>
                    {article?.title || f.article_id}
                  </div>
                  {f.comment && (
                    <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.7)', marginBottom: 4, fontStyle: 'italic' }}>
                      &ldquo;{f.comment}&rdquo;
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)' }}>
                    {f.submitted_by} · {formatDate(f.submitted_at)}
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
