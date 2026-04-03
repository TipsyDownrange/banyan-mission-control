import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuth } from '@/lib/gauth';

export async function POST(req: Request) {
  try {
    const { messageId, delegateTo, delegateEmail, subject, snippet } = await req.json();

    if (!delegateEmail) return NextResponse.json({ error: 'No email for delegate' }, { status: 400 });

    // Send a delegation email from sean@ to the delegate
    const auth = new google.auth.JWT({
      email: (JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64!, 'base64').toString())).client_email,
      key: (JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64!, 'base64').toString())).private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: 'sean@kulaglass.com',
    });
    const gmail = google.gmail({ version: 'v1', auth });

    const body = [
      `Hi ${delegateTo},`,
      ``,
      `Delegating this bid invitation to you for review and action.`,
      ``,
      `Subject: ${subject}`,
      `Summary: ${snippet}`,
      ``,
      `Please review and add to the Bid Queue if we're bidding, or mark as No Bid.`,
      ``,
      `— Sean (via BanyanOS)`,
    ].join('\n');

    const boundary = 'boundary_delegate_' + Date.now();
    const raw = Buffer.from([
      `From: Sean Daniels <sean@kulaglass.com>`,
      `To: ${delegateTo} <${delegateEmail}>`,
      `Subject: Delegated: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n')).toString('base64url');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

    return NextResponse.json({ ok: true, to: delegateTo, email: delegateEmail });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
