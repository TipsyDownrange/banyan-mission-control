/**
 * Bill.com API v2 client library
 * Auth: session-based (POST /Login → sessionId)
 * All subsequent calls include sessionId in request body
 */

const BILLCOM_BASE = 'https://api.bill.com/api/v2';

export interface BillcomSession {
  sessionId: string;
  orgId: string;
}

export type BillcomLoginResult = {
  ok: true;
  session: BillcomSession;
} | {
  ok: false;
  error: string;
};

// ── Login ─────────────────────────────────────────────────────────────────────
export async function billcomLogin(): Promise<{ ok: true; session: BillcomSession } | { ok: false; error: string }> {
  const devKey = process.env.BILLCOM_DEV_KEY;
  const orgId = process.env.BILLCOM_ORG_ID;
  const userName = process.env.BILLCOM_USERNAME;
  const password = process.env.BILLCOM_PASSWORD;

  if (!devKey) return { ok: false, error: 'BILLCOM_DEV_KEY not set' };
  if (!orgId) return { ok: false, error: 'BILLCOM_ORG_ID not set' };
  if (!userName) return { ok: false, error: 'BILLCOM_USERNAME not set — Bill.com credentials required' };
  if (!password) return { ok: false, error: 'BILLCOM_PASSWORD not set — Bill.com credentials required' };

  try {
    const params = new URLSearchParams({
      devKey,
      orgId,
      userName,
      password,
    });

    const res = await fetch(`${BILLCOM_BASE}/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok || data.response_status !== 0) {
      const msg = data.response_message || `HTTP ${res.status}`;
      return { ok: false, error: `Bill.com login failed: ${msg}` };
    }

    const sessionId = data.response_data?.sessionId;
    if (!sessionId) {
      return { ok: false, error: 'Bill.com login: no sessionId in response' };
    }

    return { ok: true, session: { sessionId, orgId } };
  } catch (err) {
    return { ok: false, error: `Bill.com login error: ${String(err)}` };
  }
}

// ── Authenticated fetch ───────────────────────────────────────────────────────
export async function billcomFetch(
  endpoint: string,
  session: BillcomSession,
  extraBody: Record<string, unknown> = {}
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const devKey = process.env.BILLCOM_DEV_KEY;
  if (!devKey) return { ok: false, error: 'BILLCOM_DEV_KEY not set' };

  try {
    const params = new URLSearchParams({
      devKey,
      sessionId: session.sessionId,
      orgId: session.orgId,
      ...Object.fromEntries(
        Object.entries(extraBody).map(([k, v]) => [k, JSON.stringify(v)])
      ),
    });

    const res = await fetch(`${BILLCOM_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok || data.response_status !== 0) {
      const msg = data.response_message || `HTTP ${res.status}`;
      return { ok: false, error: `Bill.com ${endpoint} failed: ${msg}` };
    }

    return { ok: true, data: data.response_data };
  } catch (err) {
    return { ok: false, error: `Bill.com ${endpoint} error: ${String(err)}` };
  }
}

// ── Bill list ─────────────────────────────────────────────────────────────────
export async function getBills(session: BillcomSession) {
  return billcomFetch('List/Bill', session, {
    filters: [],
    sort: [{ field: 'invoiceDate', asc: false }],
    start: 0,
    max: 999,
  });
}

// ── Vendor list ───────────────────────────────────────────────────────────────
export async function getVendors(session: BillcomSession) {
  return billcomFetch('List/Vendor', session, {
    filters: [],
    sort: [{ field: 'name', asc: true }],
    start: 0,
    max: 999,
  });
}

// ── Payments ──────────────────────────────────────────────────────────────────
export async function getPayments(session: BillcomSession) {
  return billcomFetch('List/SentPay', session, {
    filters: [],
    sort: [{ field: 'processDate', asc: false }],
    start: 0,
    max: 999,
  });
}

// ── Receivables (AR) ──────────────────────────────────────────────────────────
export async function getReceivables(session: BillcomSession) {
  return billcomFetch('List/ReceivedPay', session, {
    filters: [],
    sort: [{ field: 'depositToAccountId', asc: false }],
    start: 0,
    max: 999,
  });
}
