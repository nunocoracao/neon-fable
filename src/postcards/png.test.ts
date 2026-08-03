import { describe, expect, it } from "vitest";
import { crc32, decodePng, digest, encodePng } from "./png";

/**
 * A fixture image rather than real art: this pins the *encoder*, so it
 * must not move when a sprite is re-authored. Four quadrants plus a
 * gradient row exercise every filter the adaptive pass can choose.
 */
function fixture(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      data[at] = (x * 7) % 256;
      data[at + 1] = (y * 13) % 256;
      data[at + 2] = x < width / 2 ? (y < height / 2 ? 255 : 0) : 128;
      data[at + 3] = x + y < 3 ? 0 : 255;
    }
  }
  return data;
}

describe("crc32", () => {
  it("matches the known CRC of a short ASCII string", () => {
    const bytes = Uint8Array.from([..."123456789"].map((c) => c.charCodeAt(0)));
    expect(crc32(bytes)).toBe(0xcbf43926);
  });
});

describe("encodePng", () => {
  it("writes the PNG signature and an IHDR of the right size", () => {
    const png = encodePng({ width: 3, height: 2, data: fixture(3, 2) });
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(3);
    expect(view.getUint32(20)).toBe(2);
    // 8-bit, color type 6 (RGBA), deflate, adaptive filter, no interlace.
    expect([...png.slice(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  });

  it("refuses a byte count that does not match the dimensions", () => {
    expect(() =>
      encodePng({ width: 4, height: 4, data: new Uint8Array(8) }),
    ).toThrow(/expected 64 RGBA bytes/);
  });

  it("is deterministic: same pixels in, same bytes out", () => {
    const image = { width: 17, height: 11, data: fixture(17, 11) };
    expect(digest(encodePng(image))).toBe(digest(encodePng(image)));
  });
});

describe("decodePng", () => {
  it("round-trips every pixel of a fixture", () => {
    const image = { width: 23, height: 19, data: fixture(23, 19) };
    const back = decodePng(encodePng(image));
    expect(back.width).toBe(23);
    expect(back.height).toBe(19);
    expect([...back.data]).toEqual([...image.data]);
  });

  it("round-trips a single pixel", () => {
    const data = Uint8Array.from([12, 34, 56, 78]);
    const back = decodePng(encodePng({ width: 1, height: 1, data }));
    expect([...back.data]).toEqual([12, 34, 56, 78]);
  });

  it("rejects bytes that are not a PNG", () => {
    expect(() => decodePng(new Uint8Array(32))).toThrow(/bad signature/);
  });
});

describe("digest", () => {
  it("is stable for a fixed byte string", () => {
    expect(digest(Uint8Array.from([0, 1, 2, 3]))).toBe("054edec1d0211f62");
  });

  it("separates images that differ by one pixel", () => {
    const a = fixture(8, 8);
    const b = fixture(8, 8);
    b[0] = ((b[0] ?? 0) + 1) % 256;
    expect(digest(a)).not.toBe(digest(b));
  });
});
