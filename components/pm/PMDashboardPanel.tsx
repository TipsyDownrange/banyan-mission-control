'use client';
/**
 * BAN-348 PM-V1.0-I — PM Overview Dashboard (drag-rearrange landing).
 *
 * PM Trunk v1.0 §13.  Option D drag-rearrange layout — react-grid-layout
 * drives positional state on desktop (≥768px); mobile collapses to a
 * single-column stack with drag disabled and a hint banner.
 *
 * Without-Kai behavior: layout persistence is pure UI state in Postgres,
 * widget data queries are deterministic SQL.  Zero LLM calls.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Layout as RglLayout } from 'react-grid-layout';
import {
  WIDGET_KINDS,
  type DashboardKind,
  type DashboardLayout,
  type LayoutItem,
  type WidgetKind,
} from '@/lib/pm/dashboard/types';
import { DRAG_HANDLE_CLASS } from './widgets/WidgetShell';
import MyOpenActionsWidget from './widgets/MyOpenActionsWidget';
import MyProjectsWidget from './widgets/MyProjectsWidget';
import CrossProjectSubmittalsWidget from './widgets/CrossProjectSubmittalsWidget';
import CrossProjectRfisWidget from './widgets/CrossProjectRfisWidget';
import PayAppCycleWidget from './widgets/PayAppCycleWidget';
import RecentActivityWidget from './widgets/RecentActivityWidget';
import AllPmWorkloadWidget from './widgets/AllPmWorkloadWidget';
import CrossPmSubmittalsRfisWidget from './widgets/CrossPmSubmittalsRfisWidget';
import ProjectHealthHeatMapWidget from './widgets/ProjectHealthHeatMapWidget';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GridLayout = dynamic(
  () => import('react-grid-layout').then((m) => m.default),
  { ssr: false },
);

type LayoutResponse = {
  dashboard_kind: DashboardKind;
  role: string;
  layout_data: DashboardLayout;
  visible_widgets: WidgetKind[];
  is_default: boolean;
  last_modified: string | null;
};

const WIDGET_TITLES: Record<WidgetKind, string> = {
  MY_OPEN_ACTIONS: 'My Open Actions',
  MY_PROJECTS: 'My Projects',
  CROSS_PROJECT_SUBMITTALS: 'Submittal Pipeline',
  CROSS_PROJECT_RFIS: 'RFI Pipeline',
  PAY_APP_CYCLE: 'Pay App Cycle',
  RECENT_ACTIVITY: 'Recent Activity',
  ALL_PM_WORKLOAD: 'All-PM Workload',
  CROSS_PM_SUBMITTALS_RFIS: 'Cross-PM Pipelines',
  PROJECT_HEALTH_HEAT_MAP: 'Project Health Heat Map',
};

function renderWidget(
  kind: WidgetKind,
  onHide: (k: WidgetKind) => void,
): React.ReactNode {
  const props = { onHide: () => onHide(kind), showHide: true };
  switch (kind) {
    case 'MY_OPEN_ACTIONS':         return <MyOpenActionsWidget {...props} />;
    case 'MY_PROJECTS':             return <MyProjectsWidget {...props} />;
    case 'CROSS_PROJECT_SUBMITTALS':return <CrossProjectSubmittalsWidget {...props} />;
    case 'CROSS_PROJECT_RFIS':      return <CrossProjectRfisWidget {...props} />;
    case 'PAY_APP_CYCLE':           return <PayAppCycleWidget {...props} />;
    case 'RECENT_ACTIVITY':         return <RecentActivityWidget {...props} />;
    case 'ALL_PM_WORKLOAD':         return <AllPmWorkloadWidget {...props} />;
    case 'CROSS_PM_SUBMITTALS_RFIS':return <CrossPmSubmittalsRfisWidget {...props} />;
    case 'PROJECT_HEALTH_HEAT_MAP': return <ProjectHealthHeatMapWidget {...props} />;
  }
}

function toRglLayout(items: LayoutItem[]): RglLayout[] {
  return items.map((it) => ({
    i: it.i,
    x: it.x,
    y: it.y,
    w: it.w,
    h: it.h,
    minW: it.minW,
    minH: it.minH,
  }));
}

function fromRglLayout(rgl: RglLayout[]): LayoutItem[] {
  return rgl
    .filter((l): l is RglLayout & { i: WidgetKind } => (WIDGET_KINDS as readonly string[]).includes(l.i))
    .map((l) => ({
      i: l.i as WidgetKind,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      minW: l.minW,
      minH: l.minH,
    }));
}

export default function PMDashboardPanel() {
  const [resp, setResp] = useState<LayoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadLayout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/pm-dashboard/layout');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResp(j as LayoutResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLayout(); }, [loadLayout]);

  const visibleItems = useMemo(() => {
    if (!resp) return [] as LayoutItem[];
    const set = new Set<WidgetKind>(resp.visible_widgets);
    return resp.layout_data.items.filter((it) => set.has(it.i));
  }, [resp]);

  const hiddenWidgets = useMemo(() => {
    if (!resp) return [] as WidgetKind[];
    const set = new Set<WidgetKind>(resp.visible_widgets);
    return WIDGET_KINDS.filter((k) => !set.has(k));
  }, [resp]);

  const persistLayout = useCallback(
    async (layout: DashboardLayout, visible: WidgetKind[]) => {
      setSaving(true);
      try {
        const r = await fetch('/api/pm-dashboard/layout', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layout_data: layout, visible_widgets: visible }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setResp((cur) => cur ? { ...cur, layout_data: j.layout_data, visible_widgets: j.visible_widgets, is_default: false } : cur);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleDragChange = useCallback(
    (rgl: RglLayout[]) => {
      if (!resp) return;
      const items = fromRglLayout(rgl);
      const layout: DashboardLayout = { items };
      setResp({ ...resp, layout_data: layout, is_default: false });
      void persistLayout(layout, resp.visible_widgets);
    },
    [resp, persistLayout],
  );

  const handleHide = useCallback(
    (kind: WidgetKind) => {
      if (!resp) return;
      const visible = resp.visible_widgets.filter((k) => k !== kind);
      setResp({ ...resp, visible_widgets: visible });
      void persistLayout(resp.layout_data, visible);
    },
    [resp, persistLayout],
  );

  const handleShow = useCallback(
    (kind: WidgetKind) => {
      if (!resp) return;
      if (resp.visible_widgets.includes(kind)) return;
      const visible = [...resp.visible_widgets, kind];
      const hasTile = resp.layout_data.items.some((it) => it.i === kind);
      const items = hasTile
        ? resp.layout_data.items
        : [...resp.layout_data.items, { i: kind, x: 0, y: 999, w: 6, h: 2, minW: 3, minH: 2 }];
      const layout: DashboardLayout = { items };
      setResp({ ...resp, visible_widgets: visible, layout_data: layout });
      void persistLayout(layout, visible);
    },
    [resp, persistLayout],
  );

  const handleReset = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/pm-dashboard/layout', { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setResp(j as LayoutResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bos-color-ink-disabled)' }}>Loading dashboard…</div>;
  }
  if (error && !resp) {
    return (
      <div style={{ padding: 24, color: 'var(--color-red-700)', background: 'var(--color-red-50)', borderRadius: 12, border: '1px solid #fecaca', margin: 24 }}>
        Failed to load dashboard: {error}
      </div>
    );
  }
  if (!resp) return null;

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--color-ink-primary)', letterSpacing: '-0.01em' }}>
            PM Dashboard
          </div>
          <div style={{ fontSize: 12, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
            {resp.dashboard_kind.replace(/_/g, ' ').toLowerCase()} · {resp.is_default ? 'default layout' : 'custom layout'}
            {saving && ' · saving…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
              background: 'white', color: 'var(--color-ink-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {showHidden ? 'Hide' : 'Show'} widgets ({hiddenWidgets.length} hidden)
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 'none',
              background: 'var(--bos-color-brand-primary-deep)', color: 'white', fontSize: 12, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            Restore default layout
          </button>
        </div>
      </div>

      {!isDesktop && (
        <div
          data-testid="pm-dashboard-mobile-hint"
          style={{
            padding: '8px 12px', borderRadius: 8, background: '#fef9c3', border: '1px solid #fde047',
            color: '#854d0e', fontSize: 12, marginBottom: 12,
          }}
        >
          Drag-rearrange available on desktop (≥768px).
        </div>
      )}

      {showHidden && hiddenWidgets.length > 0 && (
        <div style={{ marginBottom: 12, padding: 12, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--bos-color-ink-disabled)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Hidden widgets
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hiddenWidgets.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleShow(k)}
                style={{
                  padding: '4px 10px', borderRadius: 999,
                  border: '1px solid #cbd5e1', background: 'white',
                  fontSize: 11, color: 'var(--color-ink-primary)', cursor: 'pointer',
                }}
              >
                + {WIDGET_TITLES[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {isDesktop ? (
        <GridLayout
          className="pm-dashboard-grid"
          layout={toRglLayout(visibleItems)}
          cols={12}
          rowHeight={120}
          width={typeof window !== 'undefined' ? Math.max(800, window.innerWidth - 280) : 1200}
          draggableHandle={`.${DRAG_HANDLE_CLASS}`}
          isResizable={false}
          margin={[12, 12]}
          onLayoutChange={handleDragChange}
        >
          {visibleItems.map((it) => (
            <div key={it.i} data-testid={`pm-dashboard-widget-${it.i}`}>
              {renderWidget(it.i, handleHide)}
            </div>
          ))}
        </GridLayout>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleItems.map((it) => (
            <div key={it.i} data-testid={`pm-dashboard-widget-${it.i}`} style={{ minHeight: 260 }}>
              {renderWidget(it.i, handleHide)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
