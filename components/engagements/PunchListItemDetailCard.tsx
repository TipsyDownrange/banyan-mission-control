/**
 * BAN-328 Closeout Punch List v1 — single-item detail card.
 *
 * Collapsible. Collapsed by default for terminal states (COMPLETED,
 * SIGNED_OFF, DEFERRED_TO_WARRANTY); expanded for in-progress states.
 * Read-only — surfaces description, location, category, responsible_party,
 * assigned_to, photo gallery (Drive ID list), completion/signoff evidence,
 * and dispute reason+resolution.
 *
 * Schema reality (db/schema.ts:1172): PK is punch_item_id, photo_evidence
 * is text[] of Drive IDs (not jsonb), location/completion_evidence/
 * signoff_evidence/dispute_resolution are jsonb, responsible_party is a
 * 4-value enum (KULA | OTHER_TRADE | GC | DISPUTED).
 */

'use client';

import { useState, type CSSProperties } from 'react';
import PunchListStatusBadge, { type PunchListItemStatus } from './PunchListStatusBadge';

export type PunchListItem = {
  punch_item_id: string;
  item_number: number;
  source: string;
  source_ref: string | null;
  description: string;
  location: Record<string, unknown> | null;
  category: string;
  responsible_party: string;
  photos_required: boolean;
  photo_evidence: string[];
  assigned_to: string | null;
  due_date: string | null;
  status: PunchListItemStatus | string;
  completion_evidence: Record<string, unknown> | null;
  signoff_evidence: Record<string, unknown> | null;
  dispute_reason: string | null;
  dispute_resolution: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

const TERMINAL_STATUSES = new Set(['COMPLETED', 'SIGNED_OFF', 'DEFERRED_TO_WARRANTY']);

const SOURCE_LABEL: Record<string, string> = {
  FIELD_ISSUE: 'Field issue',
  SUBSTANTIAL_WALKTHROUGH: 'Substantial walkthrough',
  GC_TRANSMITTAL: 'GC transmittal',
  OWNER_WALKTHROUGH: 'Owner walkthrough',
  ARCHITECT_WALKTHROUGH: 'Architect walkthrough',
  INTERNAL_QA: 'Internal QA',
};

const CATEGORY_LABEL: Record<string, string> = {
  GLASS: 'Glass',
  FRAMING: 'Framing',
  HARDWARE: 'Hardware',
  SEALANT: 'Sealant',
  FINISH: 'Finish',
  CLEANING: 'Cleaning',
  DOCUMENTATION: 'Documentation',
  OTHER: 'Other',
};

const RESPONSIBLE_LABEL: Record<string, string> = {
  KULA: 'Kula',
  OTHER_TRADE: 'Other trade',
  GC: 'GC',
  DISPUTED: 'Disputed',
};

const CARD: CSSProperties = {
  background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
};

const HEADER: CSSProperties = {
  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
  cursor: 'pointer', userSelect: 'none',
};

const BODY: CSSProperties = {
  padding: '0 16px 14px 16px', borderTop: '1px solid #f1f5f9',
  display: 'flex', flexDirection: 'column', gap: 10,
};

const ROW_LABEL: CSSProperties = {
  fontSize: 10, fontWeight: 800, color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};

const ROW_VALUE: CSSProperties = {
  fontSize: 13, color: '#0f172a', marginTop: 2,
};

function locationLabel(loc: Record<string, unknown> | null | undefined): string {
  if (!loc || typeof loc !== 'object') return '—';
  const parts: string[] = [];
  for (const k of ['floor', 'room', 'elevation', 'opening', 'detail']) {
    const v = (loc as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim().length > 0) parts.push(`${k}: ${v}`);
  }
  if (parts.length === 0) {
    try { return JSON.stringify(loc); } catch { return '—'; }
  }
  return parts.join(' · ');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

export default function PunchListItemDetailCard({ item }: { item: PunchListItem }) {
  const startCollapsed = TERMINAL_STATUSES.has(String(item.status));
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const expanded = !collapsed;

  return (
    <div style={CARD} data-punch-item-id={item.punch_item_id}>
      <div
        style={HEADER}
        onClick={() => setCollapsed((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#0f766e', letterSpacing: '0.05em',
          minWidth: 44, textAlign: 'right',
        }}>
          #{item.item_number}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: '#0f172a',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {item.description}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            {SOURCE_LABEL[item.source] ?? item.source}
            {item.source_ref ? ` · ${item.source_ref}` : ''}
          </div>
        </div>
        <PunchListStatusBadge status={item.status} />
        <span style={{
          fontSize: 11, color: '#94a3b8', fontWeight: 700, minWidth: 16, textAlign: 'center',
        }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {expanded && (
        <div style={BODY}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={ROW_LABEL}>Location</div>
              <div style={ROW_VALUE}>{locationLabel(item.location)}</div>
            </div>
            <div>
              <div style={ROW_LABEL}>Category</div>
              <div style={ROW_VALUE}>{CATEGORY_LABEL[item.category] ?? item.category}</div>
            </div>
            <div>
              <div style={ROW_LABEL}>Responsible party</div>
              <div style={ROW_VALUE}>{RESPONSIBLE_LABEL[item.responsible_party] ?? item.responsible_party}</div>
            </div>
            <div>
              <div style={ROW_LABEL}>Assigned to</div>
              <div style={ROW_VALUE}>
                {item.assigned_to
                  ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.assigned_to.slice(0, 8)}</span>
                  : '—'}
              </div>
            </div>
            <div>
              <div style={ROW_LABEL}>Due date</div>
              <div style={ROW_VALUE}>{fmtDate(item.due_date)}</div>
            </div>
            <div>
              <div style={ROW_LABEL}>Photos required</div>
              <div style={ROW_VALUE}>{item.photos_required ? 'Yes' : 'No'}</div>
            </div>
          </div>

          <div>
            <div style={ROW_LABEL}>Photo evidence ({item.photo_evidence.length})</div>
            {item.photo_evidence.length === 0 ? (
              <div style={{ ...ROW_VALUE, color: '#94a3b8', fontStyle: 'italic' }}>
                No photos uploaded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {item.photo_evidence.map((driveId) => (
                  <a
                    key={driveId}
                    href={`https://drive.google.com/file/d/${driveId}/view`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '4px 10px', borderRadius: 8,
                      background: '#f0fdfa', color: '#0f766e',
                      fontFamily: 'monospace', fontSize: 11, fontWeight: 700,
                      textDecoration: 'none', border: '1px solid #0f766e22',
                    }}
                  >
                    {driveId.slice(0, 10)}
                  </a>
                ))}
              </div>
            )}
          </div>

          {item.completion_evidence && Object.keys(item.completion_evidence).length > 0 && (
            <div>
              <div style={ROW_LABEL}>Completion evidence</div>
              <pre style={{
                ...ROW_VALUE, background: '#f8fafc', padding: '8px 10px', borderRadius: 8,
                fontSize: 11, overflowX: 'auto', margin: '4px 0 0 0',
              }}>
                {JSON.stringify(item.completion_evidence, null, 2)}
              </pre>
            </div>
          )}

          {item.signoff_evidence && Object.keys(item.signoff_evidence).length > 0 && (
            <div>
              <div style={ROW_LABEL}>Signoff evidence</div>
              <pre style={{
                ...ROW_VALUE, background: '#f8fafc', padding: '8px 10px', borderRadius: 8,
                fontSize: 11, overflowX: 'auto', margin: '4px 0 0 0',
              }}>
                {JSON.stringify(item.signoff_evidence, null, 2)}
              </pre>
            </div>
          )}

          {item.status === 'DISPUTED' && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: '#fef2f2', border: '1px solid #b91c1c33',
            }}>
              <div style={{ ...ROW_LABEL, color: '#b91c1c' }}>Dispute</div>
              <div style={ROW_VALUE}>
                {item.dispute_reason || '— no reason provided —'}
              </div>
              {item.dispute_resolution && Object.keys(item.dispute_resolution).length > 0 && (
                <pre style={{
                  fontSize: 11, background: 'white', padding: '6px 8px',
                  borderRadius: 6, marginTop: 6, overflowX: 'auto',
                }}>
                  {JSON.stringify(item.dispute_resolution, null, 2)}
                </pre>
              )}
            </div>
          )}

          {item.status === 'DEFERRED_TO_WARRANTY' && (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: '#faf5ff', border: '1px solid #7e22ce33',
            }}>
              <div style={{ ...ROW_LABEL, color: '#7e22ce' }}>Deferred to warranty</div>
              <div style={ROW_VALUE}>
                Resolution moved to the warranty registry; this item is closed
                for closeout purposes.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
