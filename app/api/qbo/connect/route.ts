import { NextResponse } from 'next/server';

const CLIENT_ID = process.env.QBO_CLIENT_ID!;
const REDIRECT_URI = 'https://banyan-mission-control.vercel.app/api/qbo/callback';
const SCOPE = 'com.intuit.quickbooks.accounting';

export async function GET() {
  const state = Math.random().toString(36).slice(2);
  const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
