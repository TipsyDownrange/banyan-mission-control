import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const email = (token?.email as string || '').toLowerCase();
    if (!email.endsWith('@kulaglass.com')) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => !!token },
    pages: { signIn: '/login' },
  }
);

export const config = {
  // Protect all routes including /api, except NextAuth endpoints, Next.js internals, and login page
  matcher: ['/((?!api/auth|api/qbo|_next|login|favicon).*)'],
};
