/**
 * A PNG encoder and decoder in plain TypeScript, so the art in this
 * repo can be written to files and looked at.
 *
 * Everything drawn here is a palette-indexed grid baked to a canvas,
 * which means nothing has ever been seen outside a browser. There is no
 * native canvas binding in this project and there is not going to be
 * one: the only thing standing between an RGBA byte array and a picture
 * on disk is a container format, and the container is small enough to
 * own. Deflate comes from `node:zlib`, which ships with the runtime.
 *
 * ## Determinism
 *
 * The encoder is a pure function of its pixels: the same RGBA in gives
 * the same bytes out, on this zlib. The compressed bytes are *not* the
 * thing to pin in a test, though — a zlib upgrade may legally re-encode
 * the same pixels differently — so `decodePng` exists next to the
 * encoder and the pipeline is pinned on what a PNG *decodes to*. That
 * is the guarantee that actually matters: the picture, not its packing.
 *
 * Encoding is 8-bit RGBA (color type 6), non-interlaced, with per-row
 * adaptive filtering picked by the standard minimum-sum-of-absolute-
 * differences heuristic — pixel art at integer scale is mostly runs and
 * repeated rows, which Up and Sub flatten to zeroes before deflate ever
 * sees them.
 */
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

/** Bytes per pixel in every image this module handles (RGBA8). */
const CHANNELS = 4;

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** A decoded image: tightly packed, top-to-bottom RGBA rows. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 as PNG defines it, over a byte range. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Paeth predictor, straight out of the PNG spec. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Filter one row every way the spec allows and keep the cheapest, by
 * the sum of absolute signed byte values — the heuristic the reference
 * encoder uses. Returns the filter byte followed by the filtered row.
 */
function filterRow(
  row: Uint8Array,
  prior: Uint8Array,
  stride: number,
): Uint8Array {
  const candidates: Uint8Array[] = [];
  for (let type = 0; type < 5; type++) {
    const out = new Uint8Array(row.length + 1);
    out[0] = type;
    for (let i = 0; i < row.length; i++) {
      const raw = row[i] ?? 0;
      const left = i >= stride ? (row[i - stride] ?? 0) : 0;
      const up = prior[i] ?? 0;
      const upLeft = i >= stride ? (prior[i - stride] ?? 0) : 0;
      let value: number;
      switch (type) {
        case 1:
          value = raw - left;
          break;
        case 2:
          value = raw - up;
          break;
        case 3:
          value = raw - ((left + up) >> 1);
          break;
        case 4:
          value = raw - paeth(left, up, upLeft);
          break;
        default:
          value = raw;
      }
      out[i + 1] = value & 0xff;
    }
    candidates.push(out);
  }
  let best = candidates[0] as Uint8Array;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    let cost = 0;
    for (let i = 1; i < candidate.length; i++) {
      const b = candidate[i] ?? 0;
      cost += b < 128 ? b : 256 - b;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

/**
 * Encode tightly packed RGBA rows as a PNG. `data` must be exactly
 * width × height × 4 bytes; anything else is a caller bug worth
 * failing on rather than padding around.
 */
export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const stride = width * CHANNELS;
  if (data.length !== stride * height) {
    throw new Error(
      `expected ${stride * height} RGBA bytes for ${width}×${height}, got ${data.length}`,
    );
  }
  const raw = new Uint8Array((stride + 1) * height);
  let prior: Uint8Array<ArrayBufferLike> = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    raw.set(filterRow(row, prior, CHANNELS), y * (stride + 1));
    prior = row;
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  const chunks = [
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * Decode a PNG this module wrote back to RGBA rows. Deliberately narrow
 * — 8-bit RGBA, non-interlaced, which is every file the encoder makes —
 * because its job is to check the encoder rather than to open the
 * world's PNGs.
 */
export function decodePng(bytes: Uint8Array): RgbaImage {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error("not a PNG (bad signature)");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = SIGNATURE.length;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(
      bytes[at + 4] ?? 0,
      bytes[at + 5] ?? 0,
      bytes[at + 6] ?? 0,
      bytes[at + 7] ?? 0,
    );
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) {
        throw new Error("only 8-bit non-interlaced RGBA PNGs decode here");
      }
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + length;
  }
  const compressed = new Uint8Array(
    idat.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of idat) {
    compressed.set(part, offset);
    offset += part.length;
  }
  const raw = new Uint8Array(inflateSync(compressed));
  const stride = width * CHANNELS;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const from = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const value = raw[from + i] ?? 0;
      const left = i >= CHANNELS ? (data[y * stride + i - CHANNELS] ?? 0) : 0;
      const up = y > 0 ? (data[(y - 1) * stride + i] ?? 0) : 0;
      const upLeft =
        y > 0 && i >= CHANNELS ? (data[(y - 1) * stride + i - CHANNELS] ?? 0) : 0;
      let restored: number;
      switch (filter) {
        case 1:
          restored = value + left;
          break;
        case 2:
          restored = value + up;
          break;
        case 3:
          restored = value + ((left + up) >> 1);
          break;
        case 4:
          restored = value + paeth(left, up, upLeft);
          break;
        default:
          restored = value;
      }
      data[y * stride + i] = restored & 0xff;
    }
  }
  return { width, height, data };
}

/**
 * A stable digest of raw bytes, as the first 16 hex characters of a
 * SHA-256. `node:crypto` ships with the runtime like `node:zlib` does,
 * and a standard hash is worth more here than a hand-rolled one: it is
 * the thing a test writes down to say "these are the same pixels as
 * last time", so it has to keep meaning that across Node versions.
 */
export function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}
