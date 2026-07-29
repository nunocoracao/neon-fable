import { describe, expect, it } from "vitest";
import { TILE_H, TILE_W, screenToTile, worldToScreen } from "../coords";
import { INTERIOR_FLOOR_IDS, TRIM_EDGES } from "../tilemap";
import { INTERACTABLE_ART } from "./interactables";
import { PALETTE, TRANSPARENT } from "./palette";
import {
  ART_SCALE,
  DIAMOND_WIDTHS,
  gridErrors,
  remapped,
  type PixelGrid,
} from "./pixel";
import { PROP_ART } from "./props";
import { TILE_ART, puddleGrid } from "./tiles";
import {
  RAIN_STREAK_ART,
  SPLASH_ANCHOR_X,
  SPLASH_ANCHOR_Y,
  SPLASH_ART,
  streakSlant,
} from "./weather";

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

/**
 * Every registered tile grid, flattened and labelled — dry variants and
 * the rain variants alike, so a puddled tile is held to exactly the same
 * standard as the ground it was derived from.
 */
function allTileGrids(): ReadonlyArray<{ label: string; grid: PixelGrid }> {
  const grids: Array<{ label: string; grid: PixelGrid }> = [];
  for (const [id, art] of Object.entries(TILE_ART)) {
    const sets: ReadonlyArray<[string, readonly PixelGrid[][]]> = art.wet
      ? [
          ["dry", art.variants],
          ["wet", art.wet],
        ]
      : [["dry", art.variants]];
    for (const [kind, variants] of sets) {
      variants.forEach((frames, v) => {
        expect(frames.length, `${id} ${kind} variant ${v} has frames`)
          .toBeGreaterThan(0);
        frames.forEach((grid, f) => {
          grids.push({ label: `${id} ${kind} v${v} f${f}`, grid });
        });
      });
    }
  }
  return grids;
}

