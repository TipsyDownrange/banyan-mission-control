/**
 * BAN-322 Pay Apps v1 — orchestrator for the ProjectWorkspace pay-apps tab.
 *
 * Client component that fetches the aggregator endpoint, renders the four
 * leaf components, and handles the kID-not-in-Postgres empty state per RF4.
 * TEST PROJECT pill (RF3) shows when engagement.is_test_project is true.
 *
 * Inline-style hex per RF1.
 */

'use client';

import { useEffect, useState } from 'react';
import PayAppsList, { type PayApp } from './PayAppsList';
import SOVSummaryCard, { type SovLine, type SovVersion } from './SOVSummaryCard';
import RetainagePanel, { type RetainageHolding } from './RetainagePanel';
import NotarizationStatusIndicator, {
  type NotarizationSession,
} from './NotarizationStatusIndicator';

type EngagementRef = {
  engagement_id: string;
  kid: string;
  status: string;
  engagement_type: string;
  pm_handoff_state: string;
  is_test_project: boolean;
};

type BillingFormatConfig = {
  notarization_required: boolean;
};

type BillingPayload = {
  engagement: EngagementRef | null;
  payApps: PayApp[];
  sovVersions: SovVersion[];
  sovLines: SovLine[];
  retainage: RetainageHolding[];
  latestNotarization: NotarizationSession | null;
  billingFormatConfig: BillingFormatConfig | null;
  activeSovVersionId?: string | null;
};

export default function PayAppsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<BillingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kID) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/aia/billing/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json() as Promise<BillingPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load billing data');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [kID]);

  if (loading) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13,
      }}>
        Loading pay applications…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12, background: '#fef2f2',
        border: '1px solid rgba(185,28,28,0.2)', color: '#b91c1c',
        fontSize: 13, fontWeight: 700,
      }}>
        Could not load pay apps: {error}
      </div>
    );
  }

  if (!data) return null;

  if (data.engagement === null) {
    return (
      <div style={{
        padding: '48px 28px', textAlign: 'center', background: 'white',
        borderRadius: 18, border: '1px solid #e2e8f0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
          This project isn&apos;t on the Postgres billing system yet.
        </div>
        <div style={{
          fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
        }}>
          Pay applications, SOV, and retainage data will appear here once the
          project is migrated. Reach out to Sean if you expect this project to
          be live.
        </div>
        <div style={{ marginTop: 18, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
          kID: {kID}
        </div>
      </div>
    );
  }

  const notarizationRequired = data.billingFormatConfig?.notarization_required === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.engagement.is_test_project && (
        <div style={{ display: 'flex' }}>
          <span style={{
            padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 800,
            letterSpacing: '0.1em', background: '#fef3c7', color: '#92400e',
            border: '1px solid #92400e33',
          }}>
            TEST PROJECT
          </span>
        </div>
      )}

      <SOVSummaryCard
        sovVersions={data.sovVersions}
        sovLines={data.sovLines}
        payApps={data.payApps}
        activeSovVersionId={data.activeSovVersionId ?? null}
      />

      <NotarizationStatusIndicator
        latestNotarization={data.latestNotarization}
        notarizationRequired={notarizationRequired}
      />

      <PayAppsList payApps={data.payApps} />

      <RetainagePanel retainage={data.retainage} />
    </div>
  );
}
