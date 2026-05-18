/**
 * BAN-338 Pay Apps v2c — RequiredDocsStatus surface for the Pay App Create
 * / Edit flow. Renders required vs ready checklist computed by
 * /api/pay-apps/[id]/required-docs-status. INFORMATIONAL ONLY — never blocks.
 */

'use client';

import { useEffect, useState } from 'react';

interface StatusItem {
  key: string;
  label: string;
  required: boolean;
  ready: boolean;
  detail: string;
}

interface StatusPayload {
  blocking: boolean;
  items: StatusItem[];
  summary: { required: number; ready: number; missing: number };
  note: string;
}

export default function RequiredDocsStatus({ payAppId }: { payAppId: string }) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payAppId) return;
    fetch(`/api/pay-apps/${encodeURIComponent(payAppId)}/required-docs-status`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json() as Promise<StatusPayload>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [payAppId]);

  if (error) {
    return (
      <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 11 }}>
        Required-docs status unavailable: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <details style={{
      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10,
    }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
        Required Docs Status — {data.summary.ready} of {data.summary.required} ready
        {data.summary.missing > 0 && (
          <span style={{
            marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: '#fef3c7', color: '#92400e',
          }}>
            {data.summary.missing} missing (informational)
          </span>
        )}
      </summary>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.items.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>No required docs configured for this project.</div>
        ) : (
          data.items.map((item) => (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
              padding: '4px 0',
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 4,
                background: item.ready ? '#16a34a' : '#cbd5e1',
                color: 'white', textAlign: 'center', fontSize: 10, lineHeight: '14px', fontWeight: 700,
              }}>
                {item.ready ? '✓' : ''}
              </span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.label}</span>
              <span style={{ color: '#64748b', fontSize: 10 }}>{item.detail}</span>
            </div>
          ))
        )}
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' }}>{data.note}</div>
      </div>
    </details>
  );
}
