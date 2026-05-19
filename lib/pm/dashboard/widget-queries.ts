/**
 * BAN-348 PM-V1.0-I — Deterministic widget data queries.
 *
 * All queries are pure Drizzle SQL.  No LLM calls anywhere in this file —
 * Without-Kai operation renders every widget below using these queries
 * exclusively.  Kai may LATER layer summaries on top (e.g., "Risk score
 * from Heat Map: 2 red, 3 yellow — suggest action"), but BanyanOS default
 * operation renders the dashboard without Kai.
 */

import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import {
  action_items,
  db,
  engagements,
  field_events,
  pay_applications,
  rfis,
  submittals,
  users,
} from '@/db';
import {
  OPEN_ACTIONABLE_STATUSES,
  type ActionItemStatus,
} from '@/lib/pm/action-items/types';
import { computeProjectHealth, type HeatStatus } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(now: Date, then: Date | null): number | null {
  if (!then) return null;
  return Math.floor((now.getTime() - then.getTime()) / MS_PER_DAY);
}

type SubmittalStatus = typeof submittals.status.enumValues[number];
type RfiStatus = typeof rfis.status.enumValues[number];

const OPEN_SUBMITTAL_STATUSES: readonly SubmittalStatus[] = [
  'REQUIRED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW',
];
const OPEN_RFI_STATUSES: readonly RfiStatus[] = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW',
];

async function projectsAssignedToUser(tenantId: string, userId: string) {
  return db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      status: engagements.status,
      pm_handoff_state: engagements.pm_handoff_state,
      target_completion_date: engagements.target_completion_date,
      pm_assigned_user_id: engagements.pm_assigned_user_id,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, tenantId),
        eq(engagements.pm_assigned_user_id, userId),
        eq(engagements.status, 'active'),
      ),
    );
}

// ─── Widget: MY_OPEN_ACTIONS ────────────────────────────────────────────────
export async function fetchMyOpenActions(tenantId: string, userId: string) {
  const statuses = OPEN_ACTIONABLE_STATUSES as readonly ActionItemStatus[];
  const items = await db
    .select({
      action_item_id: action_items.action_item_id,
      engagement_id: action_items.engagement_id,
      source_event_type: action_items.source_event_type,
      source_entity_type: action_items.source_entity_type,
      title: action_items.title,
      assigned_to: action_items.assigned_to,
      due_date: action_items.due_date,
      priority: action_items.priority,
      status: action_items.status,
      created_at: action_items.created_at,
      kid: engagements.kid,
    })
    .from(action_items)
    .leftJoin(engagements, eq(action_items.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(action_items.tenant_id, tenantId),
        eq(action_items.assigned_to, userId),
        inArray(action_items.status, statuses as ActionItemStatus[]),
      ),
    )
    .orderBy(desc(action_items.created_at))
    .limit(200);
  const projectsSet = new Set<string>();
  for (const it of items) if (it.kid) projectsSet.add(it.kid);
  return { items, total: items.length, project_count: projectsSet.size };
}

