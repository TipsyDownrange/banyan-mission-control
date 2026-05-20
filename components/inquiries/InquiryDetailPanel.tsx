'use client';

/**
 * BAN-376 Customer Pipeline — Inquiry detail + actions sidebar (spec §7.3).
 *
 * Renders the full inquiry record and exposes the four operator actions:
 *   - Transition state (NEW → IN_DISCUSSION → QUOTED → AWARDED, plus
 *     LOST / DEFERRED / re-activation)
 *   - Assign to user (role + user_id)
 *   - Promote to Project   (creates engagements row + back-link)
 *   - Promote to Work Order (records SRV-YY-NNNN, no Postgres WO row)
 *
 * For testability the component accepts optional onAction handlers that
 * mock out the fetch layer.  In production the defaults call the
 * /api/inquiries/[id]/... routes.
 */

import { useState } from 'react';

export type InquiryDetail = {
  inquiry_id: string;
  inquiry_number: string;
  source: string;
  source_detail: string | null;
  customer_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  inquiry_type_initial: string;
  estimated_value_band: string;
  inquiry_description: string | null;
  inquiry_location: string | null;
  assigned_to_user_id: string | null;
  assigned_role: string | null;
  state: string;
  state_reason: string | null;
  conversion_event: string | null;
  converted_to_project_id: string | null;
  converted_to_work_order_id: string | null;
  notes: string | null;
  is_test_project: boolean;
  created_at: string;
};

export const TRANSITION_TARGETS = ['IN_DISCUSSION', 'QUOTED', 'AWARDED', 'LOST', 'DEFERRED'] as const;
export const CONVERSION_EVENTS = ['SIGNED_PROPOSAL', 'VERBAL_GO_AHEAD', 'DOWN_PAYMENT', 'PURCHASE_ORDER', 'CONTRACT', 'NOTICE_TO_PROCEED', 'EMAIL_AWARD', 'OTHER'] as const;

type Actions = {
  onTransition?: (toState: string, opts: { conversion_event?: string; reason?: string }) => Promise<void>;
  onAssign?: (assignedToUserId: string, assignedRole: string | null) => Promise<void>;
  onConvertToProject?: (engagementId: string, reason?: string) => Promise<void>;
  onConvertToWorkOrder?: (workOrderId: string, reason?: string) => Promise<void>;
};

type Props = {
  inquiry: InquiryDetail;
  onClose?: () => void;
  actions?: Actions;
};

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
}

