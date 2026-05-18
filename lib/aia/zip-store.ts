/**
 * BAN-337 Pay Apps v2b — Minimal pure-Node store-only ZIP encoder.
 *
 * Purpose-built for the Textura bundle assembly endpoint: invoice CSV +
 * notarized PDF + a small waivers placeholder. The bundle isn't large
 * enough to justify pulling in `archiver` / `jszip`; this implementation
 * emits the standard ZIP 2.0 stored (uncompressed) format which Textura's
 * import flow accepts.
 *
 * No compression, no encryption, no zip64, no streaming.
 */

import { Buffer } from 'buffer';

// CRC-32 (IEEE 802.3) — precomputed table.
const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: date & 0xffff, time: time & 0xffff };
}

/** Assemble a ZIP archive (stored / no compression) from the given entries. */
export function buildStoredZip(entries: ZipEntry[], now: Date = new Date()): Buffer {
  const { date, time } = dosDateTime(now);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // ── Local file header ──
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // general purpose bit flag (UTF-8 name)
    local.writeUInt16LE(0, 8);           // compression method (store)
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);       // compressed size = size (stored)
    local.writeUInt32LE(size, 22);       // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra length

    localParts.push(local, nameBuf, entry.data);

    // ── Central directory entry ──
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // signature
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0x0800, 8);      // GP flag (UTF-8)
    central.writeUInt16LE(0, 10);          // compression
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + entry.data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(centralParts);

  // ── End of central directory ──
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                       // disk number
  eocd.writeUInt16LE(0, 6);                       // disk where central starts
  eocd.writeUInt16LE(entries.length, 8);          // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);         // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);      // central directory size
  eocd.writeUInt32LE(centralStart, 16);           // central directory offset
  eocd.writeUInt16LE(0, 20);                      // comment length

  return Buffer.concat([Buffer.concat(localParts), centralBuf, eocd]);
}
