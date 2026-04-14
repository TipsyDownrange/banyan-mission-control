/**
 * NextAuth configuration — extracted so authOptions can be imported by permissions.ts and other server code.
 * The route at app/api/auth/[...nextauth]/route.ts just re-exports these.
 */
import type { AuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Role map — must match lib/roles.ts ALL_USERS exactly
export const ROLE_MAP: Record<string, string> = {
  'kai@kulaglass.com':        'gm',  // Kai AI account — full admin access for QA/testing
  'sean@kulaglass.com':       'gm',
  'jody@kulaglass.com':       'owner',
  'frank@kulaglass.com':      'pm',
  'kyle@kulaglass.com':       'estimator',
  'jenny@kulaglass.com':      'admin_mgr',
  'joey@kulaglass.com':       'service_pm',
  'markolson@kulaglass.com':  'sales',
  'nate@kulaglass.com':       'super',
  'tia@kulaglass.com':        'pm_track',
  'jenna@kulaglass.com':      'admin',
  'sherilynn@kulaglass.com':  'service_pm',  // TEMP: elevated for WO catch-up — revert to admin after
  'karl@kulaglass.com':       'super',
};

export function getRoleFromEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  if (ROLE_MAP[normalized]) return ROLE_MAP[normalized];
  if (normalized.endsWith('@kulaglass.com')) return 'field';
  return 'none';
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { hd: 'kulaglass.com', prompt: 'select_account' } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ profile }) {
      return ((profile?.email as string) || '').endsWith('@kulaglass.com');
    },
    async session({ session }) {
      if (session.user?.email) {
        (session.user as { email: string; role?: string }).role = getRoleFromEmail(session.user.email);
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
};
