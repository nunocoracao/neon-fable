import { describe, expect, it } from "vitest";
import {
  buildGallerySections,
  filterSections,
  matchesQuery,
  type GallerySection,
} from "./gallery";
import {
  BROWS_OPTIONS,
  EYE_COLOR_OPTIONS,
  EYES_OPTIONS,
  FACE_DETAIL_OPTIONS,
  HAIR_COLOR_OPTIONS,
  MOUTH_OPTIONS,
} from "../../data/appearance";
import { CHARACTER_FRAMES, ROLE_REMAPS } from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import { BODY_BUILD_IDS } from "./layers/body";
import { HAIR_STYLE_IDS } from "./layers/hair";
import { gridErrors } from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART } from "./tiles";

/**
 * The dev art-gallery registry: every registered art piece must appear
 * exactly once, with valid display-ready grids and animation metadata,
 * and the id filter must narrow sections by substring.
 */

const sections = buildGallerySections();

function section(id: string): GallerySection {
  const found = sections.find((s) => s.id === id);
  if (!found) throw new Error(`missing gallery section ${id}`);
  return found;
}

describe("gallery sections", () => {
  it("groups art into uniquely-identified sections", () => {
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual([
      "tiles",
      "props",
      "interactables",
      "characters",
      "bodies",
      "appearance",
    ]);
    for (const s of sections) {
      const entryIds = s.entries.map((e) => e.id);
      expect(new Set(entryIds).size, `${s.id} entry ids unique`).toBe(
        entryIds.length,
      );
      expect(s.entries.length, `${s.id} not empty`).toBeGreaterThan(0);
    }
  });

  it("covers every tile id and every variant", () => {
    const tiles = section("tiles");
    const expected = Object.entries(TILE_ART).reduce(
      (sum, [, art]) => sum + art.variants.length,
      0,
    );
    expect(tiles.entries.length).toBe(expected);
    for (const id of Object.keys(TILE_ART)) {
      expect(
        tiles.entries.some((e) => e.id === id || e.id.startsWith(`${id} v`)),
        `tile ${id} present`,
      ).toBe(true);
    }
  });

  it("covers every prop and every drawn interactable", () => {
    expect(section("props").entries.map((e) => e.id).sort()).toEqual(
      Object.keys(PROP_ART).sort(),
    );
    expect(section("interactables").entries.map((e) => e.id).sort()).toEqual(
      Object.keys(INTERACTABLE_ART).sort(),
    );
  });

  it("covers every legacy role, facing, and motion state", () => {
    const chars = section("characters");
    expect(chars.entries.length).toBe(Object.keys(ROLE_REMAPS).length * 4 * 2);
    for (const role of Object.keys(ROLE_REMAPS)) {
      for (const facing of ["n", "e", "s", "w"]) {
        for (const state of ["idle", "walk"]) {
          expect(
            chars.entries.some((e) => e.id === `${role} ${facing} ${state}`),
            `${role} ${facing} ${state} present`,
          ).toBe(true);
        }
      }
    }
  });

  it("covers every hi-res body build, facing, and motion state", () => {
    const bodies = section("bodies");
    expect(bodies.entries.length).toBe(BODY_BUILD_IDS.length * 4 * 2);
    for (const build of BODY_BUILD_IDS) {
      expect(
        bodies.entries.some((e) => e.id === `${build} w walk`),
        `${build} mirrored walk present`,
      ).toBe(true);
    }
  });

  it("covers every registered hair style × hair color × facing, plus a walk sweep per build", () => {
    const appearance = section("appearance");
    const drawnDetails = FACE_DETAIL_OPTIONS.filter((o) => o.layer !== null);
    expect(appearance.entries.length).toBe(
      HAIR_STYLE_IDS.length * HAIR_COLOR_OPTIONS.length * 4 +
        HAIR_STYLE_IDS.length * BODY_BUILD_IDS.length * 4 +
        EYES_OPTIONS.length * EYE_COLOR_OPTIONS.length +
        EYES_OPTIONS.length * BROWS_OPTIONS.length +
        MOUTH_OPTIONS.length +
        drawnDetails.length,
    );
    for (const style of HAIR_STYLE_IDS) {
      for (const color of HAIR_COLOR_OPTIONS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `hair ${style} ${color.id} ${facing}`,
            ),
            `hair ${style} ${color.id} ${facing} present`,
          ).toBe(true);
        }
      }
      for (const build of BODY_BUILD_IDS) {
        for (const facing of ["n", "e", "s", "w"]) {
          expect(
            appearance.entries.some(
              (e) => e.id === `hair ${style} ${build} walk ${facing}`,
            ),
            `hair ${style} ${build} walk ${facing} present`,
          ).toBe(true);
        }
      }
    }
    // Each color actually recolors: same style+facing, distinct frames.
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    const looks = HAIR_COLOR_OPTIONS.map((c) => frame(`hair bob ${c.id} e`));
    expect(new Set(looks).size).toBe(HAIR_COLOR_OPTIONS.length);
    // The walk sweep really differs per build.
    expect(frame("hair locs lean walk e")).not.toBe(
      frame("hair locs heavy walk e"),
    );
  });

  it("covers every eye shape × eye color and eye shape × brow shape up front", () => {
    const appearance = section("appearance");
    for (const eyes of EYES_OPTIONS) {
      for (const color of EYE_COLOR_OPTIONS) {
        expect(
          appearance.entries.some(
            (e) => e.id === `eyes ${eyes.id} ${color.id} e`,
          ),
          `eyes ${eyes.id} ${color.id} present`,
        ).toBe(true);
      }
      for (const brows of BROWS_OPTIONS) {
        expect(
          appearance.entries.some(
            (e) => e.id === `face ${eyes.id} ${brows.id} e`,
          ),
          `face ${eyes.id} ${brows.id} present`,
        ).toBe(true);
      }
    }
    // Each eye color actually recolors: same shape, distinct frames.
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    const looks = EYE_COLOR_OPTIONS.map((c) => frame(`eyes standard ${c.id} e`));
    expect(new Set(looks).size).toBe(EYE_COLOR_OPTIONS.length);
    // Brow combos really differ per brow shape.
    const combos = BROWS_OPTIONS.map((b) => frame(`face standard ${b.id} e`));
    expect(new Set(combos).size).toBe(BROWS_OPTIONS.length);
  });

  it("covers every mouth style up front, each with distinct art", () => {
    const appearance = section("appearance");
    for (const mouth of MOUTH_OPTIONS) {
      expect(
        appearance.entries.some((e) => e.id === `mouth ${mouth.id} e`),
        `mouth ${mouth.id} present`,
      ).toBe(true);
    }
    const frame = (id: string): string =>
      appearance.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    const looks = MOUTH_OPTIONS.map((m) => frame(`mouth ${m.id} e`));
    expect(new Set(looks).size).toBe(MOUTH_OPTIONS.length);
  });

  it("covers every drawn face detail up front, and cyber-lines glows", () => {
    const appearance = section("appearance");
    const drawn = FACE_DETAIL_OPTIONS.filter((o) => o.layer !== null);
    for (const detail of drawn) {
      expect(
        appearance.entries.some((e) => e.id === `detail ${detail.id} e`),
        `detail ${detail.id} present`,
      ).toBe(true);
    }
    const frame = (id: string, f = 0): string =>
      appearance.entries.find((e) => e.id === id)?.frames[f]?.join("\n") ?? "";
    // Every detail reads differently over the same default face.
    const looks = drawn.map((d) => frame(`detail ${d.id} e`));
    expect(new Set(looks).size).toBe(drawn.length);
    // The shimmer cycles: frame 0 sits dim, frame 1 lights neon cyan
    // trace pixels beyond the standard eyes' four iris pixels.
    const count = (f: number, ch: string): number =>
      [...frame("detail cyber-lines e", f)].filter((c) => c === ch).length;
    expect(count(0, "i")).toBeGreaterThan(0);
    expect(count(1, "g")).toBeGreaterThan(count(0, "g"));
  });
});