describe("tile art", () => {
  it("every tile grid is a valid palette-indexed native 64×32 diamond", () => {
    for (const { label, grid } of allTileGrids()) {
      expectValid(grid, label);
      expect(grid.length, `${label} height`).toBe(32);
      expect(grid[0]?.length, `${label} width`).toBe(64);
    }
  });

  it("tiles fill the 64×32 diamond mask exactly", () => {
    for (const { label, grid } of allTileGrids()) {
      grid.forEach((row, r) => {
        const w = DIAMOND_WIDTHS[r] ?? 0;
        const pad = (64 - w) / 2;
        expect(row.length, `${label} row ${r}`).toBe(64);
        expect(
          row.slice(0, pad) + row.slice(pad + w),
          `${label} row ${r} exterior`,
        ).toBe(TRANSPARENT.repeat(2 * pad));
        expect(
          row.slice(pad, pad + w).includes(TRANSPARENT),
          `${label} row ${r} has holes`,
        ).toBe(false);
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
  it("fits the v2 prop envelope", () => {
    for (const id of STREET_FURNITURE) {
      const art = PROP_ART[id];
      const grid = art.frames[0] ?? [];
      expect(grid[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(grid.length, `${id} height`).toBeLessThanOrEqual(96);
    }
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

describe("building (native hi-res)", () => {
  const art = PROP_ART.building;
  const base = art.frames[0] ?? [];

  it("fills the full-tile envelope with ground contact on the diamond center", () => {
    expect(base[0]?.length).toBe(64);
    expect(base.length).toBeLessThanOrEqual(96);
    expect(art.anchorX).toBe(32);
    // At most a half tile may hang below the anchor so entities on the
    // tile in front always cover the base cleanly.
    expect(base.length - 1 - art.anchorY).toBeLessThanOrEqual(16);
  });

  it("keeps the lit west face lighter than the shaded south face", () => {
    const counts = { lit: 0, shade: 0 };
    for (const row of base.slice(32)) {
      for (let x = 1; x < 32; x++) if (row[x] === "3") counts.lit++;
      for (let x = 32; x < 63; x++) if (row[x] === "2") counts.shade++;
    }
    expect(counts.lit).toBeGreaterThan(100);
    expect(counts.shade).toBeGreaterThan(100);
  });

  it("carries lit windows and a magenta sign board, both swapping in the alt frame", () => {
    const joined = base.join("");
    // Cyan-lit and dead glass windows both appear on the walls.
    expect(joined).toMatch(/[gh]/);
    expect(joined).toMatch(/[fU]/);
    // The tenant-sign runes run magenta down the shaded face.
    expect(joined).toMatch(/[jk]/);
    // The alt frame trades lit/dead windows and shimmers the sign.
    const alt = art.frames[1] ?? [];
    expect(alt.join("\n")).not.toBe(base.join("\n"));
    expect(alt).toEqual(
      remapped(base, { g: "i", i: "g", h: "f", f: "h", j: "k", k: "j" }),
    );
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
  it("fits the prop envelope and grounds with a soft shadow", () => {
    for (const id of SIGNAGE) {
      const art = PROP_ART[id];
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

const INTERACTABLE_IDS = ["door", "terminal", "stash", "exit"] as const;

/**
 * The hit-flash/outline silhouette of a grid: every pixel bakeSilhouette
 * would paint (everything but transparency and the z ground shadow).
 */
function silhouette(grid: PixelGrid): string {
  return grid
    .map((row) =>
      [...row].map((ch) => (ch === TRANSPARENT || ch === "z" ? "." : "x")).join(""),
    )
    .join("\n");
}

describe("interactable art (native hi-res)", () => {
  it("registers every drawn sprite id as valid same-sized frames in the v2 envelope", () => {
    expect(Object.keys(INTERACTABLE_ART).sort()).toEqual(
      [...INTERACTABLE_IDS].sort(),
    );
    for (const id of INTERACTABLE_IDS) {
      const art = INTERACTABLE_ART[id];
      expect(art.frames.length, id).toBeGreaterThanOrEqual(2);
      expect(art.frameMs, id).toBeGreaterThan(0);
      const first = art.frames[0];
      art.frames.forEach((grid, f) => {
        expectValid(grid, `${id} frame ${f}`);
        expect(grid.length, `${id} frame ${f} height`).toBe(first?.length);
        expect(grid[0]?.length, `${id} frame ${f} width`).toBe(first?.[0]?.length);
      });
      expect(first?.[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(first?.length, `${id} height`).toBeLessThanOrEqual(96);
    }
  });

  it("anchors ground contact inside the grid and the tile's lower half", () => {
    for (const id of INTERACTABLE_IDS) {
      const art = INTERACTABLE_ART[id];
      const grid = art.frames[0] ?? [];
      expect(art.anchorX, id).toBeLessThan(grid[0]?.length ?? 0);
      expect(art.anchorY, id).toBeLessThan(grid.length);
      expect(
        grid.length - 1 - art.anchorY,
        `${id} rows below anchor`,
      ).toBeLessThanOrEqual(16);
    }
  });

  it("holds one silhouette across all frames so outlines and hit flashes stay stable", () => {
    for (const id of INTERACTABLE_IDS) {
      const frames = INTERACTABLE_ART[id].frames;
      const shape = silhouette(frames[0] ?? []);
      frames.forEach((grid, f) => {
        expect(silhouette(grid), `${id} frame ${f}`).toBe(shape);
      });
    }
  });

  it("keeps silhouettes clean: no isolated 1px specks", () => {
    for (const id of INTERACTABLE_IDS) {
      const grid = INTERACTABLE_ART[id].frames[0] ?? [];
      const opaque = (x: number, y: number): boolean => {
        const ch = grid[y]?.[x];
        return ch !== undefined && ch !== TRANSPARENT && ch !== "z";
      };
      grid.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (!opaque(x, y)) continue;
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if ((dx !== 0 || dy !== 0) && opaque(x + dx, y + dy)) neighbors++;
            }
          }
          expect(neighbors, `${id} pixel (${x}, ${y}) isolated`).toBeGreaterThan(0);
        }
      });
    }
  });

  it("standing sprites ground with a soft z shadow; the exit lies flat in its tile", () => {
    for (const id of ["door", "terminal", "stash"] as const) {
      expect(INTERACTABLE_ART[id].frames[0]?.join("").includes("z"), id).toBe(
        true,
      );
    }
    const exit = INTERACTABLE_ART.exit;
    const grid = exit.frames[0] ?? [];
    expect(grid.length).toBe(32);
    expect(grid[0]?.length).toBe(64);
    expect(grid.join("").includes("z")).toBe(false);
    expect(exit.anchorX).toBe(32);
    expect(exit.anchorY).toBe(16);
    // Ground art must stay inside its own diamond so tiles keep
    // tessellating cleanly around it.
    grid.forEach((row, r) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== TRANSPARENT) {
          expect(maskOwns(x, r), `exit pixel (${x}, ${r}) outside its tile`).toBe(
            true,
          );
        }
      }
    });
  });

  it("door status lamp and seam pulse bright to dim", () => {
    const [bright, dim] = INTERACTABLE_ART.door.frames;
    expect(bright?.join("")).toContain("h");
    expect(dim?.join("")).not.toContain("h");
    expect(dim).toEqual(remapped(bright ?? [], { h: "g", g: "i" }));
  });

  it("terminal scanline sweeps down the screen across three frames", () => {
    const frames = INTERACTABLE_ART.terminal.frames;
    expect(frames.length).toBe(3);
    const scanRows = frames.map((grid) =>
      grid.findIndex((row) => row.includes("h")),
    );
    expect(scanRows[0]).toBeGreaterThanOrEqual(0);
    expect(scanRows[1]).toBeGreaterThan(scanRows[0] ?? 0);
    expect(scanRows[2]).toBeGreaterThan(scanRows[1] ?? 0);
  });

  it("stash holds closed, then fires a brief latch glint", () => {
    const frames = INTERACTABLE_ART.stash.frames;
    const base = frames[0]?.join("\n") ?? "";
    frames.slice(0, -1).forEach((grid, f) => {
      expect(grid.join("\n"), `frame ${f} holds closed`).toBe(base);
    });
    const glint = frames[frames.length - 1]?.join("\n") ?? "";
    expect(glint).not.toBe(base);
    expect(base).not.toContain("9");
    expect(glint).toContain("9");
  });

  it("exit strip lights march through three distinct frames", () => {
    const frames = INTERACTABLE_ART.exit.frames;
    expect(frames.length).toBe(3);
    expect(new Set(frames.map((g) => g.join("\n"))).size).toBe(3);
  });
});

describe("glow registrations", () => {
  const registered = [
    ...Object.entries(PROP_ART).map(([id, art]) => ({ id: `prop ${id}`, art })),
    ...Object.entries(INTERACTABLE_ART).map(([id, art]) => ({
      id: `interactable ${id}`,
      art,
    })),
    ...Object.entries(TILE_ART).map(([id, art]) => ({ id: `tile ${id}`, art })),
  ] as ReadonlyArray<{
    id: string;
    art: { glow?: readonly import("./glow").GlowSource[] };
  }>;

  it("every glow source uses a hex palette color and sane geometry", () => {
    for (const { id, art } of registered) {
      for (const source of art.glow ?? []) {
        const hex = PALETTE[source.color];
        expect(hex, `${id} glow color "${source.color}"`).toBeDefined();
        expect(hex?.startsWith("#"), `${id} glow color hex`).toBe(true);
        expect(source.radius, `${id} glow radius`).toBeGreaterThan(0);
        expect(source.radius, `${id} glow radius`).toBeLessThanOrEqual(48);
        expect(Number.isInteger(source.radius), `${id} radius integer`).toBe(true);
        expect(source.intensity, `${id} glow intensity`).toBeGreaterThan(0);
        expect(source.intensity, `${id} glow intensity`).toBeLessThanOrEqual(1);
        expect(Math.abs(source.offsetX), `${id} glow offsetX`).toBeLessThanOrEqual(96);
        expect(Math.abs(source.offsetY), `${id} glow offsetY`).toBeLessThanOrEqual(96);
      }
    }
  });

  it("the street's signage and lighting all cast glow", () => {
    for (const id of [
      "streetlight",
      "neon-sign",
      "shop-sign",
      "holo-sign",
      "holo-billboard",
    ] as const) {
      expect(PROP_ART[id].glow?.length, id).toBeGreaterThan(0);
    }
  });

  it("only water tiles opt into reflections", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      const isWater = id === "canal" || id === "canal-deep";
      expect(art.reflective === true, `tile ${id}`).toBe(isWater);
    }
  });
});

describe("weather art", () => {
  const RAINABLE_TILES = new Set([
    "pavement",
    "pavement-cracked",
    "road",
    "quay-n",
    "quay-e",
    "quay-s",
    "quay-w",
    "rust-floor",
  ]);

  it("only open outdoor ground registers rain variants", () => {
    // The canal is already water, foundations are wall bases, and no
    // interior floor is under the sky.
    for (const [id, art] of Object.entries(TILE_ART)) {
      expect(art.wet !== undefined, `tile ${id}`).toBe(RAINABLE_TILES.has(id));
    }
  });

  it("rain variants stay parallel to the dry ones, frame for frame", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      if (!art.wet) continue;
      expect(art.wet.length, `${id} variant count`).toBe(art.variants.length);
      art.wet.forEach((frames, v) => {
        expect(frames.length, `${id} v${v} frame count`).toBe(
          art.variants[v]?.length,
        );
      });
    }
  });

  it("every puddle actually changes the ground it pools on", () => {
    for (const [id, art] of Object.entries(TILE_ART)) {
      if (!art.wet) continue;
      art.wet.forEach((frames, v) => {
        frames.forEach((grid, f) => {
          const dry = art.variants[v]?.[f] ?? [];
          expect(grid.join("\n"), `${id} v${v} f${f}`).not.toBe(dry.join("\n"));
        });
      });
    }
  });

  it("puddles differ between tile kinds and between variants", () => {
    const shapes = new Set<string>();
    for (const art of Object.values(TILE_ART)) {
      for (const frames of art.wet ?? []) {
        for (const grid of frames) shapes.add(grid.join("\n"));
      }
    }
    const total = Object.values(TILE_ART).reduce(
      (n, art) => n + (art.wet ?? []).reduce((m, frames) => m + frames.length, 0),
      0,
    );
    expect(shapes.size).toBe(total);
  });

  it("puddleGrid is pure: the same source and seed give the same pool", () => {
    const base = TILE_ART.pavement.variants[0]?.[0] ?? [];
    expect(puddleGrid(base, 5)).toEqual(puddleGrid(base, 5));
    expect(puddleGrid(base, 5)).not.toEqual(puddleGrid(base, 6));
  });

  it("rain streak sprites are valid grids that lean one consistent way", () => {
    expect(RAIN_STREAK_ART.length).toBe(2);
    RAIN_STREAK_ART.forEach((grid, i) => {
      expectValid(grid, `rain streak ${i}`);
      expect(grid.length, `rain streak ${i} length`).toBeGreaterThan(4);
      // Streaks lean with the wind, all in the same direction, or the
      // two curtains would blow against each other.
      expect(streakSlant(grid), `rain streak ${i} slant`).toBeGreaterThan(0);
      expect(streakSlant(grid), `rain streak ${i} slant`).toBeLessThan(1);
    });
    // The near layer is the longer, more visible one.
    expect((RAIN_STREAK_ART[1] ?? []).length).toBeGreaterThan(
      (RAIN_STREAK_ART[0] ?? []).length,
    );
  });

  it("streakSlant reads the lean off the art, and nothing off an empty grid", () => {
    expect(streakSlant(["9..", ".9.", "..9"])).toBe(1);
    expect(streakSlant(["..9", ".9.", "9.."])).toBe(-1);
    expect(streakSlant(["9", "9", "9"])).toBe(0);
    expect(streakSlant([])).toBe(0);
    expect(streakSlant(["...", "..."])).toBe(0);
  });

  it("splash frames are valid, same-sized, and fade as the ripple opens", () => {
    expect(SPLASH_ART.length).toBeGreaterThanOrEqual(2);
    const width = SPLASH_ART[0]?.[0]?.length ?? 0;
    const height = SPLASH_ART[0]?.length ?? 0;
    SPLASH_ART.forEach((grid, i) => {
      expectValid(grid, `splash ${i}`);
      expect(grid.length, `splash ${i} height`).toBe(height);
      expect(grid[0]?.length, `splash ${i} width`).toBe(width);
      expect(
        grid.some((row) => row.includes(TRANSPARENT) === false || row.trim() !== ""),
        `splash ${i} paints something`,
      ).toBe(true);
    });
    // The anchor sits inside the frame: splashes land on tile centers.
    expect(SPLASH_ANCHOR_X).toBeLessThan(width);
    expect(SPLASH_ANCHOR_Y).toBeLessThan(height);
    // Each frame is drawn a step dimmer than the last (9 -> 8 -> 7).
    const inks = SPLASH_ART.map(
      (grid) => [...grid.join("")].filter((ch) => ch !== TRANSPARENT)[0] ?? "",
    );
    expect(inks).toEqual([...inks].sort().reverse());
  });
});

