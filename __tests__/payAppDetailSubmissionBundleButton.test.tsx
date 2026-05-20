/**
 * AIA Submission Packet Export v1 — Pay App detail button + preview tests.
 *
 * Static-markup tests of the SubmissionBundleButtons + SubmissionBundlePreview
 * components extracted from PayAppEditScreen.tsx.  Verifies the state-gate
 * matrix and the descriptive tooltip text without spinning up the full
 * pay-app edit screen.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SubmissionBundleButtons,
  SubmissionBundlePreview,
} from '@/components/engagements/PayAppEditScreen';

const ALLOWED_STATES = ['READY_FOR_SUBMISSION', 'SUBMITTED', 'ARCHITECT_CERTIFIED', 'GC_APPROVED'];
const DISABLED_STATES = ['PENDING_DRAFT', 'READY_FOR_NOTARIZATION', 'REJECTED', 'PAID_PARTIAL', 'PAID_FULL'];

describe('AIA submission bundle — pay app detail button matrix', () => {
  it.each(ALLOWED_STATES)('renders both buttons enabled in state %s', (state) => {
    const html = renderToStaticMarkup(
      <SubmissionBundleButtons payAppState={state} onDownload={() => {}} />,
    );
    expect(html).toContain('Generate Submission Packet');
    expect(html).toContain('Download as ZIP');
    expect(html).not.toContain('disabled=""');
  });

  it.each(DISABLED_STATES)('renders both buttons disabled in state %s', (state) => {
    const html = renderToStaticMarkup(
      <SubmissionBundleButtons payAppState={state} onDownload={() => {}} />,
    );
    expect(html).toContain('Generate Submission Packet');
    // Both buttons should carry the disabled attribute
    const disabledCount = (html.match(/disabled=""/g) ?? []).length;
    expect(disabledCount).toBe(2);
  });

  it('uses the "ready-for-submission" tooltip when state allows the bundle', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundleButtons payAppState="READY_FOR_SUBMISSION" onDownload={() => {}} />,
    );
    expect(html).toMatch(/Download a merged PDF/);
  });

  it('uses a state-specific tooltip when state disallows the bundle', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundleButtons payAppState="PENDING_DRAFT" onDownload={() => {}} />,
    );
    expect(html).toMatch(/marked ready for submission/);
  });

  it('uses a "rejected" tooltip in REJECTED state', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundleButtons payAppState="REJECTED" onDownload={() => {}} />,
    );
    expect(html).toMatch(/Pay app is rejected/);
  });

  it('uses an "archived" tooltip in PAID_FULL state', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundleButtons payAppState="PAID_FULL" onDownload={() => {}} />,
    );
    expect(html).toMatch(/closed/);
  });
});

describe('AIA submission bundle — preview panel', () => {
  it('returns null when the state is not allowed', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundlePreview payAppState="PENDING_DRAFT" cfg={null} />,
    );
    expect(html).toBe('');
  });

  it('renders the bullet list of bundle contents in allowed states', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundlePreview payAppState="READY_FOR_SUBMISSION" cfg={null} />,
    );
    expect(html).toContain('Submission packet contents');
    expect(html).toContain('Cover letter');
    expect(html).toContain('Pay app PDF');
    expect(html).toContain('Schedule of Values reference');
    expect(html).toContain('lien waivers');
    expect(html).toContain('Submission manifest');
  });

  it('mentions the named GC certifier when present', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundlePreview
        payAppState="READY_FOR_SUBMISSION"
        cfg={{ gc_certifier_name: 'Karen Asahi' }}
      />,
    );
    expect(html).toContain('Karen Asahi');
  });

  it('falls back to a generic notice when no certifier is configured', () => {
    const html = renderToStaticMarkup(
      <SubmissionBundlePreview payAppState="READY_FOR_SUBMISSION" cfg={null} />,
    );
    expect(html).toContain('No GC certifier on file');
    expect(html).toContain('To Whom It May Concern');
  });
});
