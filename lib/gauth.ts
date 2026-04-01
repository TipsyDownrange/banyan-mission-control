import { google } from 'googleapis';

export function getServiceAccountKey() {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (!b64) throw new Error('GOOGLE_SA_KEY_B64 env var not set');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

export function getGoogleAuth(scopes: string[], subject?: string) {
  const key = getServiceAccountKey();
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
    subject,
  });
}

export function getSSToken() {
  const token = process.env.SS_TOKEN;
  if (!token) throw new Error('SS_TOKEN env var not set');
  return token.trim();
}
