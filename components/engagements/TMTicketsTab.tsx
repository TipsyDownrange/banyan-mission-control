/**
 * BAN-329 T&M Tickets v1 — orchestrator for the ProjectWorkspace tm-tickets tab.
 *
 * Client component that fetches the aggregator endpoint, renders the
 * summary + list, and handles the kID-not-in-Postgres empty state per RF4.
 * TEST PROJECT pill (RF3) shows when engagement.is_test_project is true.
 * Mirrors components/engagements/PayAppsTab.tsx (BAN-322).
 *
 * Inline-style hex per RF1.
 */

'use client';

import { useEffect, useState } from 'react';
import type { TmTicketState } from '@/lib/aia/state-transitions';
import TMTicketsSummaryCard from './TMTicketsSummaryCard';
import TMTicketsList, { type TMTicket } from './TMTicketsList';

type EngagementRef = {
  engagement_id: string;
  kid: string;
  status: string;
  engagement_type: string;
  pm_handoff_state: string;
  is_test_project: boolean;
};

type TMTicketsPayload = {
  kIDFound: boolean;
  engagement: EngagementRef | null;
  tickets: TMTicket[];
  summary: {
    total_count: number;
    by_state: Record<TmTicketState, number>;
    total_value_usd: number;
    billed_value_usd: number;
    unbilled_value_usd: number;
  } | null;
};

export default function TMTicketsTab({ kID }: { kID: string }) {
  const [data, setData] = useState<TMTicketsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!kID) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/aia/tm-tickets/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json() as Promise<TMTicketsPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load T&M tickets');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [kID]);

  if (loading) {
    return (
      <div
        data-testid="tm-tickets-loading"
        style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}
      >
        Loading T&amp;M tickets…
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-testid="tm-tickets-error"
        style={{
          padding: '16px 20px', borderRadius: 12, background: '#fef2f2',
          border: '1px solid rgba(185,28,28,0.2)', color: '#b91c1c',
          fontSize: 13, fontWeight: 700,
        }}
      >
        Could not load T&amp;M tickets: {error}
      </div>
    );
  }

  if (!data) return null;

  if (!data.kIDFound || data.engagement === null) {
    return (
      <div
        data-testid="tm-tickets-no-engagement"
        style={{
          padding: '48px 28px', textAlign: 'center', background: 'white',
          borderRadius: 18, border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
          This project isn&apos;t on the Postgres billing system yet.
        </div>
        <div style={{
          fontSize: 13, color: '#64748b', maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
        }}>
          T&amp;M tickets, authorizations, and labor breakdowns will appear
          here once the project is migrated. Reach out to Sean if you expect
          this project to be live.
        </div>
        <div style={{ marginTop: 18, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
          kID: {kID}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {data.engagement.is_test_project && (
        <div style={{ display: 'flex' }}>
          <span
            data-testid="tm-test-project-pill"
            style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 800,
              letterSpacing: '0.1em', background: '#fef3c7', color: '#92400e',
              border: '1px solid #92400e33',
            }}
          >
            TEST PROJECT
          </span>
        </div>
      )}

      <TMTicketsSummaryCard tickets={data.tickets} summary={data.summary} />
      <TMTicketsList tickets={data.tickets} />
    </div>
  );
}
