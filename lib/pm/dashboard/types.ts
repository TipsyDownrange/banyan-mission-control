/**
 * BAN-348 PM-V1.0-I — PM Overview Dashboard canonical types.
 *
 * PM Trunk v1.0 §13.  Drag-rearrange dashboard widgets persisted per-user
 * per dashboard_kind.  Layout grid uses react-grid-layout's item shape.
 *
 * Without-Kai behavior: every widget here is a deterministic SQL query or
 * count rollup.  Kai may LATER layer summaries on top, but the dashboard
 * renders fully without any LLM call.
 */

export const DASHBOARD_KINDS = [
  'PM_OVERVIEW',
  'SERVICE_PM_OVERVIEW',
  'GM_OVERVIEW',
] as const;

export type DashboardKind = typeof DASHBOARD_KINDS[number];

export const WIDGET_KINDS = [
  // Base widgets — visible to every PM role
  'MY_OPEN_ACTIONS',
  'MY_PROJECTS',
  'CROSS_PROJECT_SUBMITTALS',
  'CROSS_PROJECT_RFIS',
  'PAY_APP_CYCLE',
  'RECENT_ACTIVITY',
  // Senior widgets — only service_pm / senior_pm / business_admin / super_admin
  'ALL_PM_WORKLOAD',
  'CROSS_PM_SUBMITTALS_RFIS',
  'PROJECT_HEALTH_HEAT_MAP',
] as const;

export type WidgetKind = typeof WIDGET_KINDS[number];

export const BASE_WIDGET_KINDS: readonly WidgetKind[] = [
  'MY_OPEN_ACTIONS',
  'MY_PROJECTS',
  'CROSS_PROJECT_SUBMITTALS',
  'CROSS_PROJECT_RFIS',
  'PAY_APP_CYCLE',
  'RECENT_ACTIVITY',
] as const;

export const SENIOR_WIDGET_KINDS: readonly WidgetKind[] = [
  'ALL_PM_WORKLOAD',
  'CROSS_PM_SUBMITTALS_RFIS',
  'PROJECT_HEALTH_HEAT_MAP',
] as const;

/** Roles allowed to view the PM Overview Dashboard at all. */
export const PM_DASHBOARD_ROLES = new Set<string>([
  'pm',
  'service_pm',
  'senior_pm',
  'business_admin',
  'super_admin',
  // Executives always inherit PM access for visibility into the org.
  'owner',
  'gm',
]);

/** Roles allowed to see the senior-only widgets. */
export const SENIOR_PM_ROLES = new Set<string>([
  'service_pm',
  'senior_pm',
  'business_admin',
  'super_admin',
  'owner',
  'gm',
]);

export function isDashboardKind(value: unknown): value is DashboardKind {
  return typeof value === 'string'
    && (DASHBOARD_KINDS as readonly string[]).includes(value);
}

export function isWidgetKind(value: unknown): value is WidgetKind {
  return typeof value === 'string'
    && (WIDGET_KINDS as readonly string[]).includes(value);
}

export function isSeniorWidget(kind: WidgetKind): boolean {
  return (SENIOR_WIDGET_KINDS as readonly WidgetKind[]).includes(kind);
}

export function canRoleSeeDashboard(role: string): boolean {
  return PM_DASHBOARD_ROLES.has(role);
}

export function canRoleSeeWidget(role: string, kind: WidgetKind): boolean {
  if (!canRoleSeeDashboard(role)) return false;
  if (isSeniorWidget(kind)) return SENIOR_PM_ROLES.has(role);
  return true;
}

/** react-grid-layout item shape — x/y/w/h grid coordinates per widget. */
export type LayoutItem = {
  i: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

/** Full layout payload — list of grid items + the visible widget set. */
export type DashboardLayout = {
  items: LayoutItem[];
};

export type UserDashboardLayoutRow = {
  layout_id: string;
  tenant_id: string;
  user_id: string;
  dashboard_kind: DashboardKind;
  layout_data: DashboardLayout;
  visible_widgets: WidgetKind[];
  last_modified: string;
  created_at: string;
};

/**
 * Resolve the dashboard_kind a role should land on.  PM goes to the base
 * PM overview; service_pm gets the service variant; super_admin / business_admin
 * default to the GM_OVERVIEW which shows everything.
 */
export function dashboardKindForRole(role: string): DashboardKind {
  if (role === 'service_pm') return 'SERVICE_PM_OVERVIEW';
  if (
    role === 'super_admin'
    || role === 'owner'
    || role === 'gm'
    || role === 'business_admin'
  ) return 'GM_OVERVIEW';
  // pm, senior_pm, and anyone else allowed in defaults to PM_OVERVIEW.
  return 'PM_OVERVIEW';
}

/**
 * Heat-map status spec from §13.2.
 *   - GREEN: activity <3 days AND no overdue items
 *   - YELLOW: activity 3-7 days OR 1+ overdue
 *   - RED:    activity >7 days OR 3+ overdue OR blocked
 */
export type HeatStatus = 'GREEN' | 'YELLOW' | 'RED';

export type HeatInput = {
  daysSinceLastActivity: number | null;
  overdueCount: number;
  isBlocked: boolean;
};

export function computeProjectHealth(input: HeatInput): HeatStatus {
  const { daysSinceLastActivity, overdueCount, isBlocked } = input;
  if (isBlocked) return 'RED';
  if (overdueCount >= 3) return 'RED';
  if (daysSinceLastActivity !== null && daysSinceLastActivity > 7) return 'RED';
  if (overdueCount >= 1) return 'YELLOW';
  if (daysSinceLastActivity !== null && daysSinceLastActivity >= 3) return 'YELLOW';
  return 'GREEN';
}
