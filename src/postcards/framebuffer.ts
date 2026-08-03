/**
 * A plain RGBA framebuffer: the surface everything in this directory
 * paints onto before it becomes a PNG.
 *
 * This is deliberately not a canvas. It is a byte array with a width, a
 * source-over blend, an additive blend (the one the neon glow pass
 * needs), and enough polygon rasterising to trace a tile diamond. The
 * 2d-context shape a browser expects is layered on top of it in
 * ./canvas2d.ts; the primitives are here so they can be reasoned about
 * and tested without any of that.
 *
 * Colors arrive as CSS strings because that is what the art and the
 * renderer already speak — palette entries are "#rrggbb" and the ground
 * shadow is an "rgba(...)".
 */
import { PALETTE, TRANSPARENT } from "../iso/art/palette";
import type { PixelGrid } from "../iso/art/pixel";

/** Straight (non-premultiplied) RGBA, each channel 0..255. */
export type Rgba = readonly [number, number, number, number];

export interface Framebuffer {
  readonly width: number;
  readonly height: number;
  /** Tightly packed RGBA rows, top to bottom. */
  readonly data: Uint8Array;
}

/** How a source color is combined with what is already there. */
export type BlendMode = "source-over" | "lighter";

export function createFramebuffer(
  width: number,
  height: number,
  background: Rgba = [0, 0, 0, 0],
): Framebuffer {
  const data = new Uint8Array(width * height * 4);
  const fb: Framebuffer = { width, height, data };
  if (background[3] > 0) {
    fillRect(fb, 0, 0, width, height, background);
  }
  return fb;
}

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const FUNCTIONAL = /^rgba?\(([^)]*)\)$/i;

/**
 * A CSS color string as RGBA. Supports the three notations this repo
 * actually authors in — #rgb, #rrggbb(aa), and rgb()/rgba() — and
 * throws on anything else rather than silently painting black, because
 * a color nobody can parse is a bug in the art, not in the viewer.
 */
export function parseColor(css: string): Rgba {
  const text = css.trim();
  const short = HEX_SHORT.exec(text);
  if (short) {
    const [, r = "0", g = "0", b = "0"] = short;
    return [
      parseInt(r + r, 16),
      parseInt(g + g, 16),
      parseInt(b + b, 16),
      255,
    ];
  }
  const long = HEX_LONG.exec(text);
  if (long) {
    const [, r = "00", g = "00", b = "00", a] = long;
    return [
      parseInt(r, 16),
      parseInt(g, 16),
      parseInt(b, 16),
      a === undefined ? 255 : parseInt(a, 16),
    ];
  }
  const fn = FUNCTIONAL.exec(text);
  if (fn) {
    const parts = (fn[1] ?? "").split(",").map((p) => Number(p.trim()));
    const [r = 0, g = 0, b = 0, a = 1] = parts;
    return [
      Math.round(r),
      Math.round(g),
      Math.round(b),
      Math.round(Math.min(1, Math.max(0, a)) * 255),
    ];
  }
  throw new Error(`cannot parse color "${css}"`);
}

/**
 * Blend one pixel. Source-over is the ordinary painter's blend;
 * "lighter" adds, which is exactly what the renderer asks a canvas for
 * when it composites the neon glow pass.
 */
export function blendPixel(
  fb: Framebuffer,
  x: number,
  y: number,
  color: Rgba,
  alpha: number,
  mode: BlendMode = "source-over",
): void {
  if (x < 0 || y < 0 || x >= fb.width || y >= fb.height) return;
  const a = (color[3] / 255) * alpha;
  if (a <= 0) return;
  const at = (y * fb.width + x) * 4;
  const data = fb.data;
  if (mode === "lighter") {
    for (let c = 0; c < 3; c++) {
      data[at + c] = Math.min(255, (data[at + c] ?? 0) + (color[c] ?? 0) * a);
    }
    data[at + 3] = Math.min(255, (data[at + 3] ?? 0) + 255 * a);
    return;
  }
  const dstA = (data[at + 3] ?? 0) / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) {
    data[at] = 0;
    data[at + 1] = 0;
    data[at + 2] = 0;
    data[at + 3] = 0;
    return;
  }
  for (let c = 0; c < 3; c++) {
    const src = color[c] ?? 0;
    const dst = data[at + c] ?? 0;
    data[at + c] = Math.round((src * a + dst * dstA * (1 - a)) / outA);
  }
  data[at + 3] = Math.round(outA * 255);
}

/** Axis-aligned filled rectangle; fractional edges round to whole pixels. */
export function fillRect(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  color: Rgba,
  alpha = 1,
  mode: BlendMode = "source-over",
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  const right = Math.round(x + w);
  const bottom = Math.round(y + h);
  for (let py = Math.max(0, top); py < Math.min(fb.height, bottom); py++) {
    for (let px = Math.max(0, left); px < Math.min(fb.width, right); px++) {
      blendPixel(fb, px, py, color, alpha, mode);
    }
  }
}

/** Overwrite a rectangle with transparent black — canvas clearRect. */
export function clearRect(
  fb: Framebuffer,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(fb.width, Math.round(x + w));
  const bottom = Math.min(fb.height, Math.round(y + h));
  for (let py = top; py < bottom; py++) {
    fb.data.fill(0, (py * fb.width + left) * 4, (py * fb.width + right) * 4);
  }
}

