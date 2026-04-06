'use client';
import React, { useState } from 'react';
import StatusPipeline, { PipelineStage } from '@/components/shared/StatusPipeline';
import type { BidSummary } from '@/components/estimating/EstimatingWorkspace';

interface BidOverviewTabProps {
  bid: BidSummary;
  onBidUpdate: (updates: Partial<BidSummary>) => void;
  onStatusAdvance: (toStage: string) => Promise<void>;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: 'Draft',      label: 'Draft',      color: '#94a3b8' },
  { id: 'In Review',  label: 'In Review',  color: '#3b82f6' },
  { id: 'Submitted',  label: 'Submitted',  color: '#0369a1' },
  { id: 'Won',        label: 'Won',        color: '#16a34a', terminal: 'success' },
  { id: 'Lost',       label: 'Lost',       color: '#dc2626', terminal: 'fail' },
];

const ISLANDS = ['Maui', 'Oahu', 'Kauai', 'Hawaii', 'Molokai', 'Lanai'];
const PROJECT_TYPES = ['Commercial', 'Residential', 'Hospitality', 'Government', 'Healthcare', 'Industrial'];

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid rgba(20,184,166,0.3)',
  borderRadius: 8,
  fontSize: 12,
  color: '#0f172a',
  background: 'rgba(240,253,250,0.5)',
  outline: 'none',
  boxSizing: 'border-box',
};

const READONLY_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
  color: '#64748b',
  background: '#f8fafc',
  boxSizing: 'border-box',
};

function MetricCard({
  label,
  value,
  sub,
  color = '#0f172a',
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: string;
}) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: 16,
      padding: '16px 20px',
      boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
        {icon && <span style={{ marginRight: 5 }}>{icon}</span>}{label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: '#64748b', marginBottom: 4,
    }}>
      {children}
    </div>
  );
}

