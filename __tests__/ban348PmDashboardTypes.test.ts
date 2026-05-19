/**
 * BAN-348 PM-V1.0-I — PM Overview Dashboard pure-library tests.
 *
 * Targets the type guards, role gating, and Heat Map calculator.
 */

import {
  BASE_WIDGET_KINDS,
  DASHBOARD_KINDS,
  PM_DASHBOARD_ROLES,
  SENIOR_PM_ROLES,
  SENIOR_WIDGET_KINDS,
  WIDGET_KINDS,
  canRoleSeeDashboard,
  canRoleSeeWidget,
  computeProjectHealth,
  dashboardKindForRole,
  isDashboardKind,
  isSeniorWidget,
  isWidgetKind,
} from '@/lib/pm/dashboard/types';

describe('BAN-348 dashboard + widget enums', () => {
  it('defines the three dashboard kinds', () => {
    expect(DASHBOARD_KINDS).toEqual([
      'PM_OVERVIEW',
      'SERVICE_PM_OVERVIEW',
      'GM_OVERVIEW',
    ]);
  });

  it('defines all nine widget kinds', () => {
    expect(WIDGET_KINDS).toEqual([
      'MY_OPEN_ACTIONS',
      'MY_PROJECTS',
      'CROSS_PROJECT_SUBMITTALS',
      'CROSS_PROJECT_RFIS',
      'PAY_APP_CYCLE',
      'RECENT_ACTIVITY',
      'ALL_PM_WORKLOAD',
      'CROSS_PM_SUBMITTALS_RFIS',
      'PROJECT_HEALTH_HEAT_MAP',
    ]);
  });

  it('base and senior widget sets are disjoint and cover all kinds', () => {
    const base = new Set(BASE_WIDGET_KINDS);
    const senior = new Set(SENIOR_WIDGET_KINDS);
    for (const k of base) expect(senior.has(k)).toBe(false);
    for (const k of WIDGET_KINDS) expect(base.has(k) || senior.has(k)).toBe(true);
  });

  it('isDashboardKind / isWidgetKind type-guard correctly', () => {
    expect(isDashboardKind('PM_OVERVIEW')).toBe(true);
    expect(isDashboardKind('pm_overview')).toBe(false);
    expect(isDashboardKind(null)).toBe(false);
    expect(isWidgetKind('MY_OPEN_ACTIONS')).toBe(true);
    expect(isWidgetKind('NOT_REAL')).toBe(false);
    expect(isWidgetKind(undefined)).toBe(false);
  });

  it('isSeniorWidget identifies the senior trio', () => {
    expect(isSeniorWidget('ALL_PM_WORKLOAD')).toBe(true);
    expect(isSeniorWidget('CROSS_PM_SUBMITTALS_RFIS')).toBe(true);
    expect(isSeniorWidget('PROJECT_HEALTH_HEAT_MAP')).toBe(true);
    expect(isSeniorWidget('MY_OPEN_ACTIONS')).toBe(false);
    expect(isSeniorWidget('MY_PROJECTS')).toBe(false);
  });
});

