import { NextResponse } from 'next/server';
import { google } from 'googleapis';

/** RFC 2047 encode a header value so non-ASCII characters survive SMTP */
function rfc2047Encode(text: string): string {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  const encoded = Buffer.from(text, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

export async function POST(req: Request) {
  try {
    const { messageId, delegateTo, delegateEmail, subject, snippet } = await req.json();

    if (!delegateEmail) return NextResponse.json({ error: 'No email for delegate' }, { status: 400 });
    if (!messageId) return NextResponse.json({ error: 'No messageId' }, { status: 400 });

    const keyJson = JSON.parse(Buffer.from(process.env.GOOGLE_SA_KEY_B64!, 'base64').toString());
    const auth = new google.auth.JWT({
      email: keyJson.client_email,
      key: keyJson.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send'],
      subject: 'sean@kulaglass.com',
    });
    const gmail = google.gmail({ version: 'v1', auth });

    // Fetch the original message in RFC 2822 format
    const original = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'raw',
    });

    const rawOriginal = original.data.raw;
    if (!rawOriginal) throw new Error('Could not fetch original message');

    // Decode the original email
    const originalBytes = Buffer.from(rawOriginal, 'base64url');
    const originalText = originalBytes.toString('utf8');

    // Build a proper forward:
    // New headers → blank line → "Fwd note" → blank line → original message
    const fwdNote = [
      `---------- Forwarded message ---------`,
      `From: sean@kulaglass.com`,
      `Subject: ${rfc2047Encode(subject)}`,
      ``,
      `Delegating to you for review and action. Please add to Bid Queue or mark No Bid.`,
      ``,
      `— Sean (via BanyanOS)`,
      ``,
    ].join('\n');

    // Strip the original headers and prepend our own
    // Find the end of headers (first blank line)
    const headerEnd = originalText.indexOf('\n\n');
    const originalBody = headerEnd >= 0 ? originalText.slice(headerEnd + 2) : originalText;
    const originalHeaders = headerEnd >= 0 ? originalText.slice(0, headerEnd) : '';

    // Extract content-type from original to preserve it
    const contentTypeMatch = originalHeaders.match(/Content-Type:[^\n]+(\n[ \t][^\n]+)*/i);
    const contentType = contentTypeMatch ? contentTypeMatch[0] : 'Content-Type: text/plain; charset=utf-8';

    // Build the forwarded message
    const forwardedEmail = [
      `From: Sean Daniels <sean@kulaglass.com>`,
      `To: ${delegateTo} <${delegateEmail}>`,
      `Subject: ${rfc2047Encode('Fwd: ' + subject)}`,
      `MIME-Version: 1.0`,
      contentType,
      ``,
      fwdNote,
      `--- Original Message ---`,
      originalBody,
    ].join('\n');

    const encodedForward = Buffer.from(forwardedEmail).toString('base64url');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedForward },
    });

    return NextResponse.json({ ok: true, to: delegateTo, email: delegateEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Delegate error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