/**
 * Paint a palette-indexed grid at an integer scale. This is the whole
 * bridge between the art and a picture: resolve each character through
 * the palette and fill its block. Transparent cells and characters no
 * palette claims are skipped, which matches what the canvas bake does.
 */
export function drawGrid(
  fb: Framebuffer,
  grid: PixelGrid,
  x: number,
  y: number,
  scale = 1,
  palette: Readonly<Record<string, string>> = PALETTE,
): void {
  grid.forEach((row, gy) => {
    for (let gx = 0; gx < row.length; gx++) {
      const ch = row[gx] ?? TRANSPARENT;
      if (ch === TRANSPARENT) continue;
      const css = palette[ch];
      if (css === undefined) continue;
      fillRect(fb, x + gx * scale, y + gy * scale, scale, scale, parseColor(css));
    }
  });
}

/** Width in pixels a grid covers at a scale (0 for an empty grid). */
export function gridWidth(grid: PixelGrid, scale = 1): number {
  return (grid[0]?.length ?? 0) * scale;
}

/** Height in pixels a grid covers at a scale. */
export function gridHeight(grid: PixelGrid, scale = 1): number {
  return grid.length * scale;
}

/**
 * Composite the whole framebuffer over an opaque color, in place. The
 * renderer clears to transparent and paints the world over it — the
 * page behind the canvas is what a player actually sees past the map
 * edge — so a postcard puts that page back before it is written out.
 */
export function flattenOnto(fb: Framebuffer, background: Rgba): void {
  const data = fb.data;
  for (let at = 0; at < data.length; at += 4) {
    const a = (data[at + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c++) {
      const src = data[at + c] ?? 0;
      const dst = background[c] ?? 0;
      data[at + c] = Math.round(src * a + dst * (1 - a));
    }
    data[at + 3] = 255;
  }
}

/** A point in framebuffer space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Fill a set of closed polygons by scanline, even-odd. Every shape the
 * renderer fills through a path is a tile diamond or a batch of them,
 * which even-odd handles exactly; nothing here needs winding rules.
 */
export function fillPolygons(
  fb: Framebuffer,
  polygons: readonly (readonly Point[])[],
  color: Rgba,
  alpha = 1,
  mode: BlendMode = "source-over",
): void {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const poly of polygons) {
    for (const p of poly) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minY)) return;
  const from = Math.max(0, Math.floor(minY));
  const to = Math.min(fb.height - 1, Math.ceil(maxY));
  for (let py = from; py <= to; py++) {
    const scan = py + 0.5;
    const crossings: number[] = [];
    for (const poly of polygons) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i] as Point;
        const b = poly[(i + 1) % poly.length] as Point;
        if (a.y === b.y) continue;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (scan < lo || scan >= hi) continue;
        crossings.push(a.x + ((scan - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.round(crossings[i] as number);
      const right = Math.round(crossings[i + 1] as number);
      for (let px = Math.max(0, left); px < Math.min(fb.width, right); px++) {
        blendPixel(fb, px, py, color, alpha, mode);
      }
    }
  }
}

/**
 * Stroke a straight segment of a given width, as the quad it sweeps.
 * Good enough for the ground affordances the renderer draws (diamond
 * outlines, path previews) and honest about being an approximation:
 * there are no joins and no caps, because nothing here draws a shape
 * where either would show.
 */
export function strokeSegment(
  fb: Framebuffer,
  a: Point,
  b: Point,
  width: number,
  color: Rgba,
  alpha = 1,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const half = Math.max(0.5, width / 2);
  const nx = (-dy / length) * half;
  const ny = (dx / length) * half;
  fillPolygons(
    fb,
    [
      [
        { x: a.x + nx, y: a.y + ny },
        { x: b.x + nx, y: b.y + ny },
        { x: b.x - nx, y: b.y - ny },
        { x: a.x - nx, y: a.y - ny },
      ],
    ],
    color,
    alpha,
  );
}

/**
 * Copy one framebuffer onto another, 1:1, optionally from a source
 * sub-rectangle. This is `drawImage` with no resampling, which is the
 * only kind of drawImage the pixel-art renderer ever performs.
 */
export function blit(
  target: Framebuffer,
  source: Framebuffer,
  destX: number,
  destY: number,
  sourceX = 0,
  sourceY = 0,
  sourceW = source.width,
  sourceH = source.height,
  alpha = 1,
  mode: BlendMode = "source-over",
): void {
  const left = Math.round(destX);
  const top = Math.round(destY);
  for (let sy = 0; sy < sourceH; sy++) {
    const from = sourceY + sy;
    if (from < 0 || from >= source.height) continue;
    for (let sx = 0; sx < sourceW; sx++) {
      const fx = sourceX + sx;
      if (fx < 0 || fx >= source.width) continue;
      const at = (from * source.width + fx) * 4;
      const a = source.data[at + 3] ?? 0;
      if (a === 0) continue;
      blendPixel(
        target,
        left + sx,
        top + sy,
        [
          source.data[at] ?? 0,
          source.data[at + 1] ?? 0,
          source.data[at + 2] ?? 0,
          a,
        ],
        alpha,
        mode,
      );
    }
  }
}
