import { NextRequest, NextResponse } from 'next/server';

const REDIRECT_URI = 'https://banyan-mission-control.vercel.app/api/qbo/callback';

export async function GET(req: NextRequest) {
  const CLIENT_ID = process.env.QBO_CLIENT_ID;
  const CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new NextResponse('QBO OAuth misconfigured: QBO_CLIENT_ID or QBO_CLIENT_SECRET not set in this environment.', { status: 500 });
  }
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const error = searchParams.get('error');

  if (error) {
    return new NextResponse(`Auth error: ${error}`, { status: 400 });
  }

  if (!code || !realmId) {
    return new NextResponse('Missing code or realmId', { status: 400 });
  }

  // Exchange code for tokens
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokenRes.ok) {
    return new NextResponse(`Token exchange failed: ${JSON.stringify(tokens)}`, { status: 500 });
  }

  // Return success page with tokens displayed (you'll save these)
  const html = `
<!DOCTYPE html>
<html>
<head><title>QuickBooks Connected</title>
<style>body{font-family:system-ui;max-width:600px;margin:60px auto;padding:20px;background:#f8fafc;}
.card{background:white;border-radius:16px;padding:24px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.06);}
h1{color:#0f766e;margin:0 0 8px;}
p{color:#64748b;margin:0 0 16px;}
pre{background:#f1f5f9;border-radius:8px;padding:16px;overflow-x:auto;font-size:12px;color:#334155;}
.success{color:#0f766e;font-weight:700;font-size:18px;}</style>
</head>
<body>
<div class="card">
  <p class="success">✓ QuickBooks Connected Successfully</p>
  <h1>BanyanOS + QuickBooks Online</h1>
  <p>Authorization complete. Copy the tokens below and send them to Kai to complete setup.</p>
  <pre>REALM_ID: ${realmId}
ACCESS_TOKEN: ${tokens.access_token?.slice(0, 40)}...
REFRESH_TOKEN: ${tokens.refresh_token}
EXPIRES_IN: ${tokens.expires_in}s
X_REFRESH_TOKEN_EXPIRES_IN: ${tokens.x_refresh_token_expires_in}s</pre>
  <p style="margin-top:16px;font-size:13px;color:#94a3b8;">Send the full REFRESH_TOKEN to Kai via Telegram to complete the connection.</p>
</div>
</body>
</html>`;

  // Also log to console for server-side capture
  console.log('QBO_REALM_ID:', realmId);
  console.log('QBO_REFRESH_TOKEN:', tokens.refresh_token);

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
