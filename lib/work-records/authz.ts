import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { queryOne } from './db';

export const ROUTING_ROLES = new Set(['super_admin', 'owner', 'gm', 'business_admin']);
export const PM_ROLES = ['pm', 'service_pm'];

export async function requireKulaSession() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase() || '';
  if (!email.endsWith('@kulaglass.com')) {
    return { error: 'Unauthorized' as const, status: 401 as const };
  }
  const role = ((session!.user as { role?: string } | undefined)?.role) || 'none';
  const user = await queryOne<{ user_id: string; email: string; name: string | null; role: string | null }>(
    `select user_id, email, name, role::text from users where lower(email) = $1 and coalesce(active, true) = true limit 1`,
    [email],
  );
  return { session, email, role, user };
}

export function canRoute(role: string): boolean {
  return ROUTING_ROLES.has(role);
}
