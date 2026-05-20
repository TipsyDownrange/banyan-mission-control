/**
 * BAN-328 Closeout Punch List v1 — orchestrator for the ProjectWorkspace
 * punch-list tab. Client component that fetches the aggregator endpoint,
 * renders the summary + filtered items list, and handles the kID-not-in
 * -Postgres empty state per RF4.
 *
 * GC formal signoff banner DEFERRED per BAN-332 (schema column not yet
 * shipped). This surface intentionally does NOT consume that flag.
 *
 * Inline-style hex per RF1.
 */

'use client';

import { useEffect, useState } from 'react';
import PunchListSummaryCard from './PunchListSummaryCard';
import PunchListItemsList from './PunchListItemsList';
import type { PunchListItem } from './PunchListItemDetailCard';

type EngagementRef = {
  engagement_id: string;
  kid: string;
  is_test_project: boolean;
};

type PunchListPayload = {
  kIDFound: boolean;
  engagement: EngagementRef | null;
  items: PunchListItem[];
  summary: {
    total: number;
    by_status: Record<string, number>;
    photos_present_count: number;
  };
};

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; payload: PunchListPayload };

function LoadingState() {
  return (
    <div style={{
      padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-tertiary)', fontSize: 13,
    }}>
      Loading punch list…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12, background: '#fef2f2',
      border: '1px solid rgba(185,28,28,0.2)', color: 'var(--color-red-700)',
      fontSize: 13, fontWeight: 700,
    }}>
      Could not load punch list: {message}
    </div>
  );
}

function NotInPostgresState({ kID }: { kID: string }) {
  return (
    <div style={{
      padding: '48px 28px', textAlign: 'center', background: 'white',
      borderRadius: 18, border: '1px solid var(--color-surface-border)',
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-ink-primary)', marginBottom: 10 }}>
        This project isn&apos;t on the Postgres closeout system yet.
      </div>
      <div style={{
        fontSize: 13, color: 'var(--bos-color-ink-disabled)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6,
      }}>
        Punch list items will appear here once the project is migrated. Reach
        out to Sean if you expect this project to be live.
      </div>
      <div style={{ marginTop: 18, fontSize: 11, color: 'var(--bos-color-ink-tertiary)', fontFamily: 'monospace' }}>
        kID: {kID}
      </div>
    </div>
  );
}

function ZeroItemsState() {
  return (
    <div style={{
      background: 'white', borderRadius: 16, border: '1px solid var(--color-surface-border)',
      padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ink-primary)', marginBottom: 8 }}>
        No punch list items yet
      </div>
      <div style={{ fontSize: 13, color: 'var(--bos-color-ink-tertiary)' }}>
        Items will appear here once they are captured from a walkthrough, field
        issue, GC transmittal, or internal QA review.
      </div>
    </div>
  );
}

function TestProjectPill() {
  return (
    <div style={{ display: 'flex' }}>
      <span style={{
        padding: '4px 12px', borderRadius: 999, fontSize: 10, fontWeight: 800,
        letterSpacing: '0.1em', background: '#fef3c7', color: 'var(--color-amber-800)',
        border: '1px solid #92400e33',
      }}>
        TEST PROJECT
      </span>
    </div>
  );
}

export function PunchListTabView({
  state, kID,
}: { state: ViewState; kID: string }) {
  if (state.kind === 'loading') return <LoadingState />;
  if (state.kind === 'error') return <ErrorState message={state.message} />;

  const { payload } = state;
  if (!payload.kIDFound || payload.engagement === null) {
    return <NotInPostgresState kID={kID} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {payload.engagement.is_test_project && <TestProjectPill />}
      {payload.items.length === 0 ? (
        <>
          <PunchListSummaryCard items={payload.items} />
          <ZeroItemsState />
        </>
      ) : (
        <>
          <PunchListSummaryCard items={payload.items} />
          <PunchListItemsList items={payload.items} />
        </>
      )}
    </div>
  );
}

export default function PunchListTab({ kID }: { kID: string }) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    if (!kID) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch(`/api/closeout/punch-list/by-kid/${encodeURIComponent(kID)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${r.status})`);
        }
        return r.json() as Promise<PunchListPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        setState({ kind: 'ready', payload });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ kind: 'error', message: err.message || 'Failed to load punch list' });
      });
    return () => { cancelled = true; };
  }, [kID]);

  return <PunchListTabView state={state} kID={kID} />;
}
