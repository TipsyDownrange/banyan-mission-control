'use client';
import BuildLifecycleTimeline from '@/components/BuildLifecycleTimeline';
import CaptainsOrders from '@/components/CaptainsOrders';

export default function WarRoomPanel() {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* War Room — Surface 1: The Chart (Build Lifecycle Timeline) */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>AI Command Center</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', margin: 0 }}>War Room</h1>
      </div>

      <BuildLifecycleTimeline />

      {/* S3 "Captain's Orders" (Decision Queue) — shipped */}
      <CaptainsOrders />

      {/* Future surfaces (per GC-D035 build order, file 1SWO1CXn5sbHGeZQchZDpy7U3AzWeD8QX): */}
      {/* S5 "Damage Control" (Drift Register) */}
      {/* S4 "Watch Bill" (Active Work Grid) */}
      {/* S2 "Sitrep" (Three-Step Lens) */}
    </div>
  );
}
