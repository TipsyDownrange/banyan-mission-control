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

import { useCallback, useEffect, useState } from 'react';
import PayAppsList, { type PayApp } from './PayAppsList';
import SOVSummaryCard, { type SovLine, type SovVersion } from './SOVSummaryCard';
import RetainagePanel, { type RetainageHolding } from './RetainagePanel';
import NotarizationStatusIndicator, {
  type NotarizationSession,
} from './NotarizationStatusIndicator';
import PayAppEditScreen from './PayAppEditScreen';
// BAN-338 v2c — new sub-sections mounted below the existing v2a/v2b stack
import LienWaiverTracker from './LienWaiverTracker';
import JointCheckAgreementsSection from './JointCheckAgreementsSection';
import ExternalWaiverRequestsSection from './ExternalWaiverRequestsSection';
import GCRequiredDocsChecklist from './GCRequiredDocsChecklist';

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
  const [editingPayAppId, setEditingPayAppId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!kID) return Promise.resolve();
    setLoading(true);
    setError(null);
    return fetch(`/api/aia/billing/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json() as Promise<BillingPayload>;
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load billing data');
        setLoading(false);
      });
  }, [kID]);

  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [refresh]);

  if (loading) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 13,
      }}>
        Loading pay applications…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '16px 20px', borderRadius: 12, background: '#fef2f2',
        border: '1px solid rgba(185,28,28,0.2)', color: 'var(--color-red-700)',
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
        borderRadius: 18, border: '1px solid var(--color-surface-border)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)', marginBottom: 10 }}>
          This project isn&apos;t on the Postgres billing system yet.
        </div>
        <div style={{
          fontSize: 13, color: 'var(--bos-color-ink-disabled)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
        }}>
          Pay applications, SOV, and retainage data will appear here once the
          project is migrated. Reach out to Sean if you expect this project to
          be live.
        </div>
        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontFamily: 'monospace' }}>
          kID: {kID}
        </div>
      </div>
    );
  }

  const notarizationRequired = data.billingFormatConfig?.notarization_required === true;
  const lockedVersion = data.sovVersions.find((v) => v.state === 'LOCKED') ?? null;

  if (editingPayAppId) {
    return (
      <PayAppEditScreen
        payAppId={editingPayAppId}
        onClose={() => {
          setEditingPayAppId(null);
          void refresh();
        }}
      />
    );
  }

  async function createNewPayApp() {
    if (!data?.engagement || !lockedVersion) return;
    setCreating(true);
    setCreateError(null);
    try {
      const today = new Date();
      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
      const res = await fetch('/api/pay-apps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          engagement_id: data.engagement.engagement_id,
          sov_version_id: lockedVersion.sov_version_id,
          period_start: periodStart,
          period_end: periodEnd,
          billing_format: 'AIA_G702_G703',
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCreateError(body.error ?? `Create failed (${res.status})`);
        return;
      }
      await refresh();
      setEditingPayAppId(body.pay_app_id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setCreating(false);
    }
  }

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

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        {createError && (
          <span style={{ fontSize: 12, color: 'var(--color-red-700)' }}>{createError}</span>
        )}
        <button
          onClick={createNewPayApp}
          disabled={!lockedVersion || creating}
          title={lockedVersion ? 'Create a new pay application from the locked SOV' : 'SOV must be LOCKED before creating a pay app'}
          style={{
            background: lockedVersion ? '#0c2330' : '#cbd5e1',
            color: '#fff', border: 'none', padding: '10px 18px',
            borderRadius: 10, fontSize: 12, fontWeight: 700,
            cursor: lockedVersion && !creating ? 'pointer' : 'not-allowed',
          }}
        >
          {creating ? 'Creating…' : '+ New Pay App'}
        </button>
      </div>

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

      <PayAppsList payApps={data.payApps} onOpen={(id) => setEditingPayAppId(id)} />

      <RetainagePanel retainage={data.retainage} />

      {/* BAN-338 v2c — lien waivers, joint check, external waivers, GC docs */}
      <LienWaiverTracker kID={kID} />
      <JointCheckAgreementsSection kID={kID} />
      <ExternalWaiverRequestsSection kID={kID} />
      <GCRequiredDocsChecklist kID={kID} />
    </div>
  );
}
