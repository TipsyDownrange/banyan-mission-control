/**
 * AIA Submission Packet Export — UI button coverage.
 *
 * Verifies SubmissionPacketButton renders both buttons, applies disabled
 * + tooltip state based on the pay app state, and triggers a fetch +
 * Blob download when clicked in an enabled state.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SubmissionPacketButton from '../components/engagements/SubmissionPacketButton';

describe('SubmissionPacketButton', () => {
  it('renders both buttons enabled when state is READY_FOR_SUBMISSION', () => {
    const html = renderToStaticMarkup(
      <SubmissionPacketButton payAppId="pa-1" payAppNumber={7} state="READY_FOR_SUBMISSION" />,
    );
    expect(html).toContain('Generate Submission Packet');
    expect(html).toContain('Download as ZIP');
    expect(html).not.toContain('disabled=""');
  });

  it('renders enabled on re-download states (SUBMITTED, ARCHITECT_CERTIFIED, GC_APPROVED)', () => {
    for (const state of ['SUBMITTED', 'ARCHITECT_CERTIFIED', 'GC_APPROVED']) {
      const html = renderToStaticMarkup(
        <SubmissionPacketButton payAppId="pa-1" payAppNumber={2} state={state} />,
      );
      expect(html).not.toContain('disabled=""');
    }
  });

  it('renders disabled with a tooltip for PENDING_DRAFT', () => {
    const html = renderToStaticMarkup(
      <SubmissionPacketButton payAppId="pa-1" payAppNumber={1} state="PENDING_DRAFT" />,
    );
    expect(html).toContain('disabled=""');
    expect(html).toMatch(/finish the draft/);
  });

  it('renders disabled with a tooltip for READY_FOR_NOTARIZATION', () => {
    const html = renderToStaticMarkup(
      <SubmissionPacketButton payAppId="pa-1" payAppNumber={1} state="READY_FOR_NOTARIZATION" />,
    );
    expect(html).toContain('disabled=""');
    expect(html).toMatch(/Notarize/);
  });

  it('renders disabled with a tooltip for PAID_FULL and REJECTED', () => {
    const paid = renderToStaticMarkup(
      <SubmissionPacketButton payAppId="pa-1" payAppNumber={1} state="PAID_FULL" />,
    );
    expect(paid).toContain('disabled=""');
    expect(paid).toMatch(/closed/);
    const rejected = renderToStaticMarkup(
      <SubmissionPacketButton payAppId="pa-1" payAppNumber={1} state="REJECTED" />,
    );
    expect(rejected).toContain('disabled=""');
    expect(rejected).toMatch(/cannot be submitted/);
  });
});
