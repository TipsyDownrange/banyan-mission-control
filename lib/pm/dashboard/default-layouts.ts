/**
 * BAN-348 PM-V1.0-I — Seeded default layouts per dashboard_kind.
 *
 * Per spec §13.1 / §13.2: My Open Actions top-left (2x2), My Projects
 * top-right (2x2), Cross-Project Pipelines below.  Senior variants
 * additionally include the three senior widgets stacked underneath.
 *
 * react-grid-layout uses a 12-column grid by default; widget tiles are
 * 6 columns wide (half-width on desktop), and 2 rows tall in the default
 * configuration so the top fold shows actions + projects side by side.
 */

import {
  BASE_WIDGET_KINDS,
  SENIOR_WIDGET_KINDS,
  type DashboardKind,
  type DashboardLayout,
  type LayoutItem,
  type WidgetKind,
} from './types';

const W = 6;
const H = 2;

function tile(i: WidgetKind, x: number, y: number, w = W, h = H): LayoutItem {
  return { i, x, y, w, h, minW: 3, minH: 2 };
}

function baseLayout(): DashboardLayout {
  return {
    items: [
      tile('MY_OPEN_ACTIONS', 0, 0),
      tile('MY_PROJECTS', 6, 0),
      tile('CROSS_PROJECT_SUBMITTALS', 0, 2),
      tile('CROSS_PROJECT_RFIS', 6, 2),
      tile('PAY_APP_CYCLE', 0, 4),
      tile('RECENT_ACTIVITY', 6, 4),
    ],
  };
}

function seniorLayout(): DashboardLayout {
  return {
    items: [
      ...baseLayout().items,
      tile('ALL_PM_WORKLOAD', 0, 6),
      tile('CROSS_PM_SUBMITTALS_RFIS', 6, 6),
      tile('PROJECT_HEALTH_HEAT_MAP', 0, 8, 12, H),
    ],
  };
}

export function seedLayoutForDashboardKind(kind: DashboardKind): DashboardLayout {
  if (kind === 'PM_OVERVIEW') return baseLayout();
  return seniorLayout();
}

export function seedVisibleWidgetsFor(kind: DashboardKind): WidgetKind[] {
  if (kind === 'PM_OVERVIEW') return [...BASE_WIDGET_KINDS];
  return [...BASE_WIDGET_KINDS, ...SENIOR_WIDGET_KINDS];
}
