import { describe, expect, it } from "vitest";
import { EYE_COLOR_OPTIONS } from "../../../data/appearance";
import { eyeColorRemap } from "../layers";
import { REMAP_CHANNELS } from "../palette";
import { gridErrors, remapped } from "../pixel";
import { BODY_FRAME } from "./body";
import {
  BROW_PORTRAITS,
  EYE_PORTRAITS,
  FACE_LAYERS,
  FACE_PART_IDS,
} from "./face";

const ALLOWED = new Set<string>([
  ...REMAP_CHANNELS.skin,
  ...REMAP_CHANNELS.hair,
  ...REMAP_CHANNELS.eyes,
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

  it("uses only the skin, hair, and eye remap channels", () => {
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

  it("every eye shape and every brow shape has distinct front art", () => {
    for (const ids of [FACE_PART_IDS.eyes, FACE_PART_IDS.brows]) {
      const fronts = ids.map((id) => FACE_LAYERS[id].front.join("\n"));
      expect(new Set(fronts).size).toBe(ids.length);
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

/** Channels a portrait face grid may use: the sprite-layer remap
 * channels plus the structural inks and white that never remap. */
const PORTRAIT_ALLOWED = new Set<string>([...ALLOWED, "0", "1", "9"]);

describe("face portrait grids", () => {
  it("covers every declared eye and brow id", () => {
    expect(Object.keys(EYE_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.eyes].sort(),
    );
    expect(Object.keys(BROW_PORTRAITS).sort()).toEqual(
      [...FACE_PART_IDS.brows].sort(),
    );
  });

  it("every portrait grid is a valid rectangular palette grid", () => {
    for (const [id, grid] of [
      ...Object.entries(EYE_PORTRAITS),
      ...Object.entries(BROW_PORTRAITS),
    ]) {
      expect(gridErrors(grid), id).toEqual([]);
      expect(grid.length, `${id} rows`).toBeGreaterThan(0);
    }
  });

  it("uses only face channels plus structural inks, and stays distinct", () => {
    for (const portraits of [EYE_PORTRAITS, BROW_PORTRAITS]) {
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
