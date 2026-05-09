import { NextResponse } from 'next/server';
import { shouldReadServiceWorkOrdersFromPostgres } from '@/lib/service-work-orders/postgres-read';

export const WO_POSTGRES_READ_ONLY_SMOKE_CODE = 'WO_POSTGRES_READ_ONLY_SMOKE';

export function isWOStagingPostgresReadOnlySmokeMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return shouldReadServiceWorkOrdersFromPostgres(env);
}

export function blockWOStagingPostgresReadOnlyMutation(routeName: string) {
  if (!isWOStagingPostgresReadOnlySmokeMode()) return null;

  return NextResponse.json(
    {
      error: 'Staging is currently in Work Order Postgres read-only smoke mode. This route is blocked to prevent writing Sheets data that the Postgres-backed staging UI would not read back.',
      code: WO_POSTGRES_READ_ONLY_SMOKE_CODE,
      route: routeName,
    },
    { status: 409 },
  );
}