// ─── Widget: MY_PROJECTS ───────────────────────────────────────────────────
export async function fetchMyProjects(tenantId: string, userId: string) {
  const projects = await projectsAssignedToUser(tenantId, userId);
  if (projects.length === 0) return { items: [], total: 0 };
  const engagementIds = projects.map((p) => p.engagement_id);

  const [openSubmittals, openRfis, currentPayApps, lastEvents] = await Promise.all([
    db
      .select({ engagement_id: submittals.engagement_id, n: count() })
      .from(submittals)
      .where(
        and(
          eq(submittals.tenant_id, tenantId),
          inArray(submittals.engagement_id, engagementIds),
          inArray(submittals.status, OPEN_SUBMITTAL_STATUSES as SubmittalStatus[]),
        ),
      )
      .groupBy(submittals.engagement_id),
    db
      .select({ engagement_id: rfis.engagement_id, n: count() })
      .from(rfis)
      .where(
        and(
          eq(rfis.tenant_id, tenantId),
          inArray(rfis.engagement_id, engagementIds),
          inArray(rfis.status, OPEN_RFI_STATUSES as RfiStatus[]),
        ),
      )
      .groupBy(rfis.engagement_id),
    db
      .select({
        engagement_id: pay_applications.engagement_id,
        pay_app_number: pay_applications.pay_app_number,
        state: pay_applications.state,
        current_amount_due: pay_applications.current_amount_due,
        period_end: pay_applications.period_end,
      })
      .from(pay_applications)
      .where(
        and(
          eq(pay_applications.tenant_id, tenantId),
          inArray(pay_applications.engagement_id, engagementIds),
        ),
      )
      .orderBy(desc(pay_applications.pay_app_number)),
    db
      .select({
        entity_id: field_events.entity_id,
        created_at: field_events.created_at,
      })
      .from(field_events)
      .where(
        and(
          inArray(field_events.entity_id, engagementIds),
          isNotNull(field_events.created_at),
        ),
      )
      .orderBy(desc(field_events.created_at))
      .limit(engagementIds.length * 5),
  ]);

  const submittalByEng = new Map<string, number>();
  for (const r of openSubmittals) submittalByEng.set(r.engagement_id, Number(r.n));
  const rfiByEng = new Map<string, number>();
  for (const r of openRfis) rfiByEng.set(r.engagement_id, Number(r.n));
  const currentPayByEng = new Map<string, typeof currentPayApps[number]>();
  for (const p of currentPayApps) {
    if (!currentPayByEng.has(p.engagement_id)) currentPayByEng.set(p.engagement_id, p);
  }
  const lastEventByEng = new Map<string, Date>();
  for (const e of lastEvents) {
    if (!e.entity_id || !e.created_at) continue;
    if (!lastEventByEng.has(e.entity_id)) lastEventByEng.set(e.entity_id, new Date(e.created_at));
  }

  const items = projects.map((p) => {
    const currentPayApp = currentPayByEng.get(p.engagement_id) ?? null;
    const lastActivity = lastEventByEng.get(p.engagement_id) ?? null;
    return {
      engagement_id: p.engagement_id,
      kid: p.kid,
      status: p.status,
      pm_handoff_state: p.pm_handoff_state,
      target_completion_date: p.target_completion_date,
      open_submittals: submittalByEng.get(p.engagement_id) ?? 0,
      open_rfis: rfiByEng.get(p.engagement_id) ?? 0,
      current_pay_app: currentPayApp
        ? {
            pay_app_number: currentPayApp.pay_app_number,
            state: currentPayApp.state,
            current_amount_due: currentPayApp.current_amount_due,
            period_end: currentPayApp.period_end,
          }
        : null,
      last_activity_at: lastActivity ? lastActivity.toISOString() : null,
    };
  });
  return { items, total: items.length };
}

// ─── Widget: CROSS_PROJECT_SUBMITTALS ──────────────────────────────────────
export async function fetchCrossProjectSubmittals(tenantId: string, userId: string) {
  const projects = await projectsAssignedToUser(tenantId, userId);
  if (projects.length === 0) return { items: [], total: 0 };
  const engagementIds = projects.map((p) => p.engagement_id);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      submittal_id: submittals.submittal_id,
      engagement_id: submittals.engagement_id,
      submittal_number: submittals.submittal_number,
      display_label: submittals.display_label,
      status: submittals.status,
      ball_in_court: submittals.ball_in_court,
      required_by_date: submittals.required_by_date,
      submitted_date: submittals.submitted_date,
      kid: engagements.kid,
    })
    .from(submittals)
    .leftJoin(engagements, eq(submittals.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(submittals.tenant_id, tenantId),
        inArray(submittals.engagement_id, engagementIds),
        inArray(submittals.status, OPEN_SUBMITTAL_STATUSES as SubmittalStatus[]),
      ),
    )
    .orderBy(desc(submittals.required_by_date))
    .limit(200);

  const items = rows.map((r) => ({
    ...r,
    is_overdue: r.required_by_date ? r.required_by_date < today : false,
  }));
  return { items, total: items.length };
}

// ─── Widget: CROSS_PROJECT_RFIS ───────────────────────────────────────────
export async function fetchCrossProjectRfis(tenantId: string, userId: string) {
  const projects = await projectsAssignedToUser(tenantId, userId);
  if (projects.length === 0) return { items: [], total: 0 };
  const engagementIds = projects.map((p) => p.engagement_id);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      rfi_id: rfis.rfi_id,
      engagement_id: rfis.engagement_id,
      rfi_number: rfis.rfi_number,
      subject: rfis.subject,
      status: rfis.status,
      ball_in_court: rfis.ball_in_court,
      submitted_date: rfis.submitted_date,
      required_response_by_date: rfis.required_response_by_date,
      kid: engagements.kid,
    })
    .from(rfis)
    .leftJoin(engagements, eq(rfis.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(rfis.tenant_id, tenantId),
        inArray(rfis.engagement_id, engagementIds),
        inArray(rfis.status, OPEN_RFI_STATUSES as RfiStatus[]),
      ),
    )
    .orderBy(desc(rfis.required_response_by_date))
    .limit(200);

  const items = rows.map((r) => ({
    ...r,
    is_overdue: r.required_response_by_date ? r.required_response_by_date < today : false,
  }));
  return { items, total: items.length };
}

