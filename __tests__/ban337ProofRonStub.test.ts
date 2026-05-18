/**
 * BAN-337 Pay Apps v2b — Proof RON 503 stubs.
 *
 * Verifies the deferred Proof RON automated notarization endpoints return
 * 503 with the canonical PROOF_RON_BUSINESS_ACCOUNT_REQUIRED code so the
 * UI / consumers can detect the feature flag without parsing prose.
 */

describe('BAN-337 POST /api/pay-apps/[id]/notarize stub', () => {
  it('returns 503 with PROOF_RON_BUSINESS_ACCOUNT_REQUIRED', async () => {
    const { POST } = await import('@/app/api/pay-apps/[id]/notarize/route');
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('feature_not_available');
    expect(body.code).toBe('PROOF_RON_BUSINESS_ACCOUNT_REQUIRED');
    expect(body.message).toContain('Business account');
    expect(body.message).toContain('upload-notarized');
    expect(body.forward_to).toBe('/api/pay-apps/[id]/upload-notarized');
  });
});

describe('BAN-337 POST /api/webhooks/proof stub', () => {
  it('returns 503 and logs the unauthorized hit', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { POST } = await import('@/app/api/webhooks/proof/route');
      const req = new Request('http://localhost/api/webhooks/proof', {
        method: 'POST',
        headers: { 'x-forwarded-for': '1.2.3.4', 'x-proof-signature': 'abc' },
        body: JSON.stringify({ phantom: 'payload' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('PROOF_RON_BUSINESS_ACCOUNT_REQUIRED');
      expect(warnSpy).toHaveBeenCalled();
      const logArgs = warnSpy.mock.calls[0];
      expect(String(logArgs[0])).toContain('proof-webhook');
      expect(String(logArgs[1])).toContain('1.2.3.4');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
