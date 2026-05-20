/**
 * AIA Submission Packet Export v1 — manifest renderer pure-function tests.
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
import {
  ManifestDocument,
  type ManifestSection,
  type ManifestChecklistRow,
  type SubmissionBundleManifestInput,
} from '@/lib/aia/submission-bundle-manifest';

const SECTIONS: ManifestSection[] = [
  { title: 'Cover Letter',                source: 'rendered',            page_count: 1, signed_status: 'NOT_APPLICABLE' },
  { title: 'Pay Application No. 7',       source: 'notarization_sessions.signed_pdf_drive_id', page_count: 3, signed_status: 'NOTARIZED' },
  { title: 'Schedule of Values reference', source: 'schedule_of_values', page_count: 1, signed_status: 'GENERATED' },
  { title: 'Lien Waiver — Conditional Progress', source: 'lien_waivers.notarized_pdf_drive_id', page_count: 2, signed_status: 'NOTARIZED' },
];

const CHECKLIST: ManifestChecklistRow[] = [
  { label: 'Conditional progress waiver from Kula', required: true },
  { label: 'Certified payroll',                     required: false },
];

const BASE: SubmissionBundleManifestInput = {
  kid: 'K-2026-HOKHTL',
  project_name: 'Hokuala Hotel Renovation',
  pay_app_number: 7,
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  submission_timestamp: '2026-05-20 14:00 UTC',
  submitted_by_officer_name: 'Sean Daniels',
  sections: SECTIONS,
  gc_required_docs_checklist: CHECKLIST,
};

function renderManifest(extra: Partial<SubmissionBundleManifestInput> = {}) {
  const doc = ManifestDocument({ ...BASE, ...extra });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToStaticMarkup((doc as any).props.children);
}

describe('AIA submission bundle — manifest renderer', () => {
  it('renders the title, project metadata, and total counts', () => {
    const html = renderManifest();
    expect(html).toContain('Submission Bundle Manifest');
    expect(html).toContain('Hokuala Hotel Renovation');
    expect(html).toContain('K-2026-HOKHTL');
    expect(html).toContain('Total enclosures: 4');
    // Sum of page_counts above is 1+3+1+2 = 7
    expect(html).toContain('Total pages (excl. this manifest): 7');
  });

  it('lists every section by title with its source and page count', () => {
    const html = renderManifest();
    for (const s of SECTIONS) {
      expect(html).toContain(s.title);
      expect(html).toContain(s.source);
    }
    // Status badges
    expect(html).toContain('NOTARIZED');
    expect(html).toContain('GENERATED');
    expect(html).toContain('NOT_APPLICABLE');
  });

  it('renders the GC-required-docs checklist when provided', () => {
    const html = renderManifest();
    expect(html).toContain('GC-required documents (informational)');
    expect(html).toContain('Conditional progress waiver from Kula');
    expect(html).toContain('Certified payroll');
    expect(html).toContain('YES');
    expect(html).toContain('no');
  });

  it('omits the checklist section when checklist is null', () => {
    const html = renderManifest({ gc_required_docs_checklist: null });
    expect(html).not.toContain('GC-required documents (informational)');
  });

  it('handles a zero-section bundle without throwing (page total = 0)', () => {
    const html = renderManifest({ sections: [], gc_required_docs_checklist: null });
    expect(html).toContain('Total enclosures: 0');
    expect(html).toContain('Total pages (excl. this manifest): 0');
  });
});
