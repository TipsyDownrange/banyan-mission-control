/**
 * AIA Submission Packet Export v1 — pdf-lib merge tests.
 *
 * Builds hand-crafted source PDFs in-process via pdf-lib so the test is
 * deterministic and does not invoke @react-pdf/renderer's font / canvas
 * stack.  Confirms page count sum, valid output PDF, and metadata.
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

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mergeBundlePdf, type BundleSection } from '@/lib/aia/submission-bundle-assembler';

async function makePdf(pages: number, label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${label} — page ${i + 1}`, { x: 50, y: 720, size: 14, font });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('AIA submission bundle — PDF merge', () => {
  it('merges multiple PDFs into a single document with total page count = sum', async () => {
    const a = await makePdf(2, 'cover');
    const b = await makePdf(3, 'payapp');
    const c = await makePdf(1, 'manifest');
    const sections: BundleSection[] = [
      { title: 'A', source: 'a', pdf_bytes: a, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'a.pdf' },
      { title: 'B', source: 'b', pdf_bytes: b, signed_status: 'NOTARIZED',      filename_in_zip: 'b.pdf' },
      { title: 'C', source: 'c', pdf_bytes: c, signed_status: 'GENERATED',      filename_in_zip: 'c.pdf' },
    ];
    const merged = await mergeBundlePdf(sections);
    expect(merged.byteLength).toBeGreaterThan(0);

    const reloaded = await PDFDocument.load(merged);
    expect(reloaded.getPageCount()).toBe(6);
    expect(reloaded.getTitle()).toBe('AIA Pay Application Submission Bundle');
    expect(reloaded.getCreator()).toBe('Kula Glass Company, Inc.');
  });

  it('handles a single-section bundle', async () => {
    const only = await makePdf(1, 'cover');
    const merged = await mergeBundlePdf([
      { title: 'cover', source: 's', pdf_bytes: only, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'cover.pdf' },
    ]);
    const reloaded = await PDFDocument.load(merged);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('produces a parseable output PDF (header bytes %PDF-)', async () => {
    const src = await makePdf(1, 'x');
    const merged = await mergeBundlePdf([
      { title: 'X', source: 's', pdf_bytes: src, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'x.pdf' },
    ]);
    expect(merged.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
