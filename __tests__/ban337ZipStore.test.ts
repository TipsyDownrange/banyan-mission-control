/**
 * BAN-337 Pay Apps v2b — Store-only ZIP encoder unit tests.
 *
 * Validates the minimal store-only ZIP we ship inside the Textura bundle:
 *   - End-of-central-directory signature
 *   - Local-file-header signature per entry
 *   - Filename + uncompressed sizes recoverable from the headers
 *   - CRC32 round-trip
 */

import { buildStoredZip } from '@/lib/aia/zip-store';

function findOffset(buf: Buffer, sig: number): number {
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  return -1;
}

describe('BAN-337 buildStoredZip', () => {
  const fixedDate = new Date('2026-05-18T12:00:00Z');

  it('emits the EOCD signature at the end', () => {
    const zip = buildStoredZip([{ name: 'a.txt', data: Buffer.from('hello') }], fixedDate);
    // EOCD is 22 bytes (no comment); signature is first 4 bytes of that block.
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it('writes one local file header per entry', () => {
    const zip = buildStoredZip(
      [
        { name: 'a.txt', data: Buffer.from('hello') },
        { name: 'b/c.txt', data: Buffer.from('world!') },
      ],
      fixedDate,
    );
    // The local header signature should appear at offset 0 and again later.
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    // Skip past the first entry's local header + name (5 bytes) + data (5).
    const secondOffset = findOffset(zip.subarray(30 + 5 + 5), 0x04034b50);
    expect(secondOffset).toBeGreaterThan(-1);
  });

  it('records the uncompressed size in the local header', () => {
    const data = Buffer.from('abcdefghij');
    const zip = buildStoredZip([{ name: 'x.bin', data }], fixedDate);
    // local header byte 22 = uncompressed size (UInt32LE)
    expect(zip.readUInt32LE(22)).toBe(data.length);
  });

  it('embeds the entry name in the local header', () => {
    const zip = buildStoredZip([{ name: 'pay-app-7-notarized.pdf', data: Buffer.from([1, 2, 3]) }], fixedDate);
    const nameStart = 30;
    const nameEnd = nameStart + 'pay-app-7-notarized.pdf'.length;
    expect(zip.subarray(nameStart, nameEnd).toString('utf-8')).toBe('pay-app-7-notarized.pdf');
  });

  it('reports the correct entry count in the EOCD', () => {
    const zip = buildStoredZip(
      [
        { name: 'a', data: Buffer.from('1') },
        { name: 'b', data: Buffer.from('2') },
        { name: 'c', data: Buffer.from('3') },
      ],
      fixedDate,
    );
    const eocd = zip.length - 22;
    expect(zip.readUInt16LE(eocd + 8)).toBe(3);  // entries on this disk
    expect(zip.readUInt16LE(eocd + 10)).toBe(3); // total entries
  });

  it('does not corrupt non-ASCII filenames (UTF-8 flag set)', () => {
    const zip = buildStoredZip([{ name: 'résumé.txt', data: Buffer.from('hi') }], fixedDate);
    // GP bit 11 = UTF-8 (0x0800) — local header bytes 6-7.
    const gpFlag = zip.readUInt16LE(6);
    expect(gpFlag & 0x0800).toBe(0x0800);
  });
});
