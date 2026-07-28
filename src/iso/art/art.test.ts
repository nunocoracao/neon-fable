import { describe, expect, it } from "vitest";
import { frameAt } from "../animation";
import { TILE_H, TILE_W, screenToTile, worldToScreen } from "../coords";
import {
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERACTABLE_ART } from "./interactables";
import { PALETTE, TRANSPARENT } from "./palette";
import {
  ART_SCALE,
  DIAMOND_WIDTHS,
  LEGACY_DIAMOND_WIDTHS,
  gridErrors,
  mirrored,
  remapped,
  upscaled,
  type PixelGrid,
} from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART } from "./tiles";
import { IDLE_FRAME_MS, WALK_FRAME_MS, characterFrameIndex } from "./provider";

function expectValid(grid: PixelGrid, label: string): void {
  expect(gridErrors(grid), label).toEqual([]);
}

describe("palette", () => {
  it("stays a disciplined curated set (v2: ~56 entries; details in palette.test)", () => {
    const colors = Object.values(PALETTE);
    expect(colors.length).toBeGreaterThanOrEqual(16);
    expect(colors.length).toBeLessThanOrEqual(64);
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

  it("diamond widths follow the 64×32 v2 mask formula", () => {
    expect(DIAMOND_WIDTHS.length).toBe(32);
    expect([...DIAMOND_WIDTHS].reverse()).toEqual([...DIAMOND_WIDTHS]);
    DIAMOND_WIDTHS.forEach((width, r) => {
      expect(width).toBe(4 * Math.min(r, 31 - r) + 2);
    });
    expect(LEGACY_DIAMOND_WIDTHS.length).toBe(16);
  });
});

/** Art columns of tile bbox row r the diamond mask claims, per DIAMOND_WIDTHS. */
function maskOwns(c: number, r: number): boolean {
  const width = DIAMOND_WIDTHS[r] ?? 0;
  const pad = (DIAMOND_WIDTHS.length * 2 - width) / 2;
  return c >= pad && c < pad + width;
}

describe("diamond mask vs screenToTile", () => {
  const artW = DIAMOND_WIDTHS.length * 2; // 64
  const artH = DIAMOND_WIDTHS.length; // 32

  /** Screen-space center of art pixel (c, r) of the tile at (sx, sy). */
  function pixelCenter(
    tileSx: number,
    tileSy: number,
    c: number,
    r: number,
  ): { sx: number; sy: number } {
    return {
      sx: tileSx - TILE_W / 2 + (c + 0.5) * ART_SCALE,
      sy: tileSy - TILE_H / 2 + (r + 0.5) * ART_SCALE,
    };
  }

  it("owns exactly the bbox pixels screenToTile assigns to the tile", () => {
    // Walk every 1x art pixel of tile (0, 0)'s bounding box and sample
    // screenToTile at the center of that pixel's on-screen block.
    for (let r = 0; r < artH; r++) {
      for (let c = 0; c < artW; c++) {
        const { sx, sy } = pixelCenter(0, 0, c, r);
        const tile = screenToTile(sx, sy);
        const owned = tile.x === 0 && tile.y === 0;
        expect(owned, `pixel (${c}, ${r})`).toBe(maskOwns(c, r));
      }
    }
  });

  it("adjacent tiles tessellate with no gaps and no overlap", () => {
    // Stamp the mask of a 3×3 block of tiles onto the shared art-pixel
    // lattice; no pixel may be claimed twice, and every pixel of the
    // center tile's bbox must be claimed by the tile screenToTile says
    // owns it.
    const claims = new Map<string, string>();
    for (let ty = -1; ty <= 1; ty++) {
      for (let tx = -1; tx <= 1; tx++) {
        const center = worldToScreen(tx, ty);
        for (let r = 0; r < artH; r++) {
          for (let c = 0; c < artW; c++) {
            if (!maskOwns(c, r)) continue;
            const { sx, sy } = pixelCenter(center.sx, center.sy, c, r);
            const key = `${sx},${sy}`;
            expect(claims.get(key), `pixel ${key} claimed twice`).toBeUndefined();
            claims.set(key, `${tx},${ty}`);
          }
        }
      }
    }
    for (let r = 0; r < artH; r++) {
      for (let c = 0; c < artW; c++) {
        const { sx, sy } = pixelCenter(0, 0, c, r);
        const owner = screenToTile(sx, sy);
        expect(claims.get(`${sx},${sy}`), `pixel (${c}, ${r})`).toBe(
          `${owner.x},${owner.y}`,
        );
      }
    }
  });
});

describe("upscaled", () => {
  it("doubles both dimensions with nearest-neighbor 2×2 blocks", () => {
    const grid = ["ab", ".c"];
    expect(upscaled(grid)).toEqual(["aabb", "aabb", "..cc", "..cc"]);
  });

  it("returns an empty grid unchanged", () => {
    expect(upscaled([])).toEqual([]);
  });

  it("keeps upscaled art valid and exactly doubles every registered tile", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      const grid = art.variants[0]?.[0] ?? [];
      const doubled = upscaled(grid);
      expect(gridErrors(doubled), id).toEqual([]);
      expect(doubled.length, id).toBe(grid.length * 2);
      expect(doubled[0]?.length, id).toBe((grid[0]?.length ?? 0) * 2);
    }
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