// ─── Widget: PAY_APP_CYCLE ─────────────────────────────────────────────────
export async function fetchPayAppCycle(tenantId: string, userId: string) {
  const projects = await projectsAssignedToUser(tenantId, userId);
  if (projects.length === 0) return { items: [], total: 0 };
  const engagementIds = projects.map((p) => p.engagement_id);

  const rows = await db
    .select({
      pay_app_id: pay_applications.pay_app_id,
      engagement_id: pay_applications.engagement_id,
      pay_app_number: pay_applications.pay_app_number,
      period_start: pay_applications.period_start,
      period_end: pay_applications.period_end,
      state: pay_applications.state,
      current_amount_due: pay_applications.current_amount_due,
      submitted_at: pay_applications.submitted_at,
      gc_approved_at: pay_applications.gc_approved_at,
      kid: engagements.kid,
    })
    .from(pay_applications)
    .leftJoin(engagements, eq(pay_applications.engagement_id, engagements.engagement_id))
    .where(
      and(
        eq(pay_applications.tenant_id, tenantId),
        inArray(pay_applications.engagement_id, engagementIds),
      ),
    )
    .orderBy(desc(pay_applications.period_end))
    .limit(200);
  return { items: rows, total: rows.length };
}

// ─── Widget: RECENT_ACTIVITY ───────────────────────────────────────────────
export async function fetchRecentActivity(tenantId: string, userId: string) {
  const projects = await projectsAssignedToUser(tenantId, userId);
  if (projects.length === 0) return { items: [], total: 0 };
  const engagementIds = projects.map((p) => p.engagement_id);

  const rows = await db
    .select({
      event_id: field_events.event_id,
      entity_id: field_events.entity_id,
      event_type: field_events.event_type,
      description: field_events.description,
      created_at: field_events.created_at,
    })
    .from(field_events)
    .where(
      and(
        inArray(field_events.entity_id, engagementIds),
        eq(field_events.test_data, false),
      ),
    )
    .orderBy(desc(field_events.created_at))
    .limit(20);
  return { items: rows, total: rows.length };
}

// ─── Widget: ALL_PM_WORKLOAD (senior) ─────────────────────────────────────
export async function fetchAllPmWorkload(tenantId: string) {
  const rows = await db
    .select({
      pm_user_id: engagements.pm_assigned_user_id,
      n: count(),
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, tenantId),
        eq(engagements.status, 'active'),
        isNotNull(engagements.pm_assigned_user_id),
      ),
    )
    .groupBy(engagements.pm_assigned_user_id);

  if (rows.length === 0) return { items: [], total: 0 };

  const userIds = rows
    .map((r) => r.pm_user_id)
    .filter((u): u is string => !!u);
  const userRows = userIds.length > 0
    ? await db
        .select({ user_id: users.user_id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.user_id, userIds))
    : [];
  const userMap = new Map<string, { name: string | null; email: string }>();
  for (const u of userRows) userMap.set(u.user_id, { name: u.name, email: u.email });

  const items = rows.map((r) => ({
    pm_user_id: r.pm_user_id,
    name: r.pm_user_id ? (userMap.get(r.pm_user_id)?.name ?? null) : null,
    email: r.pm_user_id ? (userMap.get(r.pm_user_id)?.email ?? null) : null,
    active_project_count: Number(r.n),
  }));
  items.sort((a, b) => b.active_project_count - a.active_project_count);
  return { items, total: items.length };
}

