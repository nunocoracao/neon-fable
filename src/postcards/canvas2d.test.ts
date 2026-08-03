import { afterEach, describe, expect, it } from "vitest";
import { bakeSprite, silhouetteGrid } from "../iso/art/pixel";
import { bakeGlow } from "../iso/art/glow";
import {
  createCanvas,
  createSurface,
  framebufferOf,
  installCanvasShim,
  textWidth,
} from "./canvas2d";

let uninstall: (() => void) | null = null;

afterEach(() => {
  uninstall?.();
  uninstall = null;
});

function at(
  fb: ReturnType<typeof framebufferOf>,
  x: number,
  y: number,
): number[] {
  const i = (y * fb.width + x) * 4;
  return [...fb.data.slice(i, i + 4)];
}

describe("the canvas shim", () => {
  it("hands the sprite bake a working 2d context", () => {
    uninstall = installCanvasShim();
    // ART_SCALE is 2 and the detail pass splits each authored pixel, so
    // a 2×1 grid still bakes to a 4×2 canvas — the whole point of the
    // shim is that this path is the shipping one, unchanged.
    const sprite = bakeSprite([".g"], 1, 1);
    const image = sprite.image as unknown as { width: number; height: number };
    expect(image.width).toBe(4);
    expect(image.height).toBe(2);
    expect(sprite.anchorX).toBe(2);
    const fb = framebufferOf(sprite.image);
    expect(at(fb, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(fb, 3, 1).slice(3)).toEqual([255]);
  });

  it("bakes a radial glow through createRadialGradient", () => {
    uninstall = installCanvasShim();
    const glow = bakeGlow("g", 4);
    const fb = framebufferOf(glow.image);
    expect(fb.width).toBe(16);
    const centre = at(fb, 8, 8);
    const corner = at(fb, 0, 0);
    // The falloff runs 0.6 alpha at the centre to 0 at the rim.
    expect(centre[3]).toBeGreaterThan(120);
    expect(corner[3]).toBe(0);
  });

  it("refuses to make anything but a canvas", () => {
    uninstall = installCanvasShim();
    const host = globalThis as { document?: { createElement(tag: string): unknown } };
    expect(() => host.document?.createElement("div")).toThrow(/only make canvases/);
  });

  it("puts back whatever document was there before", () => {
    const host = globalThis as { document?: unknown };
    const before = host.document;
    installCanvasShim()();
    expect(host.document).toBe(before);
  });
});

describe("the 2d context", () => {
  it("fills, translates, and restores", () => {
    const { ctx, fb } = createSurface(8, 8);
    ctx.save();
    ctx.translate(2, 2);
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 2, 2);
    ctx.restore();
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(0, 0, 1, 1);
    expect(at(fb, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(at(fb, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("honours globalAlpha", () => {
    const { ctx, fb } = createSurface(2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, 2, 2);
    expect(at(fb, 0, 0)).toEqual([255, 255, 255, 128]);
  });

  it("fills a closed path", () => {
    const { ctx, fb } = createSurface(9, 9);
    ctx.fillStyle = "#0000ff";
    ctx.beginPath();
    ctx.moveTo(4.5, 0);
    ctx.lineTo(9, 4.5);
    ctx.lineTo(4.5, 9);
    ctx.lineTo(0, 4.5);
    ctx.closePath();
    ctx.fill();
    expect(at(fb, 4, 4)).toEqual([0, 0, 255, 255]);
    expect(at(fb, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("draws one canvas onto another at whole pixels", () => {
    const source = createCanvas(2, 2);
    const sourceCtx = source.getContext("2d");
    sourceCtx?.fillRect(0, 0, 2, 2);
    const { ctx, fb } = createSurface(6, 6);
    ctx.drawImage(source, 3, 3);
    expect(at(fb, 3, 3)).toEqual([0, 0, 0, 255]);
    expect(at(fb, 2, 2)).toEqual([0, 0, 0, 0]);
  });

  it("refuses a resampling drawImage rather than inventing one", () => {
    const source = createCanvas(2, 2);
    const { ctx } = createSurface(6, 6);
    expect(() => ctx.drawImage(source, 0, 0, 2, 2, 0, 0, 4, 4)).toThrow(
      /does not resample/,
    );
  });

  it("measures and draws pixel-font text", () => {
    const { ctx, fb } = createSurface(64, 24);
    ctx.font = "bold 10px monospace";
    expect(ctx.measureText("AB").width).toBe(textWidth("AB", 2));
    ctx.fillStyle = "#ffffff";
    ctx.fillText("A", 0, 12);
    // A 10px font is the 5-row glyph at scale 2, and it sits *above*
    // the baseline it was asked for: rows 2..11, nothing at 12.
    const rows = Array.from({ length: 24 }, (_, y) =>
      Array.from({ length: 64 }, (_, x) => at(fb, x, y)[3] ?? 0).some((a) => a > 0),
    );
    expect(rows[0]).toBe(false);
    expect(rows[2]).toBe(true);
    expect(rows[11]).toBe(true);
    expect(rows[12]).toBe(false);
  });
});

describe("silhouettes through the shim", () => {
  it("bakes the traced shape and nothing else", () => {
    uninstall = installCanvasShim();
    expect(silhouetteGrid(["gz.", "..g"])).toEqual(["9..", "..9"]);
  });
});
