/**
 * BAN-374 P6 — /admin/freight-calendar
 *
 * Server-side wrapper around the FreightCalendarManager client component.
 * Mounted under /admin to keep the surface gated to admin-tier roles by the
 * existing middleware boundary.  The underlying /api/schedule/freight-calendar
 * routes enforce SCHEDULE_VIEW / SCHEDULE_WRITE; the UI hides write controls
 * for sessions lacking a known write role to avoid permission-deny prompts.
 */

import FreightCalendarManager from '@/components/admin/FreightCalendarManager';

export const dynamic = 'force-dynamic';

export default function FreightCalendarAdminPage() {
  return (
    <main
      style={{
        padding: '32px 28px',
        maxWidth: 1100,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
      data-testid="freight-calendar-admin-page"
    >
      <div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: 'var(--color-ink-primary)', letterSpacing: '-0.01em',
        }}>
          Freight calendar
        </div>
        <div style={{ fontSize: 13, color: 'var(--bos-color-ink-disabled)', marginTop: 4 }}>
          Matson sailing schedule entries. They surface as overlays on project
          Schedule tabs to align procurement and install windows with arrival
          dates (BanyanOS Scheduling Spine, Hawaii overlays).
        </div>
      </div>
      <FreightCalendarManager />
    </main>
  );
}
