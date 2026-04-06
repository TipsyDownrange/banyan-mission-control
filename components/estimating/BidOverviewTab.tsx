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
  const [draft, setDraft] = useState({
    projectName: bid.projectName ?? '',
    clientGC: bid.clientGC ?? '',
    island: bid.island ?? 'Maui',
    bidDate: bid.bidDate ?? '',
    estimator: bid.estimator ?? '',
    notes: bid.notes ?? '',
  });

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
    </div>
  );
}
