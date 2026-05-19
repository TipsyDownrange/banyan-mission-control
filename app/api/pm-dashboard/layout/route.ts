/**
 * BAN-348 PM-V1.0-I — PM Overview Dashboard layout API.
 *
 *   GET     /api/pm-dashboard/layout  — current user's layout (or default)
 *   PATCH   /api/pm-dashboard/layout  — upsert layout_data + visible_widgets
 *   DELETE  /api/pm-dashboard/layout  — reset to seeded default
 *
 * Per-user persistence keyed by (user_id, dashboard_kind).  The dashboard_kind
 * is derived from the caller's role server-side — clients cannot ask for
 * another role's layout.  Layout payloads are validated against the
 * react-grid-layout item shape before persisting.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, user_dashboard_layouts } from '@/db';
import {
  passPmDashboardReadGate,
  passPmDashboardWriteGate,
} from '@/lib/pm/dashboard/api-gate';
import {
  parseLayoutData,
  parseVisibleWidgets,
} from '@/lib/pm/dashboard/route-utils';
import {
  seedLayoutForDashboardKind,
  seedVisibleWidgetsFor,
} from '@/lib/pm/dashboard/default-layouts';
import type { DashboardLayout, WidgetKind } from '@/lib/pm/dashboard/types';

export async function GET() {
  const gate = await passPmDashboardReadGate();
  if (!gate.ok) return gate.response;

  const rows = await db
    .select({
      layout_id: user_dashboard_layouts.layout_id,
      tenant_id: user_dashboard_layouts.tenant_id,
      user_id: user_dashboard_layouts.user_id,
      dashboard_kind: user_dashboard_layouts.dashboard_kind,
      layout_data: user_dashboard_layouts.layout_data,
      visible_widgets: user_dashboard_layouts.visible_widgets,
      last_modified: user_dashboard_layouts.last_modified,
    })
    .from(user_dashboard_layouts)
    .where(
      and(
        eq(user_dashboard_layouts.tenant_id, gate.tenantId),
        eq(user_dashboard_layouts.user_id, gate.userId),
        eq(user_dashboard_layouts.dashboard_kind, gate.dashboardKind),
      ),
    )
    .limit(1);

  if (rows.length > 0) {
    const row = rows[0];
    return NextResponse.json({
      dashboard_kind: gate.dashboardKind,
      role: gate.role,
      layout_data: row.layout_data as DashboardLayout,
      visible_widgets: row.visible_widgets as WidgetKind[],
      is_default: false,
      last_modified: row.last_modified,
    });
  }

  return NextResponse.json({
    dashboard_kind: gate.dashboardKind,
    role: gate.role,
    layout_data: seedLayoutForDashboardKind(gate.dashboardKind),
    visible_widgets: seedVisibleWidgetsFor(gate.dashboardKind),
    is_default: true,
    last_modified: null,
  });
}

export async function PATCH(req: Request) {
  const gate = await passPmDashboardWriteGate();
  if (!gate.ok) return gate.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const layout = parseLayoutData(body.layout_data);
  if (!layout) {
    return NextResponse.json(
      { error: 'layout_data must be { items: LayoutItem[] }' },
      { status: 400 },
    );
  }
  const visible = parseVisibleWidgets(body.visible_widgets);
  if (!visible) {
    return NextResponse.json(
      { error: 'visible_widgets must be WidgetKind[]' },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ layout_id: user_dashboard_layouts.layout_id })
    .from(user_dashboard_layouts)
    .where(
      and(
        eq(user_dashboard_layouts.user_id, gate.userId),
        eq(user_dashboard_layouts.dashboard_kind, gate.dashboardKind),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(user_dashboard_layouts)
      .set({
        layout_data: layout,
        visible_widgets: visible,
        last_modified: new Date(),
      })
      .where(eq(user_dashboard_layouts.layout_id, existing[0].layout_id));
  } else {
    await db.insert(user_dashboard_layouts).values({
      tenant_id: gate.tenantId,
      user_id: gate.userId,
      dashboard_kind: gate.dashboardKind,
      layout_data: layout,
      visible_widgets: visible,
    });
  }

  return NextResponse.json({
    dashboard_kind: gate.dashboardKind,
    role: gate.role,
    layout_data: layout,
    visible_widgets: visible,
    is_default: false,
  });
}

export async function DELETE() {
  const gate = await passPmDashboardWriteGate();
  if (!gate.ok) return gate.response;

  await db
    .delete(user_dashboard_layouts)
    .where(
      and(
        eq(user_dashboard_layouts.user_id, gate.userId),
        eq(user_dashboard_layouts.dashboard_kind, gate.dashboardKind),
      ),
    );

  return NextResponse.json({
    dashboard_kind: gate.dashboardKind,
    role: gate.role,
    layout_data: seedLayoutForDashboardKind(gate.dashboardKind),
    visible_widgets: seedVisibleWidgetsFor(gate.dashboardKind),
    is_default: true,
    last_modified: null,
  });
}
