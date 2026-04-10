import { NextResponse } from 'next/server';

const REDIRECT_URI = 'https://banyan-mission-control.vercel.app/api/qbo/callback';
const SCOPE = 'com.intuit.quickbooks.accounting';

export async function GET() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;

  // Guard: return a clear error if env vars are missing
  // (prevents Intuit from receiving "undefined" as client_id)
  if (!clientId || !clientSecret) {
    const missing = [
      !clientId && 'QBO_CLIENT_ID',
      !clientSecret && 'QBO_CLIENT_SECRET',
    ].filter(Boolean).join(', ');
    return NextResponse.json(
      {
        error: 'QBO OAuth misconfigured',
        message: `Missing environment variables: ${missing}. Set them in Vercel → Project Settings → Environment Variables for Production, Preview, and Development.`,
        missing_vars: missing,
      },
      { status: 500 }
    );
  }

  const state = Math.random().toString(36).slice(2);
  const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
