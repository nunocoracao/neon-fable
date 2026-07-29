import { describe, expect, it } from "vitest";
import { HAIR_STYLE_OPTIONS } from "../../../data/appearance";
import { gridErrors } from "../pixel";
import { REMAP_CHANNELS } from "../palette";
import { BODY_BUILD_IDS } from "./body";
import {
  PORTRAIT_FRAME,
  PORTRAIT_HAIR_GRIDS,
  PORTRAIT_HEADS,
  faceBoxGrid,
  placedAt,
  portraitHairGrid,
} from "./portrait";

const charsOf = (grid: readonly string[]): Set<string> => {
  const chars = new Set<string>();
  for (const row of grid) for (const ch of row) if (ch !== ".") chars.add(ch);
  return chars;
};

describe("the portrait frame contract", () => {
  it("keeps the face box and part anchors inside the 48×48 frame", () => {
    const { width, height, face, eyes, brows, mouth } = PORTRAIT_FRAME;
    expect(width).toBe(48);
    expect(height).toBe(48);
    expect(face.left + face.width).toBeLessThanOrEqual(width);
    expect(face.top + face.height).toBeLessThanOrEqual(height);
    // Eye/brow parts are 8 wide: the left part and its mirror tile the
    // 16-wide face box exactly.
    expect(eyes.left).toBe(face.left);
    expect(eyes.mirrorLeft).toBe(face.left + face.width / 2);
    expect(brows.mirrorLeft).toBe(face.left + face.width / 2);
    // The whole mouth sits centered on the face centerline.
    expect(mouth.left - face.left).toBe(face.left + face.width - (mouth.left + 8));
  });

  it("placedAt stamps a part at its anchor and pads with transparency", () => {
    const grid = placedAt(["ab", "cd"], 3, 2);
    expect(grid).toHaveLength(PORTRAIT_FRAME.height);
    expect(grid.every((row) => row.length === PORTRAIT_FRAME.width)).toBe(true);
    expect(grid[2]?.slice(3, 5)).toBe("ab");
    expect(grid[3]?.slice(3, 5)).toBe("cd");
    expect(grid[1]).toBe(".".repeat(PORTRAIT_FRAME.width));
  });

  it("placedAt rejects parts that leave the frame", () => {
    expect(() => placedAt(["ab"], 47, 0)).toThrow(/leaves/);
    expect(() => placedAt(["a"], 0, 48)).toThrow(/leaves/);
    expect(() => placedAt(["a"], -1, 0)).toThrow(/leaves/);
  });

  it("faceBoxGrid expands a 16×12 overlay onto the face box", () => {
    const overlay = Array.from({ length: 12 }, () => "X".repeat(16));
    const grid = faceBoxGrid(overlay);
    const { face } = PORTRAIT_FRAME;
    expect(grid[face.top]?.slice(face.left, face.left + face.width)).toBe(
      "X".repeat(16),
    );
    expect(grid[face.top - 1]).toBe(".".repeat(PORTRAIT_FRAME.width));
  });
});

describe("portrait base heads", () => {
  const allowed = new Set([
    "0",
    ...REMAP_CHANNELS.skin,
    ...REMAP_CHANNELS.outfitPrimary,
    ...REMAP_CHANNELS.outfitAccent,
  ]);

  it("registers a valid full-frame grid per build", () => {
    for (const build of BODY_BUILD_IDS) {
      const head = PORTRAIT_HEADS[build];
      expect(head, build).toHaveLength(PORTRAIT_FRAME.height);
      expect(gridErrors(head), build).toEqual([]);
      expect(
        head.every((row) => row.length === PORTRAIT_FRAME.width),
        build,
      ).toBe(true);
    }
  });

  it("uses only outline plus the skin and outfit remap channels", () => {
    for (const build of BODY_BUILD_IDS) {
      for (const ch of charsOf(PORTRAIT_HEADS[build])) {
        expect(allowed.has(ch), `${build} uses "${ch}"`).toBe(true);
      }
    }
  });

  it("shares the skull rows across builds so face parts align", () => {
    expect(PORTRAIT_HEADS.lean.slice(0, 17)).toEqual(
      PORTRAIT_HEADS.heavy.slice(0, 17),
    );
    expect(PORTRAIT_HEADS.lean).not.toEqual(PORTRAIT_HEADS.heavy);
  });

  it("carries the tintable garb channels on the shoulder band rows", () => {
    const { shoulders } = PORTRAIT_FRAME;
    for (const build of BODY_BUILD_IDS) {
      const band = PORTRAIT_HEADS[build].slice(shoulders.top, shoulders.bottom + 1);
      const chars = charsOf(band);
      // Primary cloth and the accent seam both present, so both outfit
      // material remaps show.
      expect(chars.has("W"), build).toBe(true);
      expect(chars.has("j"), build).toBe(true);
    }
  });

  it("keeps face-box interior rows in skin so overlays sit on the face", () => {
    const { face } = PORTRAIT_FRAME;
    for (const build of BODY_BUILD_IDS) {
      // The brow and chin rows of the face box are skin-channel pixels
      // at the mouth columns — the face never floats off the head.
      for (const rowIndex of [face.top, face.top + face.height - 1]) {
        const strip = PORTRAIT_HEADS[build][rowIndex]?.slice(20, 28) ?? "";
        expect(strip, `${build} row ${rowIndex}`).toMatch(/^[rqA]+$/);
      }
    }
  });
});

describe("portrait hair crowns", () => {
  it("covers every catalog style layer and crushed variant", () => {
    for (const option of HAIR_STYLE_OPTIONS) {
      for (const art of [option.layer, option.crushed]) {
        if (art === null) continue;
        expect(portraitHairGrid(art), art).not.toBeNull();
      }
    }
    expect(portraitHairGrid("beehive")).toBeNull();
  });

  it("every crown is a valid full-frame grid in the hair channel only", () => {
    for (const [id, grid] of Object.entries(PORTRAIT_HAIR_GRIDS)) {
      expect(grid, id).toHaveLength(PORTRAIT_FRAME.height);
      expect(gridErrors(grid), id).toEqual([]);
      expect(
        grid.every((row) => row.length === PORTRAIT_FRAME.width),
        id,
      ).toBe(true);
      expect([...charsOf(grid)], id).toEqual(["K"]);
    }
  });

  it("every crown reads distinct from every other", () => {
    const rendered = Object.values(PORTRAIT_HAIR_GRIDS).map((g) => g.join("\n"));
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("keeps fringe rows clear of the brow row the parts compose over", () => {
    // Hair composes above brows; crowns may frame the face at the
    // temples but never cover the brow-stroke columns (17–23 and
    // 24–30 mirrored) on the brow rows 9–10.
    for (const [id, grid] of Object.entries(PORTRAIT_HAIR_GRIDS)) {
      for (const rowIndex of [9, 10]) {
        const strip = grid[rowIndex]?.slice(17, 31) ?? "";
        expect(strip, `${id} row ${rowIndex}`).toBe(".".repeat(14));
      }
    }
  });
});
