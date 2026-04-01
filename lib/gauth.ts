import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';

const KEY_FILE = '/Users/kulaglassopenclaw/glasscore/credentials/drive-service-account.json';

export function getJWT(scopes: string[], subject?: string) {
  const key = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
    subject,
  });
  return jwt;
}

export async function getAccessToken(scopes: string[], subject?: string) {
  const jwt = getJWT(scopes, subject);
  const token = await jwt.getAccessToken();
  return token.token;
}
