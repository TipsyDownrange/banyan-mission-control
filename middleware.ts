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
  matcher: ['/((?!api|_next|login|favicon).*)'],
};
