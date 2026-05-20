/**
 * BAN-375 Closeout v1.1 Phase 2 — WarrantyClaimCaptureForm tests.
 *
 * Renders the pure FormView in the states the orchestrator can hand it:
 * empty (no warranties), happy-path-ready, submitting, validation
 * failure, and the ADR-026 INVALID_SERVICE_WO_ID code surfaced from
 * the existing POST /api/closeout/warranty-claims route.
 *
 * Also exercises `buildPayload` directly so the test pins the exact
 * payload shape the server route validates (per
 * app/api/closeout/warranty-claims/route.ts line 31-48).
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  FormView,
  buildPayload,
  EMPTY_VALUES,
  type WarrantyClaimCaptureValues,
} from '../components/closeout/WarrantyClaimCaptureForm';
import type { WarrantyRow } from '../components/closeout/WarrantyRecordCard';

const noop = () => undefined;

const W1: WarrantyRow = {
  warranty_id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  engagement_id: '22222222-2222-4222-8222-222222222222',
  start_date: '2026-05-01',
  scope_warranties: [],
  status: 'ACTIVE',
};

const W2: WarrantyRow = { ...W1, warranty_id: '99999999-9999-4999-8999-999999999999' };

function readyValues(overrides?: Partial<WarrantyClaimCaptureValues>): WarrantyClaimCaptureValues {
  return {
    ...EMPTY_VALUES,
    warranty_id: W1.warranty_id,
    inbound_source: 'EMAIL',
    inbound_date: '2026-05-10',
    issue_description: 'Sealant failure at SE corner curtain wall',
    ...(overrides ?? {}),
  };
}

describe('BAN-375 WarrantyClaimCaptureForm — FormView render', () => {
  it('renders the empty-warranties placeholder when warranties array is empty', () => {
    const html = renderToStaticMarkup(
      <FormView
        values={EMPTY_VALUES}
        warranties={[]}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('No warranties available');
  });

  it('renders an option per warranty when warranties are supplied', () => {
    const html = renderToStaticMarkup(
      <FormView
        values={EMPTY_VALUES}
        warranties={[W1, W2]}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Select warranty (2)');
    expect(html).toContain(W1.warranty_id);
    expect(html).toContain(W2.warranty_id);
  });

  it('renders the four required field inputs (warranty, source, date, description)', () => {
    const html = renderToStaticMarkup(
      <FormView
        values={EMPTY_VALUES}
        warranties={[W1]}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('name="warranty_id"');
    expect(html).toContain('name="inbound_source"');
    expect(html).toContain('name="inbound_date"');
    expect(html).toContain('name="issue_description"');
    expect(html).toMatch(/required/);
  });

  it('renders every inbound_source enum value as an option', () => {
    const html = renderToStaticMarkup(
      <FormView
        values={EMPTY_VALUES}
        warranties={[W1]}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    for (const v of ['EMAIL', 'PHONE', 'PORTAL', 'FIELD_DISCOVERY']) {
      expect(html).toContain(`value="${v}"`);
    }
  });

  it('disables the submit button while submitting', () => {
    const html = renderToStaticMarkup(
      <FormView
        values={readyValues()}
        warranties={[W1]}
        submitting={true}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Creating…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="warranty-claim-capture-submit"/);
  });

  it('renders a validation error banner when errorMessage is set', () => {
    const html = renderToStaticMarkup(
      <FormView
        values={EMPTY_VALUES}
        warranties={[W1]}
        submitting={false}
        errorMessage='inbound_source must be one of EMAIL, PHONE, PORTAL, FIELD_DISCOVERY'
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('inbound_source must be one of');
    expect(html).toContain('data-testid="warranty-claim-capture-error"');
  });

  it('surfaces the INVALID_SERVICE_WO_ID code attribute on the error banner', () => {
    // Even though service_wo_id is not on this form, the ADR-026 code can
    // be propagated if a future caller surfaces it — verify the banner
    // wires the code through verbatim.
    const html = renderToStaticMarkup(
      <FormView
        values={readyValues()}
        warranties={[W1]}
        submitting={false}
        errorMessage='service_wo_id must start with SRV-'
        errorCode='INVALID_SERVICE_WO_ID'
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-error-code="INVALID_SERVICE_WO_ID"');
    expect(html).toContain('service_wo_id must start with SRV-');
  });
});

describe('BAN-375 WarrantyClaimCaptureForm — buildPayload contract', () => {
  it('produces the minimum required payload for a happy-path POST', () => {
    const payload = buildPayload(readyValues());
    expect(payload).toEqual({
      warranty_id: W1.warranty_id,
      inbound_source: 'EMAIL',
      inbound_date: '2026-05-10',
      issue_description: 'Sealant failure at SE corner curtain wall',
    });
  });

  it('includes inbound_evidence + affected_scope only when non-empty', () => {
    const payload = buildPayload(readyValues({
      inbound_evidence: '  driveId-ABC  ',
      affected_scope: '  Lobby SE corner  ',
    }));
    expect(payload.inbound_evidence).toBe('driveId-ABC');
    expect(payload.affected_scope).toBe('Lobby SE corner');
  });

  it('builds reported_by as a JSON object only when any name/email/phone is set', () => {
    const empty = buildPayload(readyValues());
    expect(empty.reported_by).toBeUndefined();

    const filled = buildPayload(readyValues({
      reported_by_name: 'Mauna Owner',
      reported_by_email: 'owner@example.com',
      reported_by_phone: '',
    }));
    expect(filled.reported_by).toEqual({
      name: 'Mauna Owner',
      email: 'owner@example.com',
    });
  });
});