describe("gallery entries", () => {
  it("every frame is a valid palette-indexed grid", () => {
    for (const s of sections) {
      for (const entry of s.entries) {
        expect(entry.frames.length, `${s.id}/${entry.id} has frames`).toBeGreaterThan(0);
        entry.frames.forEach((grid, f) => {
          expect(gridErrors(grid), `${s.id}/${entry.id} frame ${f}`).toEqual([]);
        });
      }
    }
  });

  it("multi-frame entries carry a positive frame duration and animate", () => {
    for (const s of sections) {
      for (const entry of s.entries) {
        if (entry.frames.length > 1) {
          expect(entry.frameMs, `${s.id}/${entry.id} frameMs`).toBeGreaterThan(0);
        } else {
          expect(entry.frameMs, `${s.id}/${entry.id} static`).toBe(0);
        }
      }
    }
  });

  it("character animations exist for all facings and actually animate", () => {
    const chars = section("characters");
    for (const entry of chars.entries) {
      expect(entry.frames.length, `${entry.id} frames`).toBeGreaterThan(1);
      expect(entry.frameMs, `${entry.id} frameMs`).toBeGreaterThan(0);
    }
  });

  it("applies the in-game shims: tiles at 64×32, legacy characters doubled", () => {
    for (const entry of section("tiles").entries) {
      for (const grid of entry.frames) {
        expect(grid.length, `${entry.id} height`).toBe(32);
        expect(grid[0]?.length, `${entry.id} width`).toBe(64);
      }
    }
    const legacyH = (CHARACTER_FRAMES.e.idle[0] ?? []).length;
    for (const entry of section("characters").entries) {
      expect(entry.frames[0]?.length, `${entry.id} doubled`).toBe(legacyH * 2);
    }
  });

  it("role remaps recolor the shared character grids", () => {
    const chars = section("characters");
    const frame = (id: string): string =>
      chars.entries.find((e) => e.id === id)?.frames[0]?.join("\n") ?? "";
    expect(frame("enemy e idle")).not.toBe("");
    expect(frame("npc e idle")).not.toBe(frame("enemy e idle"));
  });
});

describe("gallery filter", () => {
  it("matches case-insensitively by id substring", () => {
    expect(matchesQuery("pavement v0", "PAVE")).toBe(true);
    expect(matchesQuery("pavement v0", "  pave ")).toBe(true);
    expect(matchesQuery("pavement v0", "canal")).toBe(false);
    expect(matchesQuery("anything", "")).toBe(true);
  });

  it("narrows entries and drops empty sections", () => {
    const filtered = filterSections(sections, "pavement");
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe("tiles");
    expect(
      filtered[0]?.entries.every((e) => e.id.includes("pavement")),
    ).toBe(true);
    expect(filterSections(sections, "no-such-art")).toEqual([]);
  });

  it("keeps everything on an empty query", () => {
    const filtered = filterSections(sections, "");
    expect(filtered.map((s) => s.entries.length)).toEqual(
      sections.map((s) => s.entries.length),
    );
  });
});
