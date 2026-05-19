/**
 * BAN-348 PM-V1.0-I — Dashboard layout parser / sanitizer tests.
 */

import {
  filterLayoutToVisible,
  hiddenWidgetsFor,
  isUuid,
  parseLayoutData,
  parseLayoutItem,
  parseVisibleWidgets,
} from '@/lib/pm/dashboard/route-utils';
import {
  seedLayoutForDashboardKind,
  seedVisibleWidgetsFor,
} from '@/lib/pm/dashboard/default-layouts';
import { BASE_WIDGET_KINDS, WIDGET_KINDS } from '@/lib/pm/dashboard/types';

describe('BAN-348 parseLayoutItem', () => {
  it('accepts a valid grid item with the canonical fields', () => {
    expect(parseLayoutItem({ i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 }))
      .toEqual({ i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 });
  });

  it('carries optional minW / minH if present + numeric', () => {
    expect(parseLayoutItem({ i: 'MY_PROJECTS', x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 2 }))
      .toEqual({ i: 'MY_PROJECTS', x: 6, y: 0, w: 6, h: 2, minW: 3, minH: 2 });
  });

  it('rejects unknown widget kinds', () => {
    expect(parseLayoutItem({ i: 'WHO_KNOWS', x: 0, y: 0, w: 6, h: 2 })).toBeNull();
  });

  it('rejects negative or non-integer coordinates / sizes', () => {
    expect(parseLayoutItem({ i: 'MY_PROJECTS', x: -1, y: 0, w: 6, h: 2 })).toBeNull();
    expect(parseLayoutItem({ i: 'MY_PROJECTS', x: 0.5, y: 0, w: 6, h: 2 })).toBeNull();
    expect(parseLayoutItem({ i: 'MY_PROJECTS', x: 0, y: 0, w: 0, h: 2 })).toBeNull();
    expect(parseLayoutItem({ i: 'MY_PROJECTS', x: 0, y: 0, w: 6, h: -1 })).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseLayoutItem(null)).toBeNull();
    expect(parseLayoutItem('grid')).toBeNull();
    expect(parseLayoutItem(42)).toBeNull();
  });
});

describe('BAN-348 parseLayoutData', () => {
  it('returns null when items is missing or not an array', () => {
    expect(parseLayoutData(null)).toBeNull();
    expect(parseLayoutData({})).toBeNull();
    expect(parseLayoutData({ items: 'oops' })).toBeNull();
  });

  it('drops malformed items but keeps the valid ones', () => {
    const parsed = parseLayoutData({
      items: [
        { i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 },
        { i: 'BOGUS', x: 0, y: 0, w: 6, h: 2 },
        { i: 'MY_PROJECTS', x: 6, y: 0, w: 6, h: 2 },
      ],
    });
    expect(parsed?.items.map((i) => i.i)).toEqual(['MY_OPEN_ACTIONS', 'MY_PROJECTS']);
  });

  it('de-duplicates by widget kind — last write wins', () => {
    const parsed = parseLayoutData({
      items: [
        { i: 'MY_OPEN_ACTIONS', x: 0, y: 0, w: 6, h: 2 },
        { i: 'MY_OPEN_ACTIONS', x: 4, y: 4, w: 4, h: 4 },
      ],
    });
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toMatchObject({ i: 'MY_OPEN_ACTIONS', x: 4, y: 4, w: 4, h: 4 });
  });
});

describe('BAN-348 parseVisibleWidgets', () => {
  it('filters out unknown kinds and dedupes', () => {
    expect(parseVisibleWidgets([
      'MY_OPEN_ACTIONS',
      'WHO_KNOWS',
      'MY_PROJECTS',
      'MY_OPEN_ACTIONS',
    ])).toEqual(['MY_OPEN_ACTIONS', 'MY_PROJECTS']);
  });

  it('returns null when the payload is not an array', () => {
    expect(parseVisibleWidgets(null)).toBeNull();
    expect(parseVisibleWidgets('x')).toBeNull();
    expect(parseVisibleWidgets({})).toBeNull();
  });

  it('preserves order of the first occurrence', () => {
    expect(parseVisibleWidgets(['MY_PROJECTS', 'MY_OPEN_ACTIONS', 'MY_PROJECTS']))
      .toEqual(['MY_PROJECTS', 'MY_OPEN_ACTIONS']);
  });
});

describe('BAN-348 filterLayoutToVisible / hiddenWidgetsFor', () => {
  it('filters layout items to only the visible set', () => {
    const layout = seedLayoutForDashboardKind('PM_OVERVIEW');
    const filtered = filterLayoutToVisible(layout, ['MY_OPEN_ACTIONS']);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0].i).toBe('MY_OPEN_ACTIONS');
  });

  it('hiddenWidgetsFor reports every kind not in visible', () => {
    const hidden = hiddenWidgetsFor(['MY_OPEN_ACTIONS']);
    expect(hidden).not.toContain('MY_OPEN_ACTIONS');
    for (const k of WIDGET_KINDS) {
      if (k === 'MY_OPEN_ACTIONS') continue;
      expect(hidden).toContain(k);
    }
  });
});

describe('BAN-348 seeded default layouts', () => {
  it('PM_OVERVIEW default contains all six base widgets', () => {
    const layout = seedLayoutForDashboardKind('PM_OVERVIEW');
    const ids = layout.items.map((i) => i.i).sort();
    expect(ids).toEqual([...BASE_WIDGET_KINDS].sort());
  });

  it('PM_OVERVIEW seeds My Open Actions top-left and My Projects top-right (per spec)', () => {
    const layout = seedLayoutForDashboardKind('PM_OVERVIEW');
    const actions = layout.items.find((i) => i.i === 'MY_OPEN_ACTIONS');
    const projects = layout.items.find((i) => i.i === 'MY_PROJECTS');
    expect(actions).toMatchObject({ x: 0, y: 0 });
    expect(projects).toMatchObject({ x: 6, y: 0 });
  });

  it('SERVICE_PM_OVERVIEW and GM_OVERVIEW include the senior trio', () => {
    for (const kind of ['SERVICE_PM_OVERVIEW', 'GM_OVERVIEW'] as const) {
      const layout = seedLayoutForDashboardKind(kind);
      const ids = new Set(layout.items.map((i) => i.i));
      expect(ids.has('ALL_PM_WORKLOAD')).toBe(true);
      expect(ids.has('CROSS_PM_SUBMITTALS_RFIS')).toBe(true);
      expect(ids.has('PROJECT_HEALTH_HEAT_MAP')).toBe(true);
    }
  });

  it('seedVisibleWidgetsFor exposes base only vs. base + senior', () => {
    expect(seedVisibleWidgetsFor('PM_OVERVIEW').sort()).toEqual([...BASE_WIDGET_KINDS].sort());
    expect(seedVisibleWidgetsFor('GM_OVERVIEW').sort()).toEqual([...WIDGET_KINDS].sort());
    expect(seedVisibleWidgetsFor('SERVICE_PM_OVERVIEW').sort()).toEqual([...WIDGET_KINDS].sort());
  });
});

describe('BAN-348 isUuid', () => {
  it('accepts canonical UUIDs', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('rejects non-UUIDs', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('00000000-0000-4000-8000')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
