import { NextResponse } from 'next/server';

const REDIRECT_URI = 'https://banyan-mission-control.vercel.app/api/qbo/callback';
const SCOPE = 'com.intuit.quickbooks.accounting';

export async function GET() {
  const clientId = process.env.QBO_CLIENT_ID?.trim();
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim();

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

  // DIAGNOSTIC LOG — remove after QBO auth is confirmed working
  console.log('[QBO CONNECT DIAGNOSTIC]');
  console.log('  QBO_CLIENT_ID (first 8):', clientId ? clientId.slice(0, 8) + '...' : 'UNDEFINED');
  console.log('  QBO_CLIENT_SECRET (first 8):', clientSecret ? clientSecret.slice(0, 8) + '...' : 'UNDEFINED');
  console.log('  REDIRECT_URI:', REDIRECT_URI);
  console.log('  SCOPE:', SCOPE);
  console.log('  FULL AUTH URL:', authUrl.toString());
  console.log('  client_id param value:', authUrl.searchParams.get('client_id'));
  console.log('  redirect_uri param value:', authUrl.searchParams.get('redirect_uri'));

  return NextResponse.redirect(authUrl.toString());
}
