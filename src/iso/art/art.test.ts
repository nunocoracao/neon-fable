import { describe, expect, it } from "vitest";
import { frameAt } from "../animation";
import { TILE_H, TILE_W, screenToTile, worldToScreen } from "../coords";
import {
  CHARACTER_FRAMES,
  ROLE_REMAPS,
  type CharacterRole,
} from "./characters";
import { INTERIOR_FLOOR_IDS, TRIM_EDGES } from "../tilemap";
import { INTERACTABLE_ART } from "./interactables";
import { PALETTE, TRANSPARENT } from "./palette";
import {
  ART_SCALE,
  DIAMOND_WIDTHS,
  LEGACY_DIAMOND_WIDTHS,
  gridErrors,
  mirrored,
  nativeScaled,
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
  it("every tile grid is a valid palette-indexed native 64×32 diamond", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      art.variants.forEach((frames, v) => {
        expect(frames.length, `${id} variant ${v} has frames`).toBeGreaterThan(0);
        frames.forEach((grid, f) => {
          expectValid(grid, `${id} variant ${v} frame ${f}`);
          expect(grid.length, `${id} v${v} f${f} height`).toBe(32);
          expect(grid[0]?.length, `${id} v${v} f${f} width`).toBe(64);
        });
      });
    }
  });

  it("tiles fill the 64×32 diamond mask exactly", () => {
    for (const id of Object.keys(TILE_ART) as (keyof typeof TILE_ART)[]) {
      TILE_ART[id].variants.forEach((frames, v) => {
        frames.forEach((grid, f) => {
          grid.forEach((row, r) => {
            const w = DIAMOND_WIDTHS[r] ?? 0;
            const pad = (64 - w) / 2;
            expect(row.length, `${id} v${v} f${f} row ${r}`).toBe(64);
            expect(
              row.slice(0, pad) + row.slice(pad + w),
              `${id} v${v} f${f} row ${r} exterior`,
            ).toBe(TRANSPARENT.repeat(2 * pad));
            expect(
              row.slice(pad, pad + w).includes(TRANSPARENT),
              `${id} v${v} f${f} row ${r} has holes`,
            ).toBe(false);
          });
        });
      });
    }
  });

  it("walkable floor types carry multiple texture variants", () => {
    expect(TILE_ART.pavement.variants.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART["pavement-cracked"].variants.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART["rust-floor"].variants.length).toBeGreaterThanOrEqual(3);
    expect(TILE_ART.road.variants.length).toBeGreaterThanOrEqual(3);
    for (const id of INTERIOR_FLOOR_IDS) {
      expect(TILE_ART[id].variants.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it("water and glow tiles animate", () => {
    for (const id of ["canal", "canal-deep"] as const) {
      const art = TILE_ART[id];
      expect(art.frameMs, `${id} frameMs`).toBeGreaterThan(0);
      expect(art.variants.length, `${id} variants`).toBeGreaterThanOrEqual(3);
      art.variants.forEach((frames, v) => {
        expect(frames.length, `${id} variant ${v} frames`).toBe(4);
        // Every frame must actually change pixels — a repeated frame
        // would read as a stutter in the ripple loop.
        const unique = new Set(frames.map((grid) => grid.join("\n")));
        expect(unique.size, `${id} variant ${v} distinct frames`).toBe(4);
      });
    }
    expect(TILE_ART["plaza-glow"].variants[0]?.length).toBeGreaterThanOrEqual(2);
  });

  it("open water carries neon reflection flecks; deep water stays darker", () => {
    const neon = /[ghjk]/;
    const openFrames = TILE_ART.canal.variants.flat();
    expect(openFrames.some((grid) => neon.test(grid.join("")))).toBe(true);
    // Deep water's resting surface is the dark ramp step, not the
    // open-water base.
    for (const frames of TILE_ART["canal-deep"].variants) {
      for (const grid of frames) {
        const counts = { d: 0, e: 0 };
        for (const row of grid) {
          for (const ch of row) {
            if (ch === "d") counts.d++;
            if (ch === "e") counts.e++;
          }
        }
        expect(counts.d).toBeGreaterThan(counts.e);
      }
    }
  });

  it("quay tiles are pavement with a lip only along their water edge", () => {
    const edges = [
      { id: "quay-n", upper: true },
      { id: "quay-e", upper: false },
      { id: "quay-s", upper: false },
      { id: "quay-w", upper: true },
    ] as const;
    for (const { id, upper } of edges) {
      const art = TILE_ART[id];
      expect(art.frameMs, `${id} static`).toBe(0);
      expect(art.variants.length, `${id} variants`).toBe(
        TILE_ART.pavement.variants.length,
      );
      art.variants.forEach((frames, v) => {
        const quay = frames[0] ?? [];
        const base = TILE_ART.pavement.variants[v]?.[0] ?? [];
        const touched = upper ? quay.slice(0, 16) : quay.slice(16);
        const untouched = upper ? quay.slice(16) : quay.slice(0, 16);
        const baseTouched = upper ? base.slice(0, 16) : base.slice(16);
        const baseUntouched = upper ? base.slice(16) : base.slice(0, 16);
        expect(untouched, `${id} v${v} dry half`).toEqual(baseUntouched);
        expect(touched, `${id} v${v} water half`).not.toEqual(baseTouched);
        // The lip cap and wet stain both appear on the water half.
        const strip = touched.join("");
        expect(strip.includes("S"), `${id} v${v} lip cap`).toBe(true);
        expect(strip.includes("Q"), `${id} v${v} wet stain`).toBe(true);
      });
    }
  });

  it("plaza glow pulses between a bright and a dimmed ring frame", () => {
    for (const [v, frames] of TILE_ART["plaza-glow"].variants.entries()) {
      expect(frames.length, `variant ${v} frames`).toBeGreaterThanOrEqual(2);
      const [bright, dim] = frames;
      expect(bright?.join("\n")).not.toEqual(dim?.join("\n"));
      expect(bright?.join("").includes("h"), `variant ${v} lit cap`).toBe(true);
      expect(dim?.join("").includes("i"), `variant ${v} dim ring`).toBe(true);
    }
  });

  it("interior floor materials are distinct per interior type", () => {
    const dominant = (id: (typeof INTERIOR_FLOOR_IDS)[number]): string => {
      const counts = new Map<string, number>();
      for (const row of TILE_ART[id].variants[0]?.[0] ?? []) {
        for (const ch of row) {
          if (ch !== TRANSPARENT) counts.set(ch, (counts.get(ch) ?? 0) + 1);
        }
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    };
    // Bar reads as warm wood, clinic as pale tile, office as dark fabric.
    expect(dominant("bar-floor")).toBe("b");
    expect(["7", "8"]).toContain(dominant("clinic-floor"));
    expect(dominant("office-floor")).toBe("W");
  });

  it("floor trims darken only their wall edge with a baseboard shadow", () => {
    for (const floor of INTERIOR_FLOOR_IDS) {
      for (const edge of TRIM_EDGES) {
        const id = `${floor}-${edge}` as const;
        const art = TILE_ART[id];
        const upper = edge === "n" || edge === "w";
        expect(art.frameMs, `${id} static`).toBe(0);
        expect(art.variants.length, `${id} variants`).toBe(
          TILE_ART[floor].variants.length,
        );
        art.variants.forEach((frames, v) => {
          const trimmed = frames[0] ?? [];
          const base = TILE_ART[floor].variants[v]?.[0] ?? [];
          const touched = upper ? trimmed.slice(0, 16) : trimmed.slice(16);
          const untouched = upper ? trimmed.slice(16) : trimmed.slice(0, 16);
          const baseTouched = upper ? base.slice(0, 16) : base.slice(16);
          const baseUntouched = upper ? base.slice(16) : base.slice(0, 16);
          expect(untouched, `${id} v${v} open half`).toEqual(baseUntouched);
          expect(touched, `${id} v${v} wall half`).not.toEqual(baseTouched);
          expect(touched.join("").includes("1"), `${id} v${v} ink line`).toBe(
            true,
          );
        });
      }
    }
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

  it("nativeScaled brings every registered tile to valid 64×32", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      const grid = art.variants[0]?.[0] ?? [];
      const scaled = nativeScaled(grid);
      expect(gridErrors([...scaled]), id).toEqual([]);
      expect(scaled.length, id).toBe(32);
      expect(scaled[0]?.length, id).toBe(64);
      if (grid.length === 32) {
        expect(scaled, `${id} native grid passes through`).toBe(grid);
      } else {
        expect(scaled, `${id} legacy grid doubles`).toEqual(upscaled(grid));
      }
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
    for (const id of [
      "streetlight",
      "holo-sign",
      "neon-sign",
      "holo-billboard",
      "shop-sign",
    ] as const) {
      const art = PROP_ART[id];
      expect(art.flicker).toBe(true);
      expect(art.frames.length).toBeGreaterThanOrEqual(2);
      expect(art.frames[art.frames.length - 1]).not.toEqual(art.frames[0]);
    }
  });
});

const STREET_FURNITURE = [
  "streetlight",
  "vent-stack",
  "crate",
  "barrier",
  "hydrant",
  "trash-heap",
  "cable-bundle",
] as const;

describe("street furniture (native hi-res)", () => {
  it("is marked native and fits the v2 prop envelope", () => {
    for (const id of STREET_FURNITURE) {
      const art = PROP_ART[id];
      expect(art.native, id).toBe(true);
      const grid = art.frames[0] ?? [];
      expect(grid[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(grid.length, `${id} height`).toBeLessThanOrEqual(96);
    }
    // The building still rides the legacy shim until its own
    // re-authoring pass.
    expect(PROP_ART.building.native).toBe(false);
  });

  it("anchors ground contact inside the tile's own lower half", () => {
    // At most a half tile (16 rows) may hang below the anchor, so a
    // prop never paints past its tile's bottom vertex: entities on the
    // tile in front sort later and always cover it cleanly.
    for (const id of STREET_FURNITURE) {
      const art = PROP_ART[id];
      const height = art.frames[0]?.length ?? 0;
      expect(art.anchorY, id).toBeLessThan(height);
      expect(height - 1 - art.anchorY, `${id} rows below anchor`).toBeLessThanOrEqual(16);
    }
  });

  it("grounds every piece with a soft z shadow", () => {
    for (const id of STREET_FURNITURE) {
      const grid = PROP_ART[id].frames[0] ?? [];
      expect(grid.join("").includes("z"), id).toBe(true);
    }
  });

  it("emissive props cast their own light", () => {
    // The streetlight pools cyan light on the pavement around its base
    // while lit, and drops the pool in the flicker-dropout frame.
    const art = PROP_ART.streetlight;
    const litPool = (art.frames[0] ?? []).slice(art.anchorY + 1).join("");
    expect(litPool.includes("g")).toBe(true);
    expect(litPool.includes("i")).toBe(true);
    const deadPool = (art.frames[art.frames.length - 1] ?? [])
      .slice(art.anchorY + 1)
      .join("");
    expect(deadPool.includes("g")).toBe(false);
    expect(deadPool.includes("i")).toBe(false);
    // The vent stack glows amber through its grille and wall slits.
    const vent = (PROP_ART["vent-stack"].frames[0] ?? []).join("");
    expect(vent.includes("m")).toBe(true);
    expect(vent.includes("o")).toBe(true);
  });

  it("idle loops animate through distinct frames at a real cadence", () => {
    const looping = ["vent-stack", "barrier", "hydrant", "cable-bundle"] as const;
    for (const id of looping) {
      const art = PROP_ART[id];
      expect(art.frameMs, id).toBeGreaterThan(0);
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, id).toBe(art.frames.length);
    }
    // The steam wisps actually drift: the 7/8 steam pixels occupy a
    // different layout in every vent frame.
    const steam = PROP_ART["vent-stack"].frames.map((grid) =>
      grid
        .map((row) => [...row].map((ch) => ("78".includes(ch) ? "x" : ".")).join(""))
        .join("\n"),
    );
    expect(new Set(steam).size).toBe(PROP_ART["vent-stack"].frames.length);
  });
});

const SIGNAGE = ["neon-sign", "holo-sign", "holo-billboard", "shop-sign"] as const;
const HOLO_SIGNAGE = ["holo-sign", "holo-billboard"] as const;

/** True if any core-char pixel touches (8-neighborhood) a halo char. */
function hasHaloRing(grid: PixelGrid, cores: string, halos: string): boolean {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y] ?? "";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === undefined || !cores.includes(ch)) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = grid[y + dy]?.[x + dx];
          if (n !== undefined && halos.includes(n)) return true;
        }
      }
    }
  }
  return false;
}

