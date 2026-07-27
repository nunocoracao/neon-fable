import { describe, expect, it } from "vitest";
import { frameAt } from "../animation";
import {
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import { PALETTE, TRANSPARENT } from "./palette";
import {
  DIAMOND_WIDTHS,
  gridErrors,
  mirrored,
  remapped,
  type PixelGrid,
} from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART } from "./tiles";
import { IDLE_FRAME_MS, WALK_FRAME_MS, characterFrameIndex } from "./provider";

function expectValid(grid: PixelGrid, label: string): void {
  expect(gridErrors(grid), label).toEqual([]);
}

describe("palette", () => {
  it("stays a disciplined 16-32 color set", () => {
    const colors = Object.values(PALETTE);
    expect(colors.length).toBeGreaterThanOrEqual(16);
    expect(colors.length).toBeLessThanOrEqual(32);
    expect(new Set(colors).size).toBe(colors.length);
    expect(PALETTE[TRANSPARENT]).toBeUndefined();
  });
});

describe("tile art", () => {
  it("every tile grid is a valid 32×16 palette-indexed diamond", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      art.variants.forEach((frames, v) => {
        expect(frames.length, `${id} variant ${v} has frames`).toBeGreaterThan(0);
        frames.forEach((grid, f) => {
          expectValid(grid, `${id} variant ${v} frame ${f}`);
          expect(grid.length, `${id} v${v} f${f} height`).toBe(16);
          expect(grid[0]?.length, `${id} v${v} f${f} width`).toBe(32);
        });
      });
    }
  });

  it("walkable floor types carry multiple texture variants", () => {
    expect(TILE_ART.pavement.variants.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART["pavement-cracked"].variants.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART["rust-floor"].variants.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART.road.variants.length).toBeGreaterThanOrEqual(2);
  });

  it("water and glow tiles animate", () => {
    expect(TILE_ART.canal.variants[0]?.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART.canal.frameMs).toBeGreaterThan(0);
    expect(TILE_ART["plaza-glow"].variants[0]?.length).toBeGreaterThanOrEqual(2);
  });

  it("diamond widths tessellate the plane exactly", () => {
    expect(DIAMOND_WIDTHS.length).toBe(16);
    expect([...DIAMOND_WIDTHS].reverse()).toEqual([...DIAMOND_WIDTHS]);
    // The mask must match pixel ownership under screenToTile (rounding
    // world coordinates at pixel centers): row r owns 4*min(r, 15-r)+2.
    DIAMOND_WIDTHS.forEach((width, r) => {
      expect(width).toBe(4 * Math.min(r, 15 - r) + 2);
    });
  });
});

describe("prop art", () => {
  it("every prop frame is valid and frames share dimensions", () => {
    for (const [id, art] of Object.entries(PROP_ART)) {
      expect(art.frames.length, `${id} frames`).toBeGreaterThan(0);
      const first = art.frames[0];
      art.frames.forEach((grid, f) => {
        expectValid(grid, `${id} frame ${f}`);
        expect(grid.length, `${id} frame ${f} height`).toBe(first?.length);
        expect(grid[0]?.length, `${id} frame ${f} width`).toBe(first?.[0]?.length);
      });
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(first?.[0]?.length ?? 0);
      expect(art.anchorY, `${id} anchorY`).toBeLessThan(first?.length ?? 0);
    }
  });

  it("neon props have a distinct dropout frame to flicker to", () => {
    for (const id of ["streetlight", "holo-sign"] as const) {
      const art = PROP_ART[id];
      expect(art.flicker).toBe(true);
      expect(art.frames.length).toBeGreaterThanOrEqual(2);
      expect(art.frames[art.frames.length - 1]).not.toEqual(art.frames[0]);
    }
  });
});

describe("interactable art", () => {
  it("door and terminal frames are valid, same-sized pulse loops", () => {
    for (const [id, art] of Object.entries(INTERACTABLE_ART)) {
      expect(art.frames.length, id).toBeGreaterThanOrEqual(2);
      expect(art.frameMs, id).toBeGreaterThan(0);
      const first = art.frames[0];
      art.frames.forEach((grid, f) => {
        expectValid(grid, `${id} frame ${f}`);
        expect(grid.length, `${id} frame ${f} height`).toBe(first?.length);
        expect(grid[0]?.length, `${id} frame ${f} width`).toBe(first?.[0]?.length);
      });
    }
  });
});

describe("character art", () => {
  const facings = ["n", "e", "s", "w"] as const;

  it("every facing has 2+ idle and 4+ walk frames, all 16×24", () => {
    for (const facing of facings) {
      const states = CHARACTER_FRAMES[facing];
      expect(states.idle.length, `${facing} idle`).toBeGreaterThanOrEqual(2);
      expect(states.walk.length, `${facing} walk`).toBeGreaterThanOrEqual(4);
      for (const [state, frames] of Object.entries(states)) {
        frames.forEach((grid, f) => {
          expectValid(grid, `${facing} ${state} frame ${f}`);
          expect(grid.length, `${facing} ${state} f${f} height`).toBe(24);
          expect(grid[0]?.length, `${facing} ${state} f${f} width`).toBe(16);
        });
      }
    }
  });

  it("opposite facings mirror each other", () => {
    expect(CHARACTER_FRAMES.s.idle[0]).toEqual(
      mirrored(CHARACTER_FRAMES.e.idle[0] ?? []),
    );
    expect(CHARACTER_FRAMES.w.walk[0]).toEqual(
      mirrored(CHARACTER_FRAMES.n.walk[0] ?? []),
    );
  });

  it("role remaps only target palette characters", () => {
    for (const [role, remap] of Object.entries(ROLE_REMAPS)) {
      for (const [from, to] of Object.entries(remap)) {
        expect(PALETTE[from], `${role} remap source ${from}`).toBeDefined();
        expect(PALETTE[to], `${role} remap target ${to}`).toBeDefined();
      }
    }
    const roles: CharacterRole[] = ["player", "enemy", "npc"];
    const base = CHARACTER_FRAMES.e.idle[0] ?? [];
    const recolored = roles.map((role) =>
      remapped(base, ROLE_REMAPS[role]).join("\n"),
    );
    expect(new Set(recolored).size).toBe(roles.length);
  });

  it("walk frames advance faster than idle frames", () => {
    expect(WALK_FRAME_MS).toBeLessThan(IDLE_FRAME_MS);
    const pose = { facing: "e" as const, moving: true, timeMs: WALK_FRAME_MS };
    expect(characterFrameIndex(pose, 4)).toBe(1);
    expect(
      characterFrameIndex({ ...pose, moving: false }, 2),
    ).toBe(frameAt(WALK_FRAME_MS, IDLE_FRAME_MS, 2));
  });
});
