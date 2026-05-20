/**
 * AIA Submission Packet Export v1 — ZIP fallback tests.
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

import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { zipBundle, type BundleSection } from '@/lib/aia/submission-bundle-assembler';

async function tinyPdf(label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.setTitle(label);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

describe('AIA submission bundle — ZIP fallback', () => {
  it('packages each section as a separate file with a numeric prefix', async () => {
    const a = await tinyPdf('cover');
    const b = await tinyPdf('payapp');
    const c = await tinyPdf('manifest');
    const sections: BundleSection[] = [
      { title: 'Cover Letter', source: 's', pdf_bytes: a, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'cover-letter.pdf' },
      { title: 'Pay App',      source: 's', pdf_bytes: b, signed_status: 'NOTARIZED',      filename_in_zip: 'pay-app.pdf' },
      { title: 'Manifest',     source: 's', pdf_bytes: c, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'manifest.pdf' },
    ];
    const zipBuf = await zipBundle(sections);
    expect(zipBuf.byteLength).toBeGreaterThan(0);

    const reloaded = await JSZip.loadAsync(zipBuf);
    const names = Object.keys(reloaded.files).sort();
    expect(names).toEqual([
      '01-cover-letter.pdf',
      '02-pay-app.pdf',
      '03-manifest.pdf',
    ]);
  });

  it('preserves each PDF file byte-for-byte inside the archive', async () => {
    const a = await tinyPdf('cover');
    const sections: BundleSection[] = [
      { title: 'A', source: 's', pdf_bytes: a, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'cover.pdf' },
    ];
    const zipBuf = await zipBundle(sections);
    const reloaded = await JSZip.loadAsync(zipBuf);
    const entry = reloaded.file('01-cover.pdf');
    expect(entry).not.toBeNull();
    const bytes = await entry!.async('nodebuffer');
    expect(bytes.equals(a)).toBe(true);
  });

  it('produces a valid ZIP archive (signature PK\\x03\\x04)', async () => {
    const a = await tinyPdf('cover');
    const zipBuf = await zipBundle([
      { title: 'X', source: 's', pdf_bytes: a, signed_status: 'NOT_APPLICABLE', filename_in_zip: 'x.pdf' },
    ]);
    expect(zipBuf[0]).toBe(0x50); // P
    expect(zipBuf[1]).toBe(0x4b); // K
    expect(zipBuf[2]).toBe(0x03);
    expect(zipBuf[3]).toBe(0x04);
  });
});
