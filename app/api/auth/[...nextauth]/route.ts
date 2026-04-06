import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// Roles must match lib/roles.ts ALL_USERS exactly
const ROLE_MAP: Record<string, string> = {
  'sean@kulaglass.com': 'gm',
  'jody@kulaglass.com': 'owner',
  'frank@kulaglass.com': 'pm',
  'kyle@kulaglass.com': 'estimator',
  'jenny@kulaglass.com': 'admin_mgr',
  'joey@kulaglass.com': 'service_pm',
  'markolson@kulaglass.com': 'sales',
  'nate@kulaglass.com': 'super',
  'tia@kulaglass.com': 'pm_track',
  'jenna@kulaglass.com': 'admin',
  'sherilynn@kulaglass.com': 'admin',
  'karl@kulaglass.com': 'super',
};

function getRole(email: string): string {
  if (ROLE_MAP[email]) return ROLE_MAP[email];
  if (email.endsWith('@kulaglass.com')) return 'field';
  return 'none';
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
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
        (session.user as {email: string; role?: string}).role = getRole(session.user.email.toLowerCase());
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
});

export { handler as GET, handler as POST };
