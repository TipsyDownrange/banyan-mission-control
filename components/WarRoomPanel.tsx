'use client';

import { useEffect, useState } from 'react';
import WarRoomDashboard from '@/components/WarRoomDashboard';
import type { WarRoomDashboardData } from '@/lib/war-room/types';

export default function WarRoomPanel() {
  const [data, setData] = useState<WarRoomDashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/war-room')
      .then(response => {
        if (!response.ok) throw new Error('War Room API failed');
        return response.json();
      })
      .then((payload: WarRoomDashboardData) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: '100%', background: '#071722', color: '#fca5a5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        War Room bridge data is unavailable.
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100%', background: '#071722', color: '#67e8f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        Loading BanyanOS War Room...
      </div>
    );
  }

  return <WarRoomDashboard initialData={data} />;
}
