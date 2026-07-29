import { describe, expect, it } from "vitest";
import { EYE_COLOR_OPTIONS } from "../../../data/appearance";
import { eyeColorRemap } from "../layers";
import { PALETTE, REMAP_CHANNELS } from "../palette";
import { gridErrors, remapped } from "../pixel";
import { BODY_FRAME, BODY_GRIDS } from "./body";
import {
  BROW_EXPRESSION_PORTRAITS,
  BROW_PORTRAITS,
  CYBER_LINES_SHIMMER,
  EXPRESSION_IDS,
  EYE_PORTRAITS,
  FACE_DETAIL_PORTRAITS,
  FACE_LAYERS,
  FACE_PART_IDS,
  MOUTH_EXPRESSION_PORTRAITS,
  MOUTH_PORTRAITS,
} from "./face";

const ALLOWED = new Set<string>([
  ...REMAP_CHANNELS.skin,
  ...REMAP_CHANNELS.hair,
  ...REMAP_CHANNELS.eyes,
  ...REMAP_CHANNELS.cyberChrome,
  ...REMAP_CHANNELS.tattooInk,
]);

describe("face layers", () => {
  it("registers a grid for every declared face part id", () => {
    const declared = Object.values(FACE_PART_IDS).flat();
    expect(Object.keys(FACE_LAYERS).sort()).toEqual([...declared].sort());
  });

  it("every face grid is a valid 32×48 palette grid", () => {
    for (const [id, views] of Object.entries(FACE_LAYERS)) {
      for (const [view, grid] of Object.entries(views)) {
        expect(gridErrors(grid), `${id} ${view}`).toEqual([]);
        expect(grid.length, `${id} ${view} height`).toBe(BODY_FRAME.height);
        expect(grid[0]?.length, `${id} ${view} width`).toBe(BODY_FRAME.width);
      }
    }
  });

  it("uses only the skin, hair, eye, chrome, and tattoo-ink channels", () => {
    for (const [id, views] of Object.entries(FACE_LAYERS)) {
      for (const [view, grid] of Object.entries(views)) {
        for (const row of grid) {
          for (const ch of row) {
            if (ch === ".") continue;
            expect(ALLOWED.has(ch), `${id} ${view} uses "${ch}"`).toBe(true);
          }
        }
      }
    }
  });

  it("lands every face pixel on head skin, never the skull outline", () => {
    // Both builds share identical head rows, so lean stands for both.
    // The skull narrows toward the crown, so the head-box bound alone
    // is not enough — every drawn pixel must cover a skin pixel of the
    // base head, leaving the "0" silhouette outline intact.
    const skin = new Set<string>(REMAP_CHANNELS.skin);
    const body = BODY_GRIDS.lean.front;
    for (const [id, views] of Object.entries(FACE_LAYERS)) {
      views.front.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch === ".") return;
          const under = body[y]?.[x];
          expect(
            under !== undefined && skin.has(under),
            `${id} (${x},${y}) covers "${under}"`,
          ).toBe(true);
        });
      });
    }
  });

  it("keeps face pixels inside the front head interior", () => {
    for (const [id, views] of Object.entries(FACE_LAYERS)) {
      const { head } = BODY_FRAME;
      let drawn = 0;
      views.front.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch === ".") return;
          drawn++;
          expect(y, `${id} row ${y}`).toBeGreaterThan(head.top);
          expect(y, `${id} row ${y}`).toBeLessThan(head.bottom);
          expect(x, `${id} col ${x}`).toBeGreaterThan(head.left);
          expect(x, `${id} col ${x}`).toBeLessThan(head.right);
        });
      });
      expect(drawn, `${id} draws something`).toBeGreaterThan(0);
    }
  });

  it("eyes parts carry irises in the eye channel", () => {
    for (const id of FACE_PART_IDS.eyes) {
      const irises = FACE_LAYERS[id].front
        .flatMap((row) => [...row])
        .filter((ch) => ch === "g").length;
      expect(irises, `${id} irises`).toBeGreaterThan(0);
    }
  });

  it("back views are fully transparent (faces only exist up front)", () => {
    for (const [id, views] of Object.entries(FACE_LAYERS)) {
      expect(
        views.back.every((row) => [...row].every((ch) => ch === ".")),
        id,
      ).toBe(true);
    }
  });

  it("every eye, brow, mouth, and detail shape has distinct front art", () => {
    for (const ids of [
      FACE_PART_IDS.eyes,
      FACE_PART_IDS.brows,
      FACE_PART_IDS.mouth,
      FACE_PART_IDS.faceDetail,
    ]) {
      const fronts = ids.map((id) => FACE_LAYERS[id].front.join("\n"));
      expect(new Set(fronts).size).toBe(ids.length);
    }
  });

  it("mouths draw in skin shade; the breather mask in cyber-chrome", () => {
    const chrome = new Set<string>(REMAP_CHANNELS.cyberChrome);
    const [skinShade] = REMAP_CHANNELS.skin;
    for (const id of FACE_PART_IDS.mouth) {
      for (const row of FACE_LAYERS[id].front) {
        for (const ch of row) {
          if (ch === ".") continue;
          if (id === "breather") {
            expect(chrome.has(ch), `${id} uses "${ch}"`).toBe(true);
          } else {
            expect(ch, id).toBe(skinShade);
          }
        }
      }
    }
  });

  it("brows draw only in the hair channel", () => {
    const [hairChannel] = REMAP_CHANNELS.hair;
    for (const id of FACE_PART_IDS.brows) {
      for (const row of FACE_LAYERS[id].front) {
        for (const ch of row) {
          if (ch === ".") continue;
          expect(ch, id).toBe(hairChannel);
        }
      }
    }
  });

  it("eye-color remap produces a distinct grid per catalog eye color", () => {
    for (const id of FACE_PART_IDS.eyes) {
      const looks = EYE_COLOR_OPTIONS.map((option) =>
        remapped(FACE_LAYERS[id].front, eyeColorRemap(option.color)).join("\n"),
      );
      expect(new Set(looks).size, id).toBe(EYE_COLOR_OPTIONS.length);
    }
  });
});

