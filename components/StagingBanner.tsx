// BAN-177: Mission Control staging banner.
// Server component — rendered only when VERCEL_TARGET_ENV=staging.
// Production (different Vercel project, no staging target env) renders nothing.
import { isStaging } from '@/lib/env';

export default function StagingBanner() {
  if (!isStaging()) return null;

  return (
    <div
      role="status"
      aria-label="Staging environment"
      data-testid="staging-banner"
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10000,
        padding: '6px 14px',
        borderRadius: 999,
        background: '#facc15',
        color: '#111827',
        border: '1px solid #b45309',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontFamily: '-apple-system, SF Pro Display, Inter, system-ui, sans-serif',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      STAGING — SAFE TEST DATA
    </div>
  );
}
