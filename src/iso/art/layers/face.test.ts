import { describe, expect, it } from "vitest";
import { REMAP_CHANNELS } from "../palette";
import { gridErrors } from "../pixel";
import { BODY_FRAME } from "./body";
import { FACE_LAYERS, FACE_PART_IDS } from "./face";

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
});
