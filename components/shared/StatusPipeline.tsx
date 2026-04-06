'use client';
import React, { useState } from 'react';

export interface PipelineStage {
  id: string;
  label: string;
  color?: string;
  /** If true, this is a terminal success state */
  terminal?: 'success' | 'fail';
}

interface StatusPipelineProps {
  stages: PipelineStage[];
  currentStage: string;
  onAdvance?: (toStage: string) => Promise<void> | void;
  readOnly?: boolean;
  size?: 'sm' | 'md';
}

export default function StatusPipeline({
  stages,
  currentStage,
  onAdvance,
  readOnly = false,
  size = 'md',
}: StatusPipelineProps) {
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState<string | null>(null);

  const currentIdx = stages.findIndex(s => s.id === currentStage);

  async function handleClick(stage: PipelineStage, idx: number) {
    if (readOnly || !onAdvance) return;
    if (stage.id === currentStage) return;

    // Require confirmation for advancing
    if (confirmStage === stage.id) {
      setAdvancing(stage.id);
      setConfirmStage(null);
      try {
        await onAdvance(stage.id);
      } finally {
        setAdvancing(null);
      }
    } else {
      setConfirmStage(stage.id);
      // Auto-clear confirm after 3s
      setTimeout(() => setConfirmStage(c => c === stage.id ? null : c), 3000);
    }
  }

  const sm = size === 'sm';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      overflowX: 'auto',
      scrollbarWidth: 'none',
      padding: sm ? '4px 0' : '8px 0',
    }}>
      {stages.map((stage, idx) => {
        const isActive = stage.id === currentStage;
        const isPast = idx < currentIdx;
        const isFuture = idx > currentIdx;
        const isConfirm = confirmStage === stage.id;
        const isAdvancing = advancing === stage.id;

        // Color logic
        let dotColor = '#cbd5e1'; // future
        let textColor = '#94a3b8';
        let lineColor = '#e2e8f0';
        let dotBg = '#f1f5f9';

        if (isPast) {
          dotColor = stage.terminal === 'success' ? '#16a34a' : (stage.color ?? '#14b8a6');
          textColor = '#64748b';
          dotBg = stage.terminal === 'success' ? '#f0fdf4' : 'rgba(20,184,166,0.1)';
          lineColor = stage.color ?? '#14b8a6';
        }
        if (isActive) {
          dotColor = stage.terminal === 'fail' ? '#dc2626' : stage.terminal === 'success' ? '#16a34a' : (stage.color ?? '#14b8a6');
          textColor = dotColor;
          dotBg = stage.terminal === 'fail' ? '#fef2f2' : stage.terminal === 'success' ? '#f0fdf4' : 'rgba(20,184,166,0.15)';
          lineColor = stage.color ?? '#14b8a6';
        }

        const canClick = !readOnly && onAdvance && !isActive && !isAdvancing;

        return (
          <React.Fragment key={stage.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              {/* Dot */}
              <button
                onClick={() => handleClick(stage, idx)}
                disabled={!canClick}
                title={canClick ? (isConfirm ? 'Click again to confirm' : `Move to ${stage.label}`) : undefined}
                style={{
                  width: sm ? 20 : 28,
                  height: sm ? 20 : 28,
                  borderRadius: '50%',
                  border: `2px solid ${dotColor}`,
                  background: isActive ? dotBg : isPast ? dotBg : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: canClick ? 'pointer' : 'default',
                  transition: 'all 0.15s',
                  transform: isActive ? 'scale(1.15)' : isConfirm ? 'scale(1.1)' : 'scale(1)',
                  boxShadow: isActive ? `0 0 0 3px ${dotColor}22` : isConfirm ? `0 0 0 3px ${dotColor}44` : 'none',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                {isAdvancing ? (
                  <span style={{ fontSize: 8, color: dotColor, animation: 'spin 0.8s linear infinite' }}>⟳</span>
                ) : isActive ? (
                  <span style={{
                    width: sm ? 8 : 10,
                    height: sm ? 8 : 10,
                    borderRadius: '50%',
                    background: dotColor,
                    display: 'block',
                  }} />
                ) : isPast ? (
                  <span style={{ fontSize: sm ? 8 : 10, color: dotColor }}>✓</span>
                ) : isConfirm ? (
                  <span style={{ fontSize: 8, color: dotColor }}>?</span>
                ) : null}
              </button>

              {/* Label */}
              <div style={{
                fontSize: sm ? 9 : 10,
                fontWeight: isActive ? 800 : 600,
                color: textColor,
                marginTop: sm ? 3 : 5,
                letterSpacing: '0.01em',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                maxWidth: sm ? 64 : 80,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {isConfirm ? '→ Confirm' : stage.label}
              </div>
            </div>

            {/* Connector line (not after last) */}
            {idx < stages.length - 1 && (
              <div style={{
                height: 2,
                width: sm ? 20 : 32,
                background: isPast || isActive ? lineColor : '#e2e8f0',
                marginBottom: sm ? 16 : 20,
                flexShrink: 0,
                transition: 'background 0.2s',
              }} />
            )}
          </React.Fragment>
        );
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