// ─── Widget: CROSS_PM_SUBMITTALS_RFIS (senior) ────────────────────────────
export async function fetchCrossPmSubmittalsRfis(tenantId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [subRows, rfiRows] = await Promise.all([
    db
      .select({
        ball_in_court: submittals.ball_in_court,
        status: submittals.status,
        required_by_date: submittals.required_by_date,
        engagement_id: submittals.engagement_id,
      })
      .from(submittals)
      .where(
        and(
          eq(submittals.tenant_id, tenantId),
          inArray(submittals.status, OPEN_SUBMITTAL_STATUSES as SubmittalStatus[]),
        ),
      ),
    db
      .select({
        ball_in_court: rfis.ball_in_court,
        status: rfis.status,
        required_response_by_date: rfis.required_response_by_date,
        engagement_id: rfis.engagement_id,
      })
      .from(rfis)
      .where(
        and(
          eq(rfis.tenant_id, tenantId),
          inArray(rfis.status, OPEN_RFI_STATUSES as RfiStatus[]),
        ),
      ),
  ]);

  function bucketize<T extends { ball_in_court: string | null }>(rows: T[]) {
    const buckets = new Map<string, number>();
    for (const r of rows) {
      const key = r.ball_in_court ?? 'UNASSIGNED';
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Object.fromEntries(buckets);
  }

  const submittalsOverdue = subRows.filter(
    (r) => r.required_by_date && r.required_by_date < today,
  ).length;
  const rfisOverdue = rfiRows.filter(
    (r) => r.required_response_by_date && r.required_response_by_date < today,
  ).length;

  return {
    submittals: {
      total: subRows.length,
      overdue: submittalsOverdue,
      by_ball_in_court: bucketize(subRows),
    },
    rfis: {
      total: rfiRows.length,
      overdue: rfisOverdue,
      by_ball_in_court: bucketize(rfiRows),
    },
  };
}

// ─── Widget: PROJECT_HEALTH_HEAT_MAP (senior) ────────────────────────────
export async function fetchProjectHealthHeatMap(tenantId: string) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const projects = await db
    .select({
      engagement_id: engagements.engagement_id,
      kid: engagements.kid,
      pm_handoff_state: engagements.pm_handoff_state,
      pm_assigned_user_id: engagements.pm_assigned_user_id,
    })
    .from(engagements)
    .where(
      and(
        eq(engagements.tenant_id, tenantId),
        eq(engagements.status, 'active'),
      ),
    );

  if (projects.length === 0) {
    return { items: [], summary: { GREEN: 0, YELLOW: 0, RED: 0 }, total: 0 };
  }
  const engagementIds = projects.map((p) => p.engagement_id);

  const [subRows, rfiRows, actionRows, eventRows] = await Promise.all([
    db
      .select({
        engagement_id: submittals.engagement_id,
        required_by_date: submittals.required_by_date,
        status: submittals.status,
      })
      .from(submittals)
      .where(
        and(
          eq(submittals.tenant_id, tenantId),
          inArray(submittals.engagement_id, engagementIds),
          inArray(submittals.status, OPEN_SUBMITTAL_STATUSES as SubmittalStatus[]),
        ),
      ),
    db
      .select({
        engagement_id: rfis.engagement_id,
        required_response_by_date: rfis.required_response_by_date,
        status: rfis.status,
      })
      .from(rfis)
      .where(
        and(
          eq(rfis.tenant_id, tenantId),
          inArray(rfis.engagement_id, engagementIds),
          inArray(rfis.status, OPEN_RFI_STATUSES as RfiStatus[]),
        ),
      ),
    db
      .select({
        engagement_id: action_items.engagement_id,
        due_date: action_items.due_date,
        status: action_items.status,
      })
      .from(action_items)
      .where(
        and(
          eq(action_items.tenant_id, tenantId),
          inArray(action_items.engagement_id, engagementIds),
          inArray(action_items.status, OPEN_ACTIONABLE_STATUSES as ActionItemStatus[]),
        ),
      ),
    db
      .select({
        entity_id: field_events.entity_id,
        created_at: field_events.created_at,
      })
      .from(field_events)
      .where(
        and(
          inArray(field_events.entity_id, engagementIds),
          isNotNull(field_events.created_at),
          eq(field_events.test_data, false),
        ),
      ),
  ]);

  const overdueByEng = new Map<string, number>();
  function bumpOverdue(engId: string | null, dueDate: string | null) {
    if (!engId) return;
    if (!dueDate) return;
    if (dueDate < today) overdueByEng.set(engId, (overdueByEng.get(engId) ?? 0) + 1);
  }
  for (const r of subRows) bumpOverdue(r.engagement_id, r.required_by_date);
  for (const r of rfiRows) bumpOverdue(r.engagement_id, r.required_response_by_date);
  for (const r of actionRows) bumpOverdue(r.engagement_id, r.due_date);

  const lastEventByEng = new Map<string, Date>();
  for (const e of eventRows) {
    if (!e.entity_id || !e.created_at) continue;
    const cur = lastEventByEng.get(e.entity_id);
    const next = new Date(e.created_at);
    if (!cur || next > cur) lastEventByEng.set(e.entity_id, next);
  }

  const summary: Record<HeatStatus, number> = { GREEN: 0, YELLOW: 0, RED: 0 };
  const items = projects.map((p) => {
    const isBlocked = p.pm_handoff_state === 'handoff_blocked';
    const overdueCount = overdueByEng.get(p.engagement_id) ?? 0;
    const lastActivity = lastEventByEng.get(p.engagement_id) ?? null;
    const daysSince = daysBetween(now, lastActivity);
    const heat = computeProjectHealth({
      daysSinceLastActivity: daysSince,
      overdueCount,
      isBlocked,
    });
    summary[heat] += 1;
    return {
      engagement_id: p.engagement_id,
      kid: p.kid,
      pm_handoff_state: p.pm_handoff_state,
      pm_assigned_user_id: p.pm_assigned_user_id,
      overdue_count: overdueCount,
      days_since_last_activity: daysSince,
      heat,
    };
  });
  items.sort((a, b) => {
    const rank = { RED: 0, YELLOW: 1, GREEN: 2 } as const;
    return rank[a.heat] - rank[b.heat];
  });
  return { items, summary, total: items.length };
}
