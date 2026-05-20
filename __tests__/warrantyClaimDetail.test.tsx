/**
 * BAN-375 Closeout v1.1 Phase 2 — WarrantyClaimDetail tests.
 *
 * Verifies the read-only display surfaces every claim field, every
 * resolution enum value is dropdown-selectable, the warranty letter
 * download link targets the new GET route, and buildResolutionPayload
 * matches the shape the PATCH /api/closeout/warranty-claims/[id]
 * route (app/api/closeout/warranty-claims/[id]/route.ts:25-30) accepts.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DetailView,
  buildResolutionPayload,
  EMPTY_RESOLUTION,
  type WarrantyClaimRow,
  type ResolutionValues,
} from '../components/closeout/WarrantyClaimDetail';

const noop = () => undefined;

const CLAIM: WarrantyClaimRow = {
  claim_id: '33333333-3333-4333-8333-333333333333',
  tenant_id: '00000000-0000-4000-8000-000000000001',
  engagement_id: '22222222-2222-4222-8222-222222222222',
  warranty_id: '11111111-1111-4111-8111-111111111111',
  inbound_source: 'EMAIL',
  inbound_evidence: 'driveId-ABC',
  inbound_date: '2026-05-10',
  reported_by: { name: 'Mauna Owner', email: 'owner@example.com' },
  issue_description: 'Sealant failure at SE corner curtain wall',
  affected_scope: 'Lobby SE corner curtain wall',
  triage_result: 'KULA_RESPONSIBLE',
  triage_by: null,
  triage_at: '2026-05-11T13:00:00Z',
  triage_reasoning: 'Investigated on site, sealant joint failed.',
  service_wo_id: 'SRV-26-0001',
  back_charge_id: null,
  resolution: null,
  resolution_evidence_drive_id: null,
  resolved_at: null,
};

const LETTER_HREF = `/api/closeout/warranties/${encodeURIComponent(CLAIM.warranty_id)}/warranty-letter`;

function withResolution(r: string): ResolutionValues {
  return { ...EMPTY_RESOLUTION, resolution: r, resolved_at: '2026-05-12' };
}

describe('BAN-375 WarrantyClaimDetail — DetailView render', () => {
  it('renders every section heading once', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={CLAIM}
        values={EMPTY_RESOLUTION}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    expect(html).toContain('>Claim<');
    expect(html).toContain('>Inbound<');
    expect(html).toContain('>Triage<');
    expect(html).toContain('>Resolution<');
  });

  it('surfaces every claim field read-only above the resolution form', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={CLAIM}
        values={EMPTY_RESOLUTION}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    expect(html).toContain(CLAIM.claim_id);
    expect(html).toContain(CLAIM.warranty_id);
    expect(html).toContain('Email'); // INBOUND_LABEL[EMAIL]
    expect(html).toContain(CLAIM.inbound_date);
    expect(html).toContain(CLAIM.inbound_evidence!);
    expect(html).toContain('Mauna Owner');
    expect(html).toContain(CLAIM.issue_description);
    expect(html).toContain(CLAIM.affected_scope!);
    expect(html).toContain('Kula responsible');
    expect(html).toContain(CLAIM.triage_at!);
    expect(html).toContain('SRV-26-0001');
    expect(html).toContain(CLAIM.triage_reasoning!);
  });

  it('renders all 4 resolution enum values as dropdown options', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={CLAIM}
        values={EMPTY_RESOLUTION}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    for (const v of ['COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED']) {
      expect(html).toContain(`value="${v}"`);
    }
  });

  it('renders the "Download warranty letter" link pointing at the new GET route', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={CLAIM}
        values={EMPTY_RESOLUTION}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    expect(html).toContain('Download warranty letter');
    expect(html).toContain(`href="${LETTER_HREF}"`);
    expect(html).toContain('target="_blank"');
  });

  it('disables the submit while submitting', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={CLAIM}
        values={withResolution('COMPLETED')}
        submitting={true}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    expect(html).toContain('Saving…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="warranty-claim-resolution-submit"/);
  });

  it('renders the existing-resolution banner when the claim already has a resolution', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={{ ...CLAIM, resolution: 'COMPLETED', resolved_at: '2026-05-12', resolution_evidence_drive_id: 'driveId-ZZZ' }}
        values={EMPTY_RESOLUTION}
        submitting={false}
        errorMessage={null}
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    expect(html).toContain('Existing resolution');
    expect(html).toContain('Completed');
    expect(html).toContain('2026-05-12');
    expect(html).toContain('driveId-ZZZ');
  });

  it('surfaces an error banner when errorMessage is set', () => {
    const html = renderToStaticMarkup(
      <DetailView
        claim={CLAIM}
        values={EMPTY_RESOLUTION}
        submitting={false}
        errorMessage='resolution must be one of COMPLETED, REFERRED, WRITTEN_OFF, UNRESOLVED'
        errorCode={null}
        onChange={noop}
        onSubmit={noop}
        letterHref={LETTER_HREF}
      />,
    );
    expect(html).toContain('resolution must be one of');
  });
});

describe('BAN-375 WarrantyClaimDetail — buildResolutionPayload', () => {
  it.each(['COMPLETED', 'REFERRED', 'WRITTEN_OFF', 'UNRESOLVED'])(
    'builds a PATCH payload for resolution=%s with resolved_at',
    (r) => {
      const payload = buildResolutionPayload(withResolution(r));
      expect(payload).toMatchObject({
        resolution: r,
        resolved_at: '2026-05-12',
      });
    },
  );

  it('defaults resolved_at to today when omitted', () => {
    const payload = buildResolutionPayload({ ...EMPTY_RESOLUTION, resolution: 'COMPLETED' });
    expect(payload.resolution).toBe('COMPLETED');
    expect(typeof payload.resolved_at).toBe('string');
    expect((payload.resolved_at as string)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('includes resolution_evidence_drive_id only when set', () => {
    const without = buildResolutionPayload(withResolution('COMPLETED'));
    expect(without.resolution_evidence_drive_id).toBeUndefined();

    const withDrive = buildResolutionPayload({
      ...withResolution('COMPLETED'),
      resolution_evidence_drive_id: '  drive-XYZ  ',
    });
    expect(withDrive.resolution_evidence_drive_id).toBe('drive-XYZ');
  });
});
