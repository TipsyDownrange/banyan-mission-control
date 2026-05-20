/**
 * AIA Submission Packet Export v1 — cover letter pure-function tests.
 *
 * Tests the React document tree via static markup snapshots; does NOT call
 * @react-pdf/renderer's pdf() helper directly (that's exercised in the merge
 * test with hand-built sources).  Confirms interpolation, named-certifier
 * vs fallback salutation, and enclosure-list rendering.
 */

jest.mock('@react-pdf/renderer', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react');
  const component = (name: string) => ({ children, ...props }: { children?: unknown }) =>
    ReactLocal.createElement(name, props, children);
  return {
    Document: component('Document'),
    Page: component('Page'),
    Text: component('Text'),
    View: component('View'),
    Image: component('Image'),
    StyleSheet: { create: (styles: unknown) => styles },
    pdf: () => ({ toBlob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) }),
  };
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoverLetterDocument } from '@/lib/aia/submission-bundle-cover-letter';

const BASE = {
  gc_name: 'Hawaiian Dredging Construction Co., Inc.',
  project_name: 'Hokuala Hotel Renovation',
  kid: 'K-2026-HOKHTL',
  pay_app_number: 7,
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  submitted_by_officer_name: 'Sean Daniels',
  submission_timestamp: '2026-05-20 14:00 UTC',
  included_documents: [
    'Pay Application No. 7 (notarized)',
    'Schedule of Values reference',
    'Lien Waiver — Conditional Progress',
    'Submission manifest',
  ],
};

function renderCover(extra: Partial<typeof BASE> & Record<string, unknown> = {}) {
  // CoverLetterDocument returns a <Document>; in node we can extract the
  // single <Page> child and render the page tree statically so we can
  // inspect string content. @react-pdf primitives map to plain elements
  // with style props — we render them as text-only nodes for grep.
  const doc = CoverLetterDocument({ ...BASE, ...extra });
  // doc is a <Document>, child is <Page>. Render the page directly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docAny = doc as any;
  const page = docAny.props.children;
  return renderToStaticMarkup(page);
}

describe('AIA submission bundle — cover letter', () => {
  it('renders RE line with pay app number, project name, and kID', () => {
    const html = renderCover();
    expect(html).toContain('RE: Payment Application No. 7');
    expect(html).toContain('Hokuala Hotel Renovation');
    expect(html).toContain('K-2026-HOKHTL');
  });

  it('uses named-certifier salutation when gc_certifier_name is present', () => {
    const html = renderCover({
      gc_certifier_name: 'Karen Asahi',
      gc_certifier_title: 'Senior Project Manager',
      gc_certifier_email: 'karen.asahi@hdcc.com',
    });
    expect(html).toContain('Dear Karen Asahi:');
    expect(html).toContain('Karen Asahi');
    expect(html).toContain('Senior Project Manager');
    expect(html).toContain('karen.asahi@hdcc.com');
  });

  it('falls back to "To Whom It May Concern" when no certifier name is set', () => {
    const html = renderCover({ gc_certifier_name: null });
    expect(html).toContain('To Whom It May Concern:');
    expect(html).not.toContain('Dear ');
  });

  it('renders the period range and includes all enclosure descriptors', () => {
    const html = renderCover();
    expect(html).toContain('2026-04-01');
    expect(html).toContain('2026-04-30');
    for (const enc of BASE.included_documents) {
      expect(html).toContain(enc);
    }
  });

  it('shows current amount due when provided', () => {
    const html = renderCover({ current_amount_due: '$142,580.00' });
    expect(html).toContain('$142,580.00');
  });

  it('omits the amount-due sentence when current_amount_due is null', () => {
    const html = renderCover({ current_amount_due: null });
    expect(html).not.toContain('current amount due');
  });

  it('signs with the officer name and submission timestamp', () => {
    const html = renderCover();
    expect(html).toContain('Sean Daniels');
    expect(html).toContain('2026-05-20 14:00 UTC');
    expect(html).toContain('Kula Glass Company, Inc.');
  });
});
