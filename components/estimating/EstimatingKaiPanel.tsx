'use client';
import React from 'react';
import type { BidSummary } from '@/components/estimating/EstimatingWorkspace';

interface EstimatingKaiPanelProps {
  bid: BidSummary;
  activeTab: string;
}

const TAB_CONTEXT: Record<string, { title: string; suggestion: string; actions?: string[] }> = {
  overview: {
    title: 'Bid Overview',
    suggestion: 'Upload plans and specs to unlock AI takeoff generation and compliance assessment.',
    actions: ['Upload Plans', 'Upload Specs'],
  },
  carls: {
    title: "Carl's Method",
    suggestion: "Kai can sync from the detailed estimate to pre-fill Carl's Method. Manual overrides are preserved.",
    actions: ['Sync from Estimate', 'Export PDF'],
  },
  takeoff: {
    title: 'Takeoff',
    suggestion: 'Upload architectural plans and Division 08 specs to let Kai auto-generate the full takeoff.',
    actions: ['Generate Takeoff'],
  },
  estimate: {
    title: 'Estimate',
    suggestion: 'Once takeoff is complete, Kai can generate the full estimate with historical cost comparisons.',
    actions: ['Generate Estimate'],
  },
  quotes: {
    title: 'Quotes',
    suggestion: 'Upload vendor quote PDFs and Kai will parse them into the standard coverage matrix.',
    actions: ['Parse Quote PDF'],
  },
  gaps: {
    title: 'Bid Gaps',
    suggestion: 'Kai will auto-populate gaps from spec/drawing analysis. Review and resolve before submitting.',
    actions: ['Auto-populate Gaps'],
  },
  proposal: {
    title: 'Proposal',
    suggestion: 'Once estimate is complete, generate the customer proposal with one click.',
    actions: ['Generate Proposal', 'Generate Carl\'s PDF'],
  },
  gold: {
    title: 'Gold Data',
    suggestion: 'Historical data is read-only during estimating. You can update actuals after project completion.',
  },
};

export default function EstimatingKaiPanel({ bid, activeTab }: EstimatingKaiPanelProps) {
  const ctx = TAB_CONTEXT[activeTab] ?? TAB_CONTEXT.overview;

  const totalEstimate = bid.totalEstimate
    ? (bid.totalEstimate.startsWith('$') ? bid.totalEstimate : `$${bid.totalEstimate}`)
    : null;

  return (
    <div style={{ padding: '0', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Kai Header */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e2e8f0',
        background: 'linear-gradient(135deg, rgba(15,118,110,0.04), rgba(20,184,166,0.02))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>✦</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Kai</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 9,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 999,
            background: 'rgba(20,184,166,0.1)',
            color: '#0f766e',
            border: '1px solid rgba(20,184,166,0.2)',
          }}>
            {ctx.title}
          </span>
        </div>
        <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
          {ctx.suggestion}
        </p>
      </div>

      {/* Compliance Badge */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
          Compliance
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 10,
          background: 'rgba(248,250,252,0.8)',
          border: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: 16 }}>◯</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Not assessed</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Upload specs to enable</div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {ctx.actions && ctx.actions.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            Quick Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ctx.actions.map((action) => (
              <button
                key={action}
                style={{
                  padding: '8px 12px',
                  borderRadius: 9,
                  border: '1px solid rgba(20,184,166,0.25)',
                  background: 'rgba(240,253,250,0.6)',
                  color: '#0f766e',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(20,184,166,0.12)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(240,253,250,0.6)';
                }}
              >
                <span style={{ opacity: 0.6, fontSize: 12 }}>⚡</span>
                {action}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
          Linked Documents
        </div>
        {bid.bidFolderUrl ? (
          <div style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'rgba(240,253,250,0.6)',
            border: '1px solid rgba(20,184,166,0.25)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#0f766e', marginBottom: 4 }}>✓ BID FOLDER</div>
            <a
              href={bid.bidFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 10, color: '#2563eb', fontWeight: 600,
                textDecoration: 'none', wordBreak: 'break-all',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>🔗</span>
              Open Folder ↗
            </a>
          </div>
        ) : (
          <div style={{
            padding: '12px',
            borderRadius: 10,
            background: '#f8fafc',
            border: '1px dashed #e2e8f0',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>No folder linked</div>
            <div style={{ fontSize: 10, color: '#cbd5e1' }}>Use Overview tab to link</div>
          </div>
        )}
      </div>

      {/* Bid Summary */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
          This Bid
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'Version', value: bid.bidVersionId },
            { label: 'Status', value: bid.status },
            { label: 'Total', value: totalEstimate ?? '—' },
            { label: 'Island', value: bid.island ?? '—' },
            { label: 'Estimator', value: bid.estimator ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 11, color: '#374151', fontWeight: 600, textAlign: 'right', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