describe("face detail layers", () => {
  const skin = new Set<string>(REMAP_CHANNELS.skin);
  const ink = new Set<string>(REMAP_CHANNELS.tattooInk);
  const chrome = new Set<string>(REMAP_CHANNELS.cyberChrome);

  const frontChars = (id: string): string[] =>
    FACE_LAYERS[id as keyof typeof FACE_LAYERS].front
      .flatMap((row) => [...row])
      .filter((ch) => ch !== ".");

  it("scars draw only in skin-ramp tones so they recolor with the tone", () => {
    for (const id of ["scar", "brow-split"]) {
      for (const ch of frontChars(id)) {
        expect(skin.has(ch), `${id} uses "${ch}"`).toBe(true);
      }
    }
  });

  it("tattoo and circuit ink draw only in the tattoo-ink channel", () => {
    for (const id of ["tattoo", "circuit-ink"]) {
      for (const ch of frontChars(id)) {
        expect(ink.has(ch), `${id} uses "${ch}"`).toBe(true);
      }
    }
  });

  it("cyber-lines draw only in the cyber-chrome channel", () => {
    for (const ch of frontChars("cyber-lines")) {
      expect(chrome.has(ch), `cyber-lines uses "${ch}"`).toBe(true);
    }
  });

  it("the cyber-lines shimmer is two distinct frames over drawn chars", () => {
    expect(CYBER_LINES_SHIMMER).toHaveLength(2);
    const drawn = new Set(frontChars("cyber-lines"));
    const keys = CYBER_LINES_SHIMMER.map((frame) =>
      JSON.stringify(
        Object.entries(frame).sort(([a], [b]) => a.localeCompare(b)),
      ),
    );
    expect(new Set(keys).size).toBe(CYBER_LINES_SHIMMER.length);
    for (const frame of CYBER_LINES_SHIMMER) {
      expect(Object.keys(frame).length).toBeGreaterThan(0);
      for (const [from, to] of Object.entries(frame)) {
        // Every remap source is a char the trace art actually draws...
        expect(drawn.has(from), `shimmer source "${from}"`).toBe(true);
        // ...and every target is a real palette entry.
        expect(PALETTE[to], `shimmer target "${to}"`).toBeDefined();
      }
    }
  });
});

/** Channels a portrait face grid may use: the sprite-layer remap
 * channels plus the structural inks and white that never remap. */
const PORTRAIT_ALLOWED = new Set<string>([...ALLOWED, "0", "1", "9"]);

