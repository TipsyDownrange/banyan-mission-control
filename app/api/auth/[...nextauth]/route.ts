import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const ROLE_MAP: Record<string, string> = {
  'sean@kulaglass.com': 'admin',
  'jody@kulaglass.com': 'admin',
  'frank@kulaglass.com': 'management',
  'kyle@kulaglass.com': 'estimator',
  'jenny@kulaglass.com': 'estimator',
  'joey@kulaglass.com': 'service',
  'markolson@kulaglass.com': 'estimator',
  'nate@kulaglass.com': 'superintendent',
  'tia@kulaglass.com': 'admin',
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