describe('BAN-348 role gating', () => {
  it('PM_DASHBOARD_ROLES contains the canonical PM-class roles', () => {
    for (const r of ['pm', 'service_pm', 'senior_pm', 'business_admin', 'super_admin']) {
      expect(PM_DASHBOARD_ROLES.has(r)).toBe(true);
    }
  });

  it('SENIOR_PM_ROLES excludes base pm but includes the senior class', () => {
    expect(SENIOR_PM_ROLES.has('pm')).toBe(false);
    expect(SENIOR_PM_ROLES.has('service_pm')).toBe(true);
    expect(SENIOR_PM_ROLES.has('senior_pm')).toBe(true);
    expect(SENIOR_PM_ROLES.has('business_admin')).toBe(true);
    expect(SENIOR_PM_ROLES.has('super_admin')).toBe(true);
  });

  it('rejects unrelated roles from the dashboard surface', () => {
    expect(canRoleSeeDashboard('glazier')).toBe(false);
    expect(canRoleSeeDashboard('field')).toBe(false);
    expect(canRoleSeeDashboard('estimator')).toBe(false);
  });

  it('pm sees base widgets but not senior widgets', () => {
    expect(canRoleSeeWidget('pm', 'MY_OPEN_ACTIONS')).toBe(true);
    expect(canRoleSeeWidget('pm', 'PAY_APP_CYCLE')).toBe(true);
    expect(canRoleSeeWidget('pm', 'ALL_PM_WORKLOAD')).toBe(false);
    expect(canRoleSeeWidget('pm', 'PROJECT_HEALTH_HEAT_MAP')).toBe(false);
  });

  it('service_pm / senior_pm / business_admin / super_admin see every widget', () => {
    for (const role of ['service_pm', 'senior_pm', 'business_admin', 'super_admin']) {
      for (const widget of WIDGET_KINDS) {
        expect(canRoleSeeWidget(role, widget)).toBe(true);
      }
    }
  });

  it('non-dashboard roles see no widgets', () => {
    expect(canRoleSeeWidget('glazier', 'MY_OPEN_ACTIONS')).toBe(false);
    expect(canRoleSeeWidget('field', 'PROJECT_HEALTH_HEAT_MAP')).toBe(false);
  });

  it('dashboardKindForRole routes each role to its variant', () => {
    expect(dashboardKindForRole('pm')).toBe('PM_OVERVIEW');
    expect(dashboardKindForRole('senior_pm')).toBe('PM_OVERVIEW');
    expect(dashboardKindForRole('service_pm')).toBe('SERVICE_PM_OVERVIEW');
    expect(dashboardKindForRole('business_admin')).toBe('GM_OVERVIEW');
    expect(dashboardKindForRole('super_admin')).toBe('GM_OVERVIEW');
    expect(dashboardKindForRole('owner')).toBe('GM_OVERVIEW');
  });
});

describe('BAN-348 Heat Map status calculation', () => {
  it('GREEN: <3 days activity and no overdue items', () => {
    expect(computeProjectHealth({ daysSinceLastActivity: 0, overdueCount: 0, isBlocked: false })).toBe('GREEN');
    expect(computeProjectHealth({ daysSinceLastActivity: 2, overdueCount: 0, isBlocked: false })).toBe('GREEN');
    expect(computeProjectHealth({ daysSinceLastActivity: null, overdueCount: 0, isBlocked: false })).toBe('GREEN');
  });

  it('YELLOW: 3-7 days activity OR 1+ overdue', () => {
    expect(computeProjectHealth({ daysSinceLastActivity: 3, overdueCount: 0, isBlocked: false })).toBe('YELLOW');
    expect(computeProjectHealth({ daysSinceLastActivity: 7, overdueCount: 0, isBlocked: false })).toBe('YELLOW');
    expect(computeProjectHealth({ daysSinceLastActivity: 0, overdueCount: 1, isBlocked: false })).toBe('YELLOW');
    expect(computeProjectHealth({ daysSinceLastActivity: 1, overdueCount: 2, isBlocked: false })).toBe('YELLOW');
  });

  it('RED: >7 days activity OR 3+ overdue OR blocked', () => {
    expect(computeProjectHealth({ daysSinceLastActivity: 8, overdueCount: 0, isBlocked: false })).toBe('RED');
    expect(computeProjectHealth({ daysSinceLastActivity: 30, overdueCount: 0, isBlocked: false })).toBe('RED');
    expect(computeProjectHealth({ daysSinceLastActivity: 0, overdueCount: 3, isBlocked: false })).toBe('RED');
    expect(computeProjectHealth({ daysSinceLastActivity: 0, overdueCount: 10, isBlocked: false })).toBe('RED');
    expect(computeProjectHealth({ daysSinceLastActivity: 0, overdueCount: 0, isBlocked: true })).toBe('RED');
  });

  it('blocked dominates over green/yellow scoring', () => {
    expect(computeProjectHealth({ daysSinceLastActivity: 0, overdueCount: 0, isBlocked: true })).toBe('RED');
    expect(computeProjectHealth({ daysSinceLastActivity: 5, overdueCount: 1, isBlocked: true })).toBe('RED');
  });

  it('null activity does not push to RED on its own', () => {
    expect(computeProjectHealth({ daysSinceLastActivity: null, overdueCount: 0, isBlocked: false })).toBe('GREEN');
  });
});