describe("face portrait grids", () => {
  it("covers every declared eye, brow, mouth, and detail id", () => {
    expect(Object.keys(EYE_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.eyes].sort(),
    );
    expect(Object.keys(BROW_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.brows].sort(),
    );
    expect(Object.keys(MOUTH_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.mouth].sort(),
    );
    expect(Object.keys(FACE_DETAIL_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.faceDetail].sort(),
    );
  });

  it("every portrait grid is a valid rectangular palette grid", () => {
    for (const [id, grid] of [
      ...Object.entries(EYE_PORTRAITS),
      ...Object.entries(BROW_PORTRAITS),
      ...Object.entries(MOUTH_PORTRAITS),
      ...Object.entries(FACE_DETAIL_PORTRAITS),
    ]) {
      expect(gridErrors(grid), id).toEqual([]);
      expect(grid.length, `${id} rows`).toBeGreaterThan(0);
    }
  });

  it("detail portraits keep their sprite channel discipline", () => {
    const skin = new Set<string>(REMAP_CHANNELS.skin);
    const ink = new Set<string>(REMAP_CHANNELS.tattooInk);
    const chrome = new Set<string>(REMAP_CHANNELS.cyberChrome);
    const channelFor: Record<string, Set<string>> = {
      scar: skin,
      "brow-split": skin,
      tattoo: ink,
      "circuit-ink": ink,
      "cyber-lines": chrome,
    };
    for (const [id, grid] of Object.entries(FACE_DETAIL_PORTRAITS)) {
      const allowed = channelFor[id];
      expect(allowed, `${id} has a channel`).toBeDefined();
      let drawn = 0;
      for (const row of grid) {
        for (const ch of row) {
          if (ch === ".") continue;
          drawn++;
          expect(allowed?.has(ch), `${id} uses "${ch}"`).toBe(true);
        }
      }
      expect(drawn, `${id} draws something`).toBeGreaterThan(0);
    }
  });

  it("uses only face channels plus structural inks, and stays distinct", () => {
    for (const portraits of [
      EYE_PORTRAITS,
      BROW_PORTRAITS,
      MOUTH_PORTRAITS,
      FACE_DETAIL_PORTRAITS,
    ]) {
      for (const [id, grid] of Object.entries(portraits)) {
        for (const row of grid) {
          for (const ch of row) {
            if (ch === ".") continue;
            expect(PORTRAIT_ALLOWED.has(ch), `${id} uses "${ch}"`).toBe(true);
          }
        }
      }
      const drawings = Object.values(portraits).map((g) => g.join("\n"));
      expect(new Set(drawings).size).toBe(drawings.length);
    }
  });

  it("eye portraits carry a richer iris stroke; brow portraits stroke in hair", () => {
    const [hairChannel] = REMAP_CHANNELS.hair;
    const [irisChannel] = REMAP_CHANNELS.eyes;
    for (const [id, grid] of Object.entries(EYE_PORTRAITS)) {
      const irises = grid
        .flatMap((row) => [...row])
        .filter((ch) => ch === irisChannel).length;
      expect(irises, `${id} iris pixels`).toBeGreaterThanOrEqual(2);
    }
    for (const [id, grid] of Object.entries(BROW_PORTRAITS)) {
      const strokes = grid
        .flatMap((row) => [...row])
        .filter((ch) => ch === hairChannel).length;
      expect(strokes, `${id} brow pixels`).toBeGreaterThanOrEqual(2);
      expect(
        grid.every((row) =>
          [...row].every((ch) => ch === "." || ch === hairChannel),
        ),
        `${id} strokes only in the hair channel`,
      ).toBe(true);
    }
  });
});

describe("expression portrait variants", () => {
  it("carries a variant for every part id × expression", () => {
    expect(Object.keys(MOUTH_EXPRESSION_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.mouth].sort(),
    );
    expect(Object.keys(BROW_EXPRESSION_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.brows].sort(),
    );
    for (const [id, variants] of [
      ...Object.entries(MOUTH_EXPRESSION_PORTRAITS),
      ...Object.entries(BROW_EXPRESSION_PORTRAITS),
    ]) {
      expect(Object.keys(variants).sort(), id).toEqual(
        [...EXPRESSION_IDS].sort(),
      );
    }
  });

  it("every variant is a valid grid in the portrait channels", () => {
    for (const [id, variants] of [
      ...Object.entries(MOUTH_EXPRESSION_PORTRAITS),
      ...Object.entries(BROW_EXPRESSION_PORTRAITS),
    ]) {
      for (const [expression, grid] of Object.entries(variants)) {
        const label = `${id} ${expression}`;
        expect(gridErrors(grid), label).toEqual([]);
        let drawn = 0;
        for (const row of grid) {
          for (const ch of row) {
            if (ch === ".") continue;
            drawn++;
            expect(PORTRAIT_ALLOWED.has(ch), `${label} uses "${ch}"`).toBe(true);
          }
        }
        expect(drawn, `${label} draws something`).toBeGreaterThan(0);
      }
    }
  });

  it("the neutral variant is the resting portrait; the rest read differently", () => {
    for (const [id, variants] of Object.entries(MOUTH_EXPRESSION_PORTRAITS)) {
      expect(variants.neutral, id).toBe(
        MOUTH_PORTRAITS[id as keyof typeof MOUTH_PORTRAITS],
      );
      const looks = EXPRESSION_IDS.map((e) => variants[e].join("\n"));
      expect(new Set(looks).size, `${id} expressions distinct`).toBe(
        EXPRESSION_IDS.length,
      );
    }
    for (const [id, variants] of Object.entries(BROW_EXPRESSION_PORTRAITS)) {
      expect(variants.neutral, id).toBe(
        BROW_PORTRAITS[id as keyof typeof BROW_PORTRAITS],
      );
      const looks = EXPRESSION_IDS.map((e) => variants[e].join("\n"));
      expect(new Set(looks).size, `${id} expressions distinct`).toBe(
        EXPRESSION_IDS.length,
      );
    }
  });
});
