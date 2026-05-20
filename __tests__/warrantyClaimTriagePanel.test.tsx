/**
 * BAN-375 Closeout v1.1 Phase 2 — WarrantyClaimTriagePanel tests.
 *
 * Verifies the read-only claim summary, every triage_result enum
 * value renders as a dropdown option, validation errors surface,
 * ADR-026 INVALID_SERVICE_WO_ID code propagates, and buildTriagePayload
 * matches the shape the PATCH /api/closeout/warranty-claims/[id] route
 * (app/api/closeout/warranty-claims/[id]/route.ts:25-30) accepts.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TriagePanelView,
  buildTriagePayload,
  EMPTY_TRIAGE,
  type WarrantyClaimSummary,
  type TriageValues,
} from '../components/closeout/WarrantyClaimTriagePanel';

const noop = () => undefined;

const CLAIM: WarrantyClaimSummary = {
  claim_id: '33333333-3333-4333-8333-333333333333',
  warranty_id: '11111111-1111-4111-8111-111111111111',
  inbound_source: 'EMAIL',
  inbound_date: '2026-05-10',
  issue_description: 'Sealant failure at SE corner curtain wall',
};

function withTriageResult(result: string): TriageValues {
  return { ...EMPTY_TRIAGE, triage_result: result, triage_reasoning: 'Investigated on site.' };
}

describe('BAN-375 WarrantyClaimTriagePanel — TriagePanelView render', () => {
  it('renders the claim summary fields read-only above the form', () => {
    const html = renderToStaticMarkup(
      <TriagePanelView
        claim={CLAIM}
        values={EMPTY_TRIAGE}
        actorEmail='pm@kulaglass.com'
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain(CLAIM.claim_id);
    expect(html).toContain('Sealant failure at SE corner curtain wall');
    expect(html).toContain('2026-05-10');
    expect(html).toContain('EMAIL');
  });

  it('renders all 5 triage_result enum values as dropdown options', () => {
    const html = renderToStaticMarkup(
      <TriagePanelView
        claim={CLAIM}
        values={EMPTY_TRIAGE}
        actorEmail={null}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    for (const v of [
      'KULA_RESPONSIBLE',
      'MANUFACTURER_RESPONSIBLE',
      'OTHER_TRADE_RESPONSIBLE',
      'OUT_OF_WARRANTY',
      'DISPUTED',
    ]) {
      expect(html).toContain(`value="${v}"`);
    }
  });

  it('disables the submit while submitting', () => {
    const html = renderToStaticMarkup(
      <TriagePanelView
        claim={CLAIM}
        values={withTriageResult('KULA_RESPONSIBLE')}
        actorEmail='pm@kulaglass.com'
        submitting={true}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Saving…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="warranty-claim-triage-submit"/);
  });

  it('renders a validation error banner with the error message', () => {
    const html = renderToStaticMarkup(
      <TriagePanelView
        claim={CLAIM}
        values={EMPTY_TRIAGE}
        actorEmail={null}
        submitting={false}
        errorMessage="triage_result must be one of KULA_RESPONSIBLE, MANUFACTURER_RESPONSIBLE, OTHER_TRADE_RESPONSIBLE, OUT_OF_WARRANTY, DISPUTED"
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('triage_result must be one of');
  });

  it('propagates the INVALID_SERVICE_WO_ID error code (ADR-026)', () => {
    const html = renderToStaticMarkup(
      <TriagePanelView
        claim={CLAIM}
        values={withTriageResult('KULA_RESPONSIBLE')}
        actorEmail='pm@kulaglass.com'
        submitting={false}
        errorMessage='service_wo_id must start with SRV-'
        errorCode='INVALID_SERVICE_WO_ID'
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-error-code="INVALID_SERVICE_WO_ID"');
    expect(html).toContain('SRV-');
  });

  it('shows the current actor in the triage attribution line', () => {
    const html = renderToStaticMarkup(
      <TriagePanelView
        claim={CLAIM}
        values={EMPTY_TRIAGE}
        actorEmail='pm@kulaglass.com'
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Triaged by pm@kulaglass.com');
  });
});

describe('BAN-375 WarrantyClaimTriagePanel — buildTriagePayload', () => {
  it.each([
    'KULA_RESPONSIBLE',
    'MANUFACTURER_RESPONSIBLE',
    'OTHER_TRADE_RESPONSIBLE',
    'OUT_OF_WARRANTY',
    'DISPUTED',
  ])('builds a PATCH payload for triage_result=%s with reasoning + triage_at', (result) => {
    const payload = buildTriagePayload(withTriageResult(result));
    expect(payload).toMatchObject({
      triage_result: result,
      triage_reasoning: 'Investigated on site.',
    });
    expect(typeof payload.triage_at).toBe('string');
    expect((payload.triage_at as string).length).toBeGreaterThan(0);
  });

  it('includes service_wo_id only when set', () => {
    const without = buildTriagePayload(withTriageResult('KULA_RESPONSIBLE'));
    expect(without.service_wo_id).toBeUndefined();

    const withSrv = buildTriagePayload({
      ...withTriageResult('KULA_RESPONSIBLE'),
      service_wo_id: 'SRV-26-0001',
    });
    expect(withSrv.service_wo_id).toBe('SRV-26-0001');
  });

  it('includes back_charge_id only when set', () => {
    const without = buildTriagePayload(withTriageResult('KULA_RESPONSIBLE'));
    expect(without.back_charge_id).toBeUndefined();

    const withBc = buildTriagePayload({
      ...withTriageResult('KULA_RESPONSIBLE'),
      back_charge_id: '44444444-4444-4444-8444-444444444444',
    });
    expect(withBc.back_charge_id).toBe('44444444-4444-4444-8444-444444444444');
  });
});
