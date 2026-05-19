'use client';
/**
 * BAN-348 PM-V1.0-I — Shared fetcher for widget data endpoints.
 */

import { useEffect, useState } from 'react';
import type { WidgetKind } from '@/lib/pm/dashboard/types';

export function useWidgetData<T>(kind: WidgetKind) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/pm-dashboard/widgets/${encodeURIComponent(kind)}/data`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (!cancelled) setData(j as T);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [kind]);

  return { data, loading, error };
}