export default function BidOverviewTab({ bid, onBidUpdate, onStatusAdvance }: BidOverviewTabProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderUrl, setFolderUrl] = useState(bid.bidFolderUrl ?? '');
  const [folderSaving, setFolderSaving] = useState(false);
  const [draft, setDraft] = useState({
    projectName: bid.projectName ?? '',
    clientGC: bid.clientGC ?? '',
    island: bid.island ?? 'Maui',
    bidDate: bid.bidDate ?? '',
    estimator: bid.estimator ?? '',
    notes: bid.notes ?? '',
  });

  function normalizeFolderUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('https://drive.google.com/')) return trimmed;
    // Extract folder ID from a pasted Drive URL fragment
    const match = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/drive/folders/${match[1]}`;
    // If it looks like a bare folder ID (no slashes, min 15 chars)
    if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) {
      return `https://drive.google.com/drive/folders/${trimmed}`;
    }
    return trimmed;
  }

  async function handleLinkFolder() {
    const normalized = normalizeFolderUrl(folderUrl);
    if (!normalized) return;
    setFolderSaving(true);
    try {
      await fetch(`/api/estimating/bids/${bid.bidVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_folder_url: normalized }),
      });
      onBidUpdate({ bidFolderUrl: normalized });
      setFolderUrl(normalized);
      setShowFolderModal(false);
    } catch (err) {
      console.error('Folder link failed', err);
    } finally {
      setFolderSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/estimating/bids/${bid.bidVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      onBidUpdate(draft);
      setEditing(false);
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  }

  // Derived metrics
  const totalEstimate = bid.totalEstimate
    ? (bid.totalEstimate.startsWith('$') ? bid.totalEstimate : `$${bid.totalEstimate}`)
    : '—';

  const daysUntil = bid.bidDate
    ? Math.ceil((new Date(bid.bidDate).getTime() - Date.now()) / 86400000)
    : null;

  const dueDaysText = daysUntil === null ? '—'
    : daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue`
    : daysUntil === 0 ? 'Today!'
    : `${daysUntil}d`;

  const dueDaysColor = daysUntil !== null && daysUntil <= 0 ? '#dc2626'
    : daysUntil !== null && daysUntil <= 3 ? '#ea580c'
    : '#0f172a';

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960 }}>

      {/* Pipeline */}
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '16px 24px',
        marginBottom: 20,
        boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 10 }}>
          Bid Status
        </div>
        <StatusPipeline
          stages={PIPELINE_STAGES}
          currentStage={bid.status}
          onAdvance={onStatusAdvance}
        />
      </div>

      {/* Key Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <MetricCard
          label="Total Estimate"
          value={totalEstimate}
          sub="Base bid"
          icon="💰"
          color="#0f766e"
        />
        <MetricCard
          label="Open Gaps"
          value="—"
          sub="Phase 4"
          icon="⚠️"
          color="#ea580c"
        />
        <MetricCard
          label="Quote Coverage"
          value="—"
          sub="Phase 4"
          icon="📩"
          color="#2563eb"
        />
        <MetricCard
          label="Days Until Due"
          value={dueDaysText}
          sub={bid.bidDate ?? ''}
          icon="📅"
          color={dueDaysColor}
        />
      </div>

      {/* Bid Header */}
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
        marginBottom: 20,
      }}>
        {/* Header */}
        <div style={{
          background: '#0f172a',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.8)' }}>
            Bid Header
          </div>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            disabled={saving}
            style={{
              padding: '5px 14px',
              borderRadius: 8,
              border: 'none',
              background: editing ? 'linear-gradient(135deg, #0f766e, #14b8a6)' : 'rgba(255,255,255,0.08)',
              color: editing ? 'white' : 'rgba(148,163,184,0.8)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : '✎ Edit'}
          </button>
          {editing && (
            <button
              onClick={() => {
                setEditing(false);
                setDraft({
                  projectName: bid.projectName ?? '',
                  clientGC: bid.clientGC ?? '',
                  island: bid.island ?? 'Maui',
                  bidDate: bid.bidDate ?? '',
                  estimator: bid.estimator ?? '',
                  notes: bid.notes ?? '',
                });
              }}
              style={{
                padding: '5px 10px',
                borderRadius: 8,
                border: 'none',
                background: 'rgba(239,68,68,0.15)',
                color: '#ef4444',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                marginLeft: 8,
              }}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Fields */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {/* Project Name */}
            <div style={{ gridColumn: 'span 2' }}>
              <FieldLabel>Project Name</FieldLabel>
              {editing ? (
                <input
                  style={FIELD_STYLE}
                  value={draft.projectName}
                  onChange={e => setDraft(p => ({ ...p, projectName: e.target.value }))}
                />
              ) : (
                <div style={READONLY_STYLE}>{bid.projectName || '—'}</div>
              )}
            </div>

            {/* Client/GC */}
            <div>
              <FieldLabel>Client / GC</FieldLabel>
              {editing ? (
                <input
                  style={FIELD_STYLE}
                  value={draft.clientGC}
                  onChange={e => setDraft(p => ({ ...p, clientGC: e.target.value }))}
                  placeholder="Hawaiian Dredging, Hensel Phelps..."
                />
              ) : (
                <div style={READONLY_STYLE}>{bid.clientGC || '—'}</div>
              )}
            </div>

            {/* Island */}
            <div>
              <FieldLabel>Island</FieldLabel>
              {editing ? (
                <select
                  style={{ ...FIELD_STYLE, appearance: 'auto' }}
                  value={draft.island}
                  onChange={e => setDraft(p => ({ ...p, island: e.target.value }))}
                >
                  {ISLANDS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              ) : (
                <div style={READONLY_STYLE}>{bid.island || '—'}</div>
              )}
            </div>

            {/* Bid Date */}
            <div>
              <FieldLabel>Bid Due Date</FieldLabel>
              {editing ? (
                <input
                  type="date"
                  style={FIELD_STYLE}
                  value={draft.bidDate}
                  onChange={e => setDraft(p => ({ ...p, bidDate: e.target.value }))}
                />
              ) : (
                <div style={READONLY_STYLE}>{bid.bidDate || '—'}</div>
              )}
            </div>

            {/* Estimator */}
            <div>
              <FieldLabel>Estimator</FieldLabel>
              {editing ? (
                <input
                  style={FIELD_STYLE}
                  value={draft.estimator}
                  onChange={e => setDraft(p => ({ ...p, estimator: e.target.value }))}
                  placeholder="Kyle Shimizu, Jody Daniels..."
                />
              ) : (
                <div style={READONLY_STYLE}>{bid.estimator || '—'}</div>
              )}
            </div>

            {/* Bid Version ID (read-only) */}
            <div>
              <FieldLabel>Bid Version ID</FieldLabel>
              <div style={{ ...READONLY_STYLE, fontFamily: 'monospace', fontSize: 11 }}>
                {bid.bidVersionId}
              </div>
            </div>

            {/* Notes */}
            <div style={{ gridColumn: 'span 2' }}>
              <FieldLabel>Notes</FieldLabel>
              {editing ? (
                <textarea
                  rows={3}
                  style={{ ...FIELD_STYLE, resize: 'vertical' }}
                  value={draft.notes}
                  onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Any important notes about this bid..."
                />
              ) : (
                <div style={{ ...READONLY_STYLE, minHeight: 60, whiteSpace: 'pre-wrap' }}>
                  {bid.notes || '—'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Kai Summary placeholder */}
      <div style={{
        background: 'white',
        border: '1px solid rgba(20,184,166,0.2)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(20,184,166,0.06))',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(20,184,166,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f766e' }}>
            Kai Bid Assessment
          </span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(20,184,166,0.1)',
            color: '#0f766e',
            border: '1px solid rgba(20,184,166,0.2)',
          }}>
            Phase 5
          </span>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>
            Kai&apos;s intelligent bid assessment will appear here in Phase 5, after plans and specs are uploaded.
            It will summarize key compliance risks, labor friction factors, recommended fabrication method,
            and estimated cost range — all in plain language.
          </p>
          <div style={{
            marginTop: 16,
            padding: '12px 16px',
            background: 'rgba(240,253,250,0.5)',
            border: '1px dashed rgba(20,184,166,0.3)',
            borderRadius: 10,
            fontSize: 12,
            color: '#0f766e',
            fontStyle: 'italic',
          }}>
            &ldquo;This is a [project type] on [island] with [N] glazing systems. Key concerns: [compliance flags]. 
            Recommended method: [method]. Total estimate: [range].&rdquo;
          </div>
        </div>
      </div>

      {/* Bid Folder Card */}
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
        marginTop: 20,
      }}>
        <div style={{
          background: '#0f172a',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>📁</span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(148,163,184,0.8)' }}>
              Bid Folder
            </span>
            {(bid.bidFolderUrl || folderUrl) && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: 'rgba(21,128,61,0.2)', color: '#16a34a',
                border: '1px solid rgba(21,128,61,0.3)',
              }}>✓ Linked</span>
            )}
          </div>
          <button
            onClick={() => setShowFolderModal(true)}
            style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.8)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {(bid.bidFolderUrl || folderUrl) ? '✎ Change' : '+ Link Folder'}
          </button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {(bid.bidFolderUrl || folderUrl) ? (
            <a
              href={bid.bidFolderUrl || folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: '#2563eb', fontWeight: 600,
                textDecoration: 'none', wordBreak: 'break-all',
              }}
            >
              <span style={{ fontSize: 14 }}>🔗</span>
              {bid.bidFolderUrl || folderUrl}
            </a>
          ) : (
            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
              Link a Google Drive folder to keep plans, specs, and quotes organized.
            </div>
          )}
        </div>
      </div>

      {/* Link Folder Modal */}
      {showFolderModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15,23,42,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowFolderModal(false)}>
          <div
            style={{
              background: 'white', borderRadius: 20, padding: 32,
              width: '90%', maxWidth: 480, boxShadow: '0 24px 64px rgba(15,23,42,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              📁 Link Bid Folder
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Link the Google Drive folder for this bid. Plans, specs, quotes, and submittals should live here.
            </p>

            {/* Browse Drive button */}
            <a
              href="https://drive.google.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid rgba(37,99,235,0.35)',
                background: 'rgba(239,246,255,0.7)',
                color: '#1d4ed8', fontSize: 12, fontWeight: 700,
                textDecoration: 'none', marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 16 }}>🗂️</span>
              <div>
                <div>Browse Google Drive →</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: '#60a5fa', marginTop: 1 }}>
                  Navigate to the folder, then copy the URL from your browser and paste below
                </div>
              </div>
            </a>

            <label style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', display: 'block', marginBottom: 6 }}>
              Folder URL or ID
            </label>
            <input
              type="text"
              placeholder="Paste URL or folder ID from Drive..."
              value={folderUrl}
              onChange={e => setFolderUrl(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10,
                border: '1.5px solid rgba(20,184,166,0.4)',
                fontSize: 12, color: '#0f172a',
                background: 'rgba(240,253,250,0.4)',
                outline: 'none', boxSizing: 'border-box',
                marginBottom: 6,
              }}
              autoFocus
            />
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 20 }}>
              Accepts full Drive URLs or bare folder IDs — we&apos;ll detect both automatically.
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowFolderModal(false)}
                style={{
                  padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
                  background: 'white', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLinkFolder}
                disabled={folderSaving || !folderUrl.trim()}
                style={{
                  padding: '9px 20px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #0f766e, #14b8a6)',
                  color: 'white', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  opacity: (!folderUrl.trim()) ? 0.5 : 1,
                }}
              >
                {folderSaving ? 'Saving...' : '✓ Link Folder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
