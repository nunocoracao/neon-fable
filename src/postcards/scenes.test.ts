import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "./png";
import { renderScenePostcards } from "./scenes";

/**
 * The scene postcards run the shipping renderer against a framebuffer,
 * which makes this the one test in the repo that proves `renderScene`
 * paints — every other scene test checks the decisions it makes on the
 * way there. What is pinned is that pixels land, not which: the art is
 * expected to change and a hash over a whole district would be a
 * tripwire on every re-author.
 */
const postcards = renderScenePostcards();

/** Share of pixels that differ from the flat page background. */
function painted(data: Uint8Array, width: number, height: number): number {
  let lit = 0;
  for (let at = 0; at < data.length; at += 4) {
    if ((data[at] ?? 0) > 24 || (data[at + 1] ?? 0) > 24 || (data[at + 2] ?? 0) > 30) {
      lit++;
    }
  }
  return lit / (width * height);
}

describe("scene postcards", () => {
  it("renders a street, an interior, and an arena", () => {
    const names = postcards.map((scene) => scene.name);
    expect(names).toContain("scene-street-night");
    expect(names).toContain("scene-interior");
    expect(names).toContain("scene-arena");
    expect(new Set(names).size).toBe(names.length);
  });

  it("paints a real picture on every one, fully opaque", () => {
    for (const scene of postcards) {
      const { width, height, data } = scene.framebuffer;
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      // Nothing may be left transparent: the renderer clears to nothing
      // and the postcard puts the page back behind it.
      for (let at = 3; at < data.length; at += 4) {
        if (data[at] !== 255) {
          throw new Error(`${scene.name} left a transparent pixel at ${at / 4}`);
        }
      }
      expect(painted(data, width, height)).toBeGreaterThan(0.1);
    }
  });

  it("encodes to PNGs that decode back to the same pixels", () => {
    const scene = postcards[0];
    if (!scene) throw new Error("no scene postcards were rendered");
    const { width, height, data } = scene.framebuffer;
    const back = decodePng(encodePng({ width, height, data }));
    expect(back.width).toBe(width);
    expect(back.height).toBe(height);
    expect([...back.data.slice(0, 4096)]).toEqual([...data.slice(0, 4096)]);
  });

  it("is deterministic: the same clock draws the same frame", () => {
    const again = renderScenePostcards();
    const first = postcards[0]?.framebuffer;
    const second = again[0]?.framebuffer;
    expect(second?.data).toEqual(first?.data);
  });
});