export default function InquiryDetailPanel({ inquiry, onClose, actions }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transitionTo, setTransitionTo] = useState<string>(TRANSITION_TARGETS[0]);
  const [conversionEvent, setConversionEvent] = useState<string>(CONVERSION_EVENTS[0]);
  const [reason, setReason] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState(inquiry.assigned_to_user_id ?? '');
  const [assignedRole, setAssignedRole] = useState<string>(inquiry.assigned_role ?? '');
  const [engagementId, setEngagementId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');

  const isTerminal = inquiry.state === 'LOST' || inquiry.state === 'CONVERTED';

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function defaultTransition(toState: string, opts: { conversion_event?: string; reason?: string }) {
    await postJson(`/api/inquiries/${inquiry.inquiry_id}/transition`, { to_state: toState, ...opts });
  }

  async function defaultAssign(userId: string, role: string | null) {
    await postJson(`/api/inquiries/${inquiry.inquiry_id}/assign`, {
      assigned_to_user_id: userId,
      assigned_role: role,
    });
  }

  async function defaultConvertProject(id: string, r?: string) {
    await postJson(`/api/inquiries/${inquiry.inquiry_id}/convert-to-project`, { engagement_id: id, reason: r });
  }

  async function defaultConvertWO(id: string, r?: string) {
    await postJson(`/api/inquiries/${inquiry.inquiry_id}/convert-to-work-order`, { work_order_id: id, reason: r });
  }

  return (
    <aside aria-label="Inquiry detail" style={{ borderLeft: '1px solid #cbd5e1', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{inquiry.inquiry_number}</h3>
        {onClose && <button onClick={onClose} aria-label="Close detail">×</button>}
      </header>

      <dl style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 4, fontSize: 12, margin: 0 }}>
        <dt>State</dt><dd data-testid="state-value">{inquiry.state}</dd>
        <dt>Source</dt><dd>{inquiry.source}{inquiry.source_detail ? ` — ${inquiry.source_detail}` : ''}</dd>
        <dt>Customer</dt><dd>{inquiry.customer_name}</dd>
        <dt>Email</dt><dd>{inquiry.contact_email || '—'}</dd>
        <dt>Phone</dt><dd>{inquiry.contact_phone || '—'}</dd>
        <dt>Type</dt><dd>{inquiry.inquiry_type_initial}</dd>
        <dt>Value</dt><dd>{inquiry.estimated_value_band}</dd>
        <dt>Description</dt><dd>{inquiry.inquiry_description || '—'}</dd>
        <dt>Assigned</dt><dd>{inquiry.assigned_role || '—'} {inquiry.assigned_to_user_id ? `(${inquiry.assigned_to_user_id})` : ''}</dd>
        {inquiry.converted_to_project_id && (<><dt>→ Project</dt><dd>{inquiry.converted_to_project_id}</dd></>)}
        {inquiry.converted_to_work_order_id && (<><dt>→ WO</dt><dd>{inquiry.converted_to_work_order_id}</dd></>)}
      </dl>

      {error && <div role="alert" style={{ color: 'var(--color-red-700)', fontSize: 12 }}>{error}</div>}

      {!isTerminal && (
        <section aria-label="Transition state" style={{ borderTop: '1px solid var(--color-surface-border)', paddingTop: 8 }}>
          <h4 style={{ fontSize: 13, margin: 0, marginBottom: 6 }}>Transition state</h4>
          <select aria-label="Target state" value={transitionTo} onChange={e => setTransitionTo(e.target.value)} style={{ padding: 4 }}>
            {TRANSITION_TARGETS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {transitionTo === 'AWARDED' && (
            <select aria-label="Conversion event" value={conversionEvent} onChange={e => setConversionEvent(e.target.value)} style={{ padding: 4, marginLeft: 6 }}>
              {CONVERSION_EVENTS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <input aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} style={{ marginLeft: 6, padding: 4 }} />
          <button
            disabled={busy === 'transition'}
            onClick={() => run('transition', () => (actions?.onTransition ?? defaultTransition)(transitionTo, {
              conversion_event: transitionTo === 'AWARDED' ? conversionEvent : undefined,
              reason: reason || undefined,
            }))}
            style={{ marginLeft: 6, padding: '4px 10px' }}
          >
            Transition
          </button>
        </section>
      )}

      {!isTerminal && (
        <section aria-label="Assign" style={{ borderTop: '1px solid var(--color-surface-border)', paddingTop: 8 }}>
          <h4 style={{ fontSize: 13, margin: 0, marginBottom: 6 }}>Assign</h4>
          <input aria-label="Assignee user id" placeholder="user id" value={assignedToUserId} onChange={e => setAssignedToUserId(e.target.value)} style={{ padding: 4 }} />
          <select aria-label="Assignee role" value={assignedRole} onChange={e => setAssignedRole(e.target.value)} style={{ padding: 4, marginLeft: 6 }}>
            <option value="">— role —</option>
            <option value="PM">PM</option>
            <option value="SERVICE_PM">SERVICE_PM</option>
            <option value="ESTIMATOR">ESTIMATOR</option>
            <option value="GM">GM</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button
            disabled={busy === 'assign'}
            onClick={() => run('assign', () => (actions?.onAssign ?? defaultAssign)(assignedToUserId, assignedRole || null))}
            style={{ marginLeft: 6, padding: '4px 10px' }}
          >
            Assign
          </button>
        </section>
      )}

      {!isTerminal && (
        <section aria-label="Promote" style={{ borderTop: '1px solid var(--color-surface-border)', paddingTop: 8 }}>
          <h4 style={{ fontSize: 13, margin: 0, marginBottom: 6 }}>Promote</h4>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input aria-label="Engagement id" placeholder="engagement uuid" value={engagementId} onChange={e => setEngagementId(e.target.value)} style={{ padding: 4 }} />
            <button
              disabled={busy === 'project' || !engagementId}
              onClick={() => run('project', () => (actions?.onConvertToProject ?? defaultConvertProject)(engagementId, reason || undefined))}
              style={{ padding: '4px 10px' }}
            >
              Convert to Project
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input aria-label="Work order id" placeholder="SRV-YY-NNNN" value={workOrderId} onChange={e => setWorkOrderId(e.target.value)} style={{ padding: 4 }} />
            <button
              disabled={busy === 'wo' || !workOrderId}
              onClick={() => run('wo', () => (actions?.onConvertToWorkOrder ?? defaultConvertWO)(workOrderId, reason || undefined))}
              style={{ padding: '4px 10px' }}
            >
              Convert to Work Order
            </button>
          </div>
        </section>
      )}
    </aside>
  );
}