describe("signage (native hi-res)", () => {
  it("is native, fits the prop envelope, and grounds with a soft shadow", () => {
    for (const id of SIGNAGE) {
      const art = PROP_ART[id];
      expect(art.native, id).toBe(true);
      const grid = art.frames[0] ?? [];
      expect(grid[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(grid.length, `${id} height`).toBeLessThanOrEqual(96);
      expect(grid.join("").includes("z"), `${id} shadow`).toBe(true);
      expect(art.anchorY, id).toBeLessThan(grid.length);
      expect(grid.length - 1 - art.anchorY, `${id} rows below anchor`).toBeLessThanOrEqual(16);
    }
  });

  it("loops 2-3 distinct shimmer frames before the flicker dropout", () => {
    for (const id of SIGNAGE) {
      const art = PROP_ART[id];
      expect(art.flicker, id).toBe(true);
      expect(art.frameMs, id).toBeGreaterThan(0);
      const loop = art.frames.length - 1;
      expect(loop, `${id} loop frames`).toBeGreaterThanOrEqual(2);
      expect(loop, `${id} loop frames`).toBeLessThanOrEqual(3);
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(art.frames.length);
    }
  });

  it("neon glyphs run a bright core inside a dim halo ring, dead on dropout", () => {
    const neon = [
      { id: "neon-sign", cores: "jk", halo: "l", lit: /[jkgh]/ },
      { id: "shop-sign", cores: "mn", halo: "o", lit: /[mn]/ },
    ] as const;
    for (const { id, cores, halo, lit } of neon) {
      const art = PROP_ART[id];
      expect(hasHaloRing(art.frames[0] ?? [], cores, halo), `${id} halo`).toBe(
        true,
      );
      const dead = (art.frames[art.frames.length - 1] ?? []).join("");
      expect(lit.test(dead), `${id} dropout still lit`).toBe(false);
    }
  });

  it("holograms read translucent through dithering and glitch a slipped slice", () => {
    for (const id of HOLO_SIGNAGE) {
      const art = PROP_ART[id];
      const base = art.frames[0] ?? [];
      const joined = base.join("\n");
      // The projection body is the hologram-blue ramp, checker-dithered
      // so the scene shows through between pixels.
      expect(/[stu]/.test(joined), `${id} holo ramp`).toBe(true);
      expect(/t\.t/.test(joined), `${id} dither`).toBe(true);
      // Scanline shimmer moves between the loop frames.
      expect(art.frames[1]?.join("\n"), `${id} shimmer`).not.toEqual(joined);
      // The glitch frame slips a slice exactly one pixel right.
      const glitch = art.frames[art.frames.length - 2] ?? [];
      const slipped = base
        .map((row, y) => [row, glitch[y] ?? ""] as const)
        .filter(([a, b]) => a !== b);
      expect(slipped.length, `${id} glitch slice`).toBeGreaterThanOrEqual(2);
      for (const [a, b] of slipped) {
        expect(b, `${id} glitch shifts right`).toBe("." + a.slice(0, -1));
      }
      // Dropout kills the whole projection, not just the glyph.
      const dead = (art.frames[art.frames.length - 1] ?? []).join("");
      expect(/[stu]/.test(dead), `${id} dead projection`).toBe(false);
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
