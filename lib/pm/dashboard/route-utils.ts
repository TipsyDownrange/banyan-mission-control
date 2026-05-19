/**
 * BAN-348 PM-V1.0-I — Validators + sanitisers for dashboard layout payloads.
 *
 * Layout payloads are JSON blobs persisted to user_dashboard_layouts.
 * react-grid-layout is the source of truth for the grid item shape; we
 * keep validation conservative (every entry must have i/x/y/w/h numeric
 * fields and the `i` value must be a known WidgetKind).
 */

import {
  WIDGET_KINDS,
  isWidgetKind,
  type DashboardLayout,
  type LayoutItem,
  type WidgetKind,
} from './types';

export function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0;
}

export function parseLayoutItem(value: unknown): LayoutItem | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!isWidgetKind(v.i)) return null;
  if (!isNonNegInt(v.x)) return null;
  if (!isNonNegInt(v.y)) return null;
  if (!isPositiveInt(v.w)) return null;
  if (!isPositiveInt(v.h)) return null;
  const item: LayoutItem = {
    i: v.i,
    x: v.x,
    y: v.y,
    w: v.w,
    h: v.h,
  };
  if (isPositiveInt(v.minW)) item.minW = v.minW;
  if (isPositiveInt(v.minH)) item.minH = v.minH;
  return item;
}

/**
 * Validate + normalize an inbound layout payload.  Returns null if the
 * payload is malformed.  Drops items with unknown widget kinds rather
 * than rejecting the entire payload.
 */
export function parseLayoutData(value: unknown): DashboardLayout | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.items)) return null;

  const items: LayoutItem[] = [];
  const seen = new Set<WidgetKind>();
  for (const raw of v.items) {
    const item = parseLayoutItem(raw);
    if (!item) continue;
    // De-dupe by widget kind — last write wins.
    if (seen.has(item.i)) {
      const idx = items.findIndex((it) => it.i === item.i);
      if (idx >= 0) items[idx] = item;
    } else {
      seen.add(item.i);
      items.push(item);
    }
  }
  return { items };
}

export function parseVisibleWidgets(value: unknown): WidgetKind[] | null {
  if (!Array.isArray(value)) return null;
  const out: WidgetKind[] = [];
  const seen = new Set<WidgetKind>();
  for (const v of value) {
    if (!isWidgetKind(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function filterLayoutToVisible(
  layout: DashboardLayout,
  visible: readonly WidgetKind[],
): DashboardLayout {
  const set = new Set<WidgetKind>(visible);
  return { items: layout.items.filter((it) => set.has(it.i)) };
}

/** Convenience: list every widget kind not currently visible. */
export function hiddenWidgetsFor(visible: readonly WidgetKind[]): WidgetKind[] {
  const set = new Set<WidgetKind>(visible);
  return WIDGET_KINDS.filter((k) => !set.has(k));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
