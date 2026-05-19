/**
 * BAN-348 PM-V1.0-I — Per-widget data endpoint.
 *
 *   GET /api/pm-dashboard/widgets/[widget_kind]/data
 *
 * Per-widget role gating: senior widgets (ALL_PM_WORKLOAD,
 * CROSS_PM_SUBMITTALS_RFIS, PROJECT_HEALTH_HEAT_MAP) require
 * service_pm / senior_pm / business_admin / super_admin (see
 * canRoleSeeWidget in lib/pm/dashboard/types.ts).
 *
 * All data returned here is deterministic SQL — no LLM in the data path.
 */

import { NextResponse } from 'next/server';
import { passPmDashboardReadGate } from '@/lib/pm/dashboard/api-gate';
import { canRoleSeeWidget, isWidgetKind } from '@/lib/pm/dashboard/types';
import {
  fetchAllPmWorkload,
  fetchCrossPmSubmittalsRfis,
  fetchCrossProjectRfis,
  fetchCrossProjectSubmittals,
  fetchMyOpenActions,
  fetchMyProjects,
  fetchPayAppCycle,
  fetchProjectHealthHeatMap,
  fetchRecentActivity,
} from '@/lib/pm/dashboard/widget-queries';

export async function GET(
  _req: Request,
  context: { params: Promise<{ widget_kind: string }> },
) {
  const gate = await passPmDashboardReadGate();
  if (!gate.ok) return gate.response;

  const { widget_kind: rawKind } = await context.params;
  const widgetKind = decodeURIComponent(rawKind).trim();
  if (!isWidgetKind(widgetKind)) {
    return NextResponse.json(
      { error: `Unknown widget_kind: ${widgetKind}` },
      { status: 400 },
    );
  }
  if (!canRoleSeeWidget(gate.role, widgetKind)) {
    return NextResponse.json(
      { error: `Forbidden: widget ${widgetKind} requires senior PM role` },
      { status: 403 },
    );
  }

  switch (widgetKind) {
    case 'MY_OPEN_ACTIONS':
      return NextResponse.json(await fetchMyOpenActions(gate.tenantId, gate.userId));
    case 'MY_PROJECTS':
      return NextResponse.json(await fetchMyProjects(gate.tenantId, gate.userId));
    case 'CROSS_PROJECT_SUBMITTALS':
      return NextResponse.json(await fetchCrossProjectSubmittals(gate.tenantId, gate.userId));
    case 'CROSS_PROJECT_RFIS':
      return NextResponse.json(await fetchCrossProjectRfis(gate.tenantId, gate.userId));
    case 'PAY_APP_CYCLE':
      return NextResponse.json(await fetchPayAppCycle(gate.tenantId, gate.userId));
    case 'RECENT_ACTIVITY':
      return NextResponse.json(await fetchRecentActivity(gate.tenantId, gate.userId));
    case 'ALL_PM_WORKLOAD':
      return NextResponse.json(await fetchAllPmWorkload(gate.tenantId));
    case 'CROSS_PM_SUBMITTALS_RFIS':
      return NextResponse.json(await fetchCrossPmSubmittalsRfis(gate.tenantId));
    case 'PROJECT_HEALTH_HEAT_MAP':
      return NextResponse.json(await fetchProjectHealthHeatMap(gate.tenantId));
    default: {
      const _exhaustive: never = widgetKind;
      return NextResponse.json(
        { error: `Unhandled widget_kind: ${String(_exhaustive)}` },
        { status: 500 },
      );
    }
  }
}
