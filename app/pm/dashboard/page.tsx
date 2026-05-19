'use client';
/**
 * BAN-348 PM-V1.0-I — /pm/dashboard route.
 *
 * Bounces into the main Home view with the PM Dashboard panel pre-selected
 * via the ?view= query param (mirrors the existing ?wo= deep-link pattern
 * in app/page.tsx).  Keeps the navigation chrome (sidebar, header) intact
 * without duplicating layout code.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PMDashboardRoute() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/?view=PM%20Dashboard');
  }, [router]);
  return null;
}
