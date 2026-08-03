import { describe, expect, it } from "vitest";
import { TILE_H, TILE_W, screenToTile, worldToScreen } from "../coords";
import { INTERIOR_FLOOR_IDS, TRIM_EDGES } from "../tilemap";
import {
  ACTION_ICON_ART,
  ACTION_ICON_IDS,
  ACTION_ICON_SIZE,
} from "./actionIcons";
import {
  INTERACTABLE_ART,
  hasOpeningArt,
  openingFrames,
} from "./interactables";
import { PALETTE, TRANSPARENT } from "./palette";
import {
  ART_SCALE,
  DIAMOND_WIDTHS,
  gridErrors,
  remapped,
  silhouetteGrid,
  type PixelGrid,
} from "./pixel";
import { PROP_ART, isoBox, isoSlab } from "./props";
import { SETPIECE_ART } from "./setpieces";
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

/**
 * Market dressing. The Vertical Market's stall furniture is held to the
 * same envelope as the rest of the street, with one deliberate
 * exception encoded here: the cage lamp hangs off the scaffolding and
 * never touches the boards, so it grounds with a pool of light instead
 * of a shadow.
 */
const MARKET_FURNITURE = [
  "stall-awning",
  "cage-lamp",
  "crate-stack",
  "noodle-counter",
] as const;

describe("market furniture (native hi-res)", () => {
  it("fits the v2 prop envelope and anchors inside the tile's lower half", () => {
    for (const id of MARKET_FURNITURE) {
      const art = PROP_ART[id];
      const grid = art.frames[0] ?? [];
      expect(grid[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(grid.length, `${id} height`).toBeLessThanOrEqual(96);
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(grid[0]?.length ?? 0);
      expect(art.anchorY, `${id} anchorY`).toBeLessThan(grid.length);
      expect(
        grid.length - 1 - art.anchorY,
        `${id} rows below anchor`,
      ).toBeLessThanOrEqual(16);
    }
  });

  it("grounds what stands on the boards, and lights what hangs over them", () => {
    for (const id of ["stall-awning", "crate-stack", "noodle-counter"] as const) {
      expect(PROP_ART[id].frames[0]?.join("").includes("z"), id).toBe(true);
    }
    // The cage lamp is strung from the scaffold: no contact, no shadow.
    const lamp = PROP_ART["cage-lamp"];
    const lit = lamp.frames[0] ?? [];
    expect(lit.join("").includes("z")).toBe(false);
    // What it does put on the ground is its own pooled light, and the
    // flicker dropout takes the pool with the bulb.
    const pool = (grid: PixelGrid): string => grid.slice(lamp.anchorY - 3).join("");
    expect(pool(lit)).toMatch(/[mno]/);
    expect(pool(lamp.frames[lamp.frames.length - 1] ?? [])).not.toMatch(/[mno]/);
  });

  it("burns amber over the aisles, and leaves the freight unlit", () => {
    for (const id of ["stall-awning", "cage-lamp", "noodle-counter"] as const) {
      const glow = PROP_ART[id].glow ?? [];
      expect(glow.length, `${id} glow`).toBeGreaterThan(0);
      for (const source of glow) {
        expect(source.color, `${id} glow color`).toBe("m");
      }
    }
    expect(PROP_ART["crate-stack"].glow).toBeUndefined();
  });

  it("loops the working stalls and holds the freight still", () => {
    for (const id of ["stall-awning", "cage-lamp", "noodle-counter"] as const) {
      const art = PROP_ART[id];
      expect(art.frameMs, id).toBeGreaterThan(0);
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(art.frames.length);
    }
    const stack = PROP_ART["crate-stack"];
    expect(stack.frameMs).toBe(0);
    expect(stack.frames).toHaveLength(1);
    // The counter's steam actually drifts between frames.
    const steam = PROP_ART["noodle-counter"].frames.map((grid) =>
      grid
        .slice(0, 16)
        .map((row) => [...row].map((ch) => ("78".includes(ch) ? "x" : ".")).join(""))
        .join("\n"),
    );
    expect(new Set(steam).size).toBe(PROP_ART["noodle-counter"].frames.length);
  });
});

/**
 * Corp tower dressing. The Auric Spire's furniture is held to the same
 * envelope as the street's, and to two rules of its own: it is lit in
 * the tower's palette (chrome, glass, hologram blue) rather than the
 * street's neon, and the pieces that carry light carry it steadily —
 * nothing in this building flickers.
 */
const CORP_FURNITURE = [
  "glass-partition-x",
  "glass-partition-y",
  "reception-desk",
  "server-column",
  "planter-column",
  "exec-desk",
] as const;

describe("corp tower furniture (native hi-res)", () => {
  it("fits the v2 prop envelope and anchors inside the tile's lower half", () => {
    for (const id of CORP_FURNITURE) {
      const art = PROP_ART[id];
      const grid = art.frames[0] ?? [];
      expect(grid[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(grid.length, `${id} height`).toBeLessThanOrEqual(96);
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(grid[0]?.length ?? 0);
      expect(art.anchorY, `${id} anchorY`).toBeLessThan(grid.length);
      expect(
        grid.length - 1 - art.anchorY,
        `${id} rows below anchor`,
      ).toBeLessThanOrEqual(16);
    }
  });

  it("grounds every piece with a soft z shadow", () => {
    for (const id of CORP_FURNITURE) {
      expect(PROP_ART[id].frames[0]?.join("").includes("z"), id).toBe(true);
    }
  });

  it("lights the tower in its own colors, and never flickers", () => {
    for (const id of CORP_FURNITURE) {
      expect(PROP_ART[id].flicker, `${id} flickers`).toBe(false);
    }
    // What glows here glows in hologram blue (signage, ledger panes) or
    // status cyan (the service column) — never the street's magenta or
    // amber, which is what makes the interiors read as another world.
    for (const id of ["reception-desk", "server-column", "exec-desk"] as const) {
      const glow = PROP_ART[id].glow ?? [];
      expect(glow.length, `${id} glow`).toBeGreaterThan(0);
      for (const source of glow) {
        expect(["t", "g"], `${id} glow color`).toContain(source.color);
      }
    }
    // The glazing and the planter are lit by the room, not by themselves.
    expect(PROP_ART["glass-partition-x"].glow).toBeUndefined();
    expect(PROP_ART["glass-partition-y"].glow).toBeUndefined();
    expect(PROP_ART["planter-column"].glow).toBeUndefined();
  });

  it("glazes with a slanted pane that follows the iso grid", () => {
    // The partition is a wall segment, so its head has to lie along an
    // iso axis: one row of drop for every two columns across, which is
    // the tile diamond's own slope.
    const grid = PROP_ART["glass-partition-x"].frames[0] ?? [];
    const topAt = (column: number): number =>
      grid.findIndex((row) => (row[column] ?? ".") !== ".");
    expect(topAt(4)).toBe(2);
    expect(topAt(32)).toBe(16);
    expect(topAt(60)).toBe(30);
    // The y pane is that pane turned onto the other axis: mirrored art,
    // and an anchor mirrored with it, so a run stands on its own tiles.
    const turned = PROP_ART["glass-partition-y"];
    expect(turned.frames[0]).toEqual(
      (PROP_ART["glass-partition-x"].frames[0] ?? []).map((row) =>
        [...row].reverse().join(""),
      ),
    );
    expect(turned.anchorX).toBe(
      (grid[0]?.length ?? 0) - 1 - PROP_ART["glass-partition-x"].anchorX,
    );
    // And it is glass: the pane is woven from the glass ramp.
    const body = grid.join("");
    expect(body.includes("U")).toBe(true);
    expect(body.includes("f")).toBe(true);
  });

  it("keeps the working pieces looping and the still ones still", () => {
    for (const id of ["reception-desk", "server-column", "exec-desk"] as const) {
      const art = PROP_ART[id];
      expect(art.frameMs, id).toBeGreaterThan(0);
      const unique = new Set(art.frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(art.frames.length);
    }
    for (const id of [
      "glass-partition-x",
      "glass-partition-y",
      "planter-column",
    ] as const) {
      expect(PROP_ART[id].frameMs, id).toBe(0);
      expect(PROP_ART[id].frames, id).toHaveLength(1);
    }
  });
});

describe("isoBox", () => {
  const INK = { top: "b", rim: "c", left: "4", right: "3", ink: "1" };

  it("is a lid diamond over a wall, w wide and w/2 + wallH tall", () => {
    const box = isoBox(16, 6, INK);
    expect(box).toHaveLength(16 / 2 + 6);
    for (const row of box) expect(row.length).toBe(16);
    expectValid(box, "isoBox(16, 6)");
    // The lid's first row is the diamond's 4px tip, centered: ink, the
    // lit rim, the far rim's darker step, ink.
    expect(box[0]).toBe("......1c41......");
  });

  it("puts the footprint's center — the tile contact point — on one row", () => {
    // The point that lands on the tile diamond's center is the widest
    // row of the *lower* diamond: wallH + w/4.
    const w = 16;
    const wallH = 6;
    const box = isoBox(w, wallH, INK);
    const solid = box.map((row) => row.replaceAll(".", "").length);
    expect(solid[wallH + w / 4]).toBe(w);
  });

  it("lights the left face and shades the right, ringed in ink", () => {
    const box = isoBox(16, 6, INK);
    const wall = box[10] ?? "";
    expect(wall.startsWith("1")).toBe(true);
    expect(wall.endsWith("1")).toBe(true);
    expect(wall.slice(1, 8)).toBe("4".repeat(7));
    expect(wall.slice(8, 15)).toBe("3".repeat(7));
  });

  it("runs seams across the top face only when asked for grain", () => {
    const plain = isoBox(24, 8, INK).join("");
    const grained = isoBox(24, 8, { ...INK, grain: "a" }).join("");
    expect(plain).not.toContain("a");
    expect(grained).toContain("a");
    // Grain is a top-face treatment: the walls are untouched by it.
    expect(grained.replaceAll("a", "b")).toBe(plain);
  });
});

describe("isoSlab", () => {
  const INK = { top: "b", rim: "c", left: "4", right: "3", ink: "1" };

  it("sizes itself to the footprint's parallelogram plus the wall", () => {
    for (const [wx, wy, wallH] of [
      [1, 1, 6],
      [3, 2, 18],
      [2, 4, 10],
    ] as const) {
      const slab = isoSlab(wx, wy, wallH, INK);
      expectValid(slab.grid, `isoSlab(${wx}, ${wy}, ${wallH})`);
      expect(slab.grid[0]?.length, "width").toBe(32 * (wx + wy));
      expect(slab.grid.length, "height").toBe(16 * (wx + wy) + wallH + 1);
      // Anchored on the near tile, with the same half tile below the
      // anchor every other prop is held to.
      expect(slab.anchorX).toBe(32 * wx);
      expect(slab.grid.length - 1 - slab.anchorY).toBe(16);
    }
  });

  it("covers every tile of the footprint and nothing beyond it", () => {
    const wx = 3;
    const wy = 2;
    const slab = isoSlab(wx, wy, 12, INK);
    const solidAt = (px: number, py: number): boolean => {
      const row = slab.grid[Math.round(py + slab.anchorY)];
      return (row?.[Math.round(px + slab.anchorX)] ?? ".") !== ".";
    };
    for (let i = 0; i < wx; i++) {
      for (let j = 0; j < wy; j++) {
        // Each covered tile's diamond center, relative to the near tile.
        const px = 32 * (i - (wx - 1)) - 32 * (j - (wy - 1));
        const py = 16 * (i - (wx - 1)) + 16 * (j - (wy - 1));
        expect(solidAt(px, py), `tile (${i}, ${j})`).toBe(true);
      }
    }
    // One tile further along either axis is off the slab entirely.
    expect(solidAt(32 * 1 - 0, 16 * 1), "past the near corner").toBe(false);
    expect(solidAt(-32 * wx - 16, -16 * wx), "past the far bow").toBe(false);
  });

  it("lights the deck's near rim and shades the wall it hangs over", () => {
    const slab = isoSlab(2, 2, 10, INK);
    const painted = slab.grid.join("");
    expect(painted).toContain("c");
    expect(painted).toContain("4");
    expect(painted).toContain("3");
    // Grain is a deck treatment, exactly as it is on isoBox.
    const grained = isoSlab(2, 2, 10, { ...INK, grain: "a" });
    expect(grained.grid.join("")).toContain("a");
    expect(grained.grid.join("").replaceAll("a", "b")).toBe(painted);
  });
});

/**
 * Quayside dressing. The Flooded Quays' furniture, held to the street's
 * envelope with one deliberate exception encoded here: the sunken barge
 * is a set piece whose bulk lies across six tiles, so it is allowed to
 * be as wide as its footprint — and it grounds in water, not on a
 * shadow, because it is floating.
 */
const QUAY_FURNITURE = ["mooring-post", "salvage-tarp"] as const;

describe("quayside furniture (native hi-res)", () => {
  it("fits the v2 prop envelope and anchors inside the tile's lower half", () => {
    for (const id of QUAY_FURNITURE) {
      const art = PROP_ART[id];
      const grid = art.frames[0] ?? [];
      expect(grid[0]?.length, `${id} width`).toBeLessThanOrEqual(64);
      expect(grid.length, `${id} height`).toBeLessThanOrEqual(96);
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(grid[0]?.length ?? 0);
      expect(
        grid.length - 1 - art.anchorY,
        `${id} rows below anchor`,
      ).toBeLessThanOrEqual(16);
    }
  });

  it("grounds what stands on the boards with a soft z shadow", () => {
    for (const id of QUAY_FURNITURE) {
      expect(PROP_ART[id].frames[0]?.join("").includes("z"), id).toBe(true);
    }
    // Both are unlit dockside clutter: no glow, no loop.
    for (const id of QUAY_FURNITURE) {
      expect(PROP_ART[id].glow, `${id} glow`).toBeUndefined();
      expect(PROP_ART[id].frameMs, `${id} cadence`).toBe(0);
    }
  });

  it("rusts the bollard at the waterline and ropes it off", () => {
    const post = PROP_ART["mooring-post"].frames[0] ?? [];
    // Chrome cap, rust bleed down the shaft, rope wrapped round it, and
    // a concrete pad under the lot.
    expect(post.join("")).toContain("9");
    expect(post.join("")).toContain("a");
    expect(post.join("")).toContain("c");
    expect(post.join("")).toContain("R");
  });

  it("lashes the salvage under hazard webbing", () => {
    const tarp = (PROP_ART["salvage-tarp"].frames[0] ?? []).join("");
    // Dark fabric over the pile, hazard strapping across it.
    expect(tarp).toContain("W");
    expect(tarp).toContain("Z");
  });
});

describe("the sunken barge (a set piece across six tiles)", () => {
  const art = PROP_ART["sunken-barge"];
  const frames = art.frames;
  const base = frames[0] ?? [];

  it("is sized and anchored to the hull's own footprint", () => {
    // Three tiles of hull by two, so 32 * (3 + 2) art pixels across —
    // deliberately wider than the single-tile envelope, and anchored on
    // the near tile so painter's order still sorts it correctly.
    expect(base[0]?.length).toBe(160);
    expect(art.anchorX).toBe(96);
    expect(base.length - 1 - art.anchorY).toBe(16);
    for (const [f, grid] of frames.entries()) expectValid(grid, `barge frame ${f}`);
  });

  it("is down by the bow, with the canal standing in its hold", () => {
    // The forward end is gone under: the far corner of the footprint is
    // open water, not hull.
    const at = (px: number, py: number): string =>
      base[py + art.anchorY]?.[px + art.anchorX] ?? ".";
    expect(at(-32 * 2, -16 * 2), "the bow").toBe(".");
    expect(at(0, 0), "the stern").not.toBe(".");
    // Water inside the hull, and rust above the waterline.
    const painted = base.join("");
    expect(painted).toContain("d");
    expect(painted).toContain("e");
    expect(painted).toContain("b");
    // Floating: it grounds in the canal, so it casts no ground shadow.
    expect(painted).not.toContain("z");
  });

  it("keeps one lamp burning on the mast, and works the water with it", () => {
    const glow = art.glow ?? [];
    expect(glow).toHaveLength(1);
    expect(glow[0]?.color).toBe("m");
    // High on the mast, well above the deck.
    expect(glow[0]?.offsetY ?? 0).toBeLessThan(-40);
  });

  it("moves: the water dithers and the lamp breathes between frames", () => {
    expect(art.frameMs).toBeGreaterThan(0);
    expect(new Set(frames.map((grid) => grid.join("\n"))).size).toBe(frames.length);
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

const INTERACTABLE_IDS = ["door", "terminal", "stash", "shard", "exit"] as const;

/**
 * The hit-flash/outline silhouette of a grid, as one comparable string —
 * derived by the same pure helper bakeSilhouette paints from.
 */
function silhouette(grid: PixelGrid): string {
  return silhouetteGrid(grid, "x").join("\n");
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
    for (const id of ["door", "terminal", "stash", "shard"] as const) {
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

/**
 * Way-opening art. Doors and exits are the only interactables anything
 * passes through, so they are the only ones carrying an opening strip.
 * The strip is played forward to open and backward to close, which is
 * what pins frame 0 to the resting look: a door that shuts to something
 * other than its idle art would pop at the end of every cycle.
 */
describe("opening sequences", () => {
  const OPENABLE = ["door", "exit"] as const;

  it("gives a sequence to the things you pass through and nothing else", () => {
    for (const id of INTERACTABLE_IDS) {
      const opens = OPENABLE.includes(id as (typeof OPENABLE)[number]);
      expect(hasOpeningArt(id), id).toBe(opens);
      expect(openingFrames(id) !== undefined, id).toBe(opens);
    }
    // NPCs come from the character pipeline; they have no art here.
    expect(hasOpeningArt("npc")).toBe(false);
  });

  it("keeps every opening frame valid and the size of the idle art", () => {
    for (const id of OPENABLE) {
      const art = INTERACTABLE_ART[id];
      const frames = art.openFrames ?? [];
      expect(frames.length, id).toBeGreaterThanOrEqual(3);
      const base = art.frames[0] ?? [];
      frames.forEach((grid, f) => {
        expectValid(grid, `${id} open frame ${f}`);
        expect(grid.length, `${id} open ${f} height`).toBe(base.length);
        expect(grid[0]?.length, `${id} open ${f} width`).toBe(base[0]?.length);
      });
    }
  });

  it("shuts to exactly the idle look, so a closed door never pops", () => {
    for (const id of OPENABLE) {
      const art = INTERACTABLE_ART[id];
      expect(art.openFrames?.[0], id).toEqual(art.frames[0]);
    }
  });

  it("opens steadily — every frame bares more of the way than the last", () => {
    // "Open" is measured as how much of the tile the way is not
    // blocking: the door's leaves retreating into their posts, the
    // exit's ring flooding with light.
    const doorLeaf = (grid: PixelGrid): number =>
      grid.reduce((total, row) => total + [...row].filter((c) => c === "2").length, 0);
    const doorFrames = INTERACTABLE_ART.door.openFrames ?? [];
    doorFrames.forEach((grid, f) => {
      if (f === 0) return;
      expect(doorLeaf(grid), `door frame ${f} slab`).toBeLessThan(
        doorLeaf(doorFrames[f - 1] ?? []),
      );
    });

    const irisLight = (grid: PixelGrid): number =>
      grid.reduce(
        (total, row) => total + [...row].filter((c) => c === "h" || c === "g").length,
        0,
      );
    const exitFrames = INTERACTABLE_ART.exit.openFrames ?? [];
    exitFrames.forEach((grid, f) => {
      if (f === 0) return;
      expect(irisLight(grid), `exit frame ${f} light`).toBeGreaterThan(
        irisLight(exitFrames[f - 1] ?? []),
      );
    });
  });

  it("parts the door's leaves symmetrically into their own frame", () => {
    const frames = INTERACTABLE_ART.door.openFrames ?? [];
    const open = frames[frames.length - 1] ?? [];
    // A slab row: posts either side, threshold dark down the middle.
    const row = open[12] ?? "";
    expect(row.length).toBe(48);
    expect(row.startsWith("..0554")).toBe(true);
    expect(row.endsWith("4330..")).toBe(true);
    // The doorway is bared symmetrically, and the frame itself is not
    // painted over — a leaf that slid past its post would show as a
    // shortened row rather than an open door.
    const threshold = row.slice(6, 42);
    expect(threshold.slice(0, 2)).toBe(threshold.slice(-2).split("").reverse().join(""));
    expect(threshold).toContain("1".repeat(32));
  });

  it("keeps the exit's iris inside its own tile diamond", () => {
    // Ground art spilling past the diamond would break the tessellation
    // the whole ground pass depends on.
    for (const grid of INTERACTABLE_ART.exit.openFrames ?? []) {
      grid.forEach((row, r) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] !== TRANSPARENT) {
            expect(maskOwns(x, r), `iris pixel (${x}, ${r}) outside its tile`).toBe(
              true,
            );
          }
        }
      });
    }
  });

  it("fully opens: the way is unmistakably clear at the last frame", () => {
    const door = INTERACTABLE_ART.door.openFrames ?? [];
    const shut = door[0]?.join("") ?? "";
    const open = door[door.length - 1]?.join("") ?? "";
    // Most of the slab is gone once the leaves are home.
    const slabShut = [...shut].filter((c) => c === "2").length;
    const slabOpen = [...open].filter((c) => c === "2").length;
    expect(slabOpen).toBeLessThan(slabShut * 0.2);

    const exit = INTERACTABLE_ART.exit.openFrames ?? [];
    const chevronOnly = exit[0]?.join("") ?? "";
    const flooded = exit[exit.length - 1]?.join("") ?? "";
    expect([...flooded].filter((c) => c === "h").length).toBeGreaterThan(
      [...chevronOnly].filter((c) => c === "h").length + 20,
    );
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


/**
 * Set pieces. These are the only art in the game that is never drawn on
 * the ground it sorts at, which is exactly what the checks here are
 * about: nothing carries a shadow, every anchor is a point on the
 * machine rather than a footprint, and the frame sets have to actually
 * move — a set piece whose frames repeat reads as a stutter in the
 * middle of an otherwise still scene.
 */
const SETPIECE_IDS = [
  "train-head",
  "train-car",
  "patrol-drone",
  "steam-burst",
] as const;

/** Rows of a grid that paint anything, top-most first. */
function paintedRows(grid: PixelGrid): number[] {
  const rows: number[] = [];
  grid.forEach((row, y) => {
    if ([...row].some((ch) => ch !== TRANSPARENT)) rows.push(y);
  });
  return rows;
}

describe("set-piece art", () => {
  it("registers a valid, non-empty frame set for every piece", () => {
    expect(Object.keys(SETPIECE_ART).sort()).toEqual([...SETPIECE_IDS].sort());
    for (const id of SETPIECE_IDS) {
      const art = SETPIECE_ART[id];
      expect(art.frames.length, `${id} frames`).toBeGreaterThanOrEqual(2);
      const width = art.frames[0]?.[0]?.length ?? 0;
      const height = art.frames[0]?.length ?? 0;
      art.frames.forEach((grid, f) => {
        expectValid(grid, `${id} frame ${f}`);
        // One silhouette envelope per piece: the bake cache keys on the
        // frame index alone, so frames may not change size.
        expect(grid[0]?.length, `${id} frame ${f} width`).toBe(width);
        expect(grid.length, `${id} frame ${f} height`).toBe(height);
        expect(paintedRows(grid).length, `${id} frame ${f} paints`)
          .toBeGreaterThan(0);
      });
      // Anchors are points on the machine, so they fall inside it.
      expect(art.anchorX, `${id} anchorX`).toBeLessThan(width);
      expect(art.anchorY, `${id} anchorY`).toBeLessThan(height);
    }
  });

  it("grounds nothing: a set piece is never standing on its tile", () => {
    // The z shadow every prop owes the floor is exactly what these must
    // not have — a train is above the rooflines, a drone hovers, and
    // steam has already left the grille.
    for (const id of SETPIECE_IDS) {
      for (const [f, grid] of SETPIECE_ART[id].frames.entries()) {
        expect(grid.join("").includes("z"), `${id} frame ${f} shadow`).toBe(false);
      }
    }
  });

  it("animates through frames that are actually different", () => {
    for (const id of SETPIECE_IDS) {
      const frames = SETPIECE_ART[id].frames;
      const unique = new Set(frames.map((grid) => grid.join("\n")));
      expect(unique.size, `${id} distinct frames`).toBe(frames.length);
    }
  });

  it("builds the rake out of one shell, so cars butt up into a train", () => {
    const head = SETPIECE_ART["train-head"];
    const car = SETPIECE_ART["train-car"];
    expect(head.anchorX).toBe(car.anchorX);
    expect(head.anchorY).toBe(car.anchorY);
    expect(head.frames[0]?.length).toBe(car.frames[0]?.length);
    expect(head.frames[0]?.[0]?.length).toBe(car.frames[0]?.[0]?.length);
    // Two tiles of track per car (a step along x is 32 art pixels), so
    // a rake spaced TRAIN_CAR_SPAN apart has no gaps between carriages.
    expect(head.frames[0]?.[0]?.length).toBe(32 * 3);
  });

  it("lights the carriages and marks the lead one", () => {
    // Amber glass down both flanks, and a livery stripe under it, on
    // every car in the rake.
    for (const id of ["train-head", "train-car"] as const) {
      const ink = SETPIECE_ART[id].frames[0]?.join("") ?? "";
      expect(ink.includes("n"), `${id} lit glass`).toBe(true);
      expect(ink.includes("g"), `${id} livery`).toBe(true);
    }
    // The lead car burns every bay while the rest ride part-dark, so
    // the head of a passing rake is legible at a glance.
    const litness = (id: "train-head" | "train-car"): number =>
      [...(SETPIECE_ART[id].frames[0]?.join("") ?? "")].filter((ch) => ch === "n")
        .length;
    expect(litness("train-head")).toBeGreaterThan(litness("train-car"));
    // And it carries the beacon: white specular the carriages have not.
    expect(SETPIECE_ART["train-head"].frames[0]?.join("").includes("9")).toBe(true);
    expect(SETPIECE_ART["train-car"].frames[0]?.join("").includes("9")).toBe(false);
  });

  it("hangs the drone's scan cone under its hull, thinning with depth", () => {
    const art = SETPIECE_ART["patrol-drone"];
    const grid = art.frames[0] ?? [];
    const hull = grid.slice(0, art.anchorY).join("");
    const cone = grid.slice(art.anchorY);
    // Chrome above the lens, cyan light below it, and nothing solid in
    // the beam — a cone drawn as a solid wedge would read as a spike.
    expect(hull.includes("T")).toBe(true);
    expect(cone.join("").includes("T")).toBe(false);
    expect(cone.join("")).toMatch(/[gi]/);
    // It widens as it falls...
    const span = (row: string): number => {
      const lit = [...row].flatMap((ch, x) => (ch === TRANSPARENT ? [] : [x]));
      return lit.length === 0 ? 0 : (lit[lit.length - 1] ?? 0) - (lit[0] ?? 0);
    };
    expect(span(cone[cone.length - 1] ?? "")).toBeGreaterThan(span(cone[1] ?? ""));
    // ...and dims as it goes, so the beam falls off before the ground
    // instead of ending in a hard edge.
    expect(cone[1]).toMatch(/g/);
    expect(cone[1]).not.toMatch(/i/);
    expect(cone[cone.length - 1]).toMatch(/i/);
    expect(cone[cone.length - 1]).not.toMatch(/g/);
  });

  it("climbs the steam burst off the grille frame by frame", () => {
    const frames = SETPIECE_ART["steam-burst"].frames;
    const feet = frames.map((grid) => Math.max(...paintedRows(grid)));
    const heads = frames.map((grid) => Math.min(...paintedRows(grid)));
    // Both ends of the plume rise, and neither ever falls back.
    expect(feet).toEqual([...feet].sort((a, b) => b - a));
    expect(heads).toEqual([...heads].sort((a, b) => b - a));
    expect(feet[0]).toBeGreaterThan(feet[feet.length - 1] ?? 0);
    // The first frame is at the mouth (the anchor row) and the last has
    // left it entirely — the burst travels rather than switching on.
    expect(feet[0]).toBe(SETPIECE_ART["steam-burst"].anchorY);
    expect(feet[feet.length - 1]).toBeLessThan(
      SETPIECE_ART["steam-burst"].anchorY - 10,
    );
  });
});

describe("action-bar icons", () => {
  it("registers a valid square glyph for every action", () => {
    expect(Object.keys(ACTION_ICON_ART).sort()).toEqual(
      [...ACTION_ICON_IDS].sort(),
    );
    for (const id of ACTION_ICON_IDS) {
      const grid = ACTION_ICON_ART[id];
      expectValid(grid, `action icon ${id}`);
      expect(grid.length, `${id} height`).toBe(ACTION_ICON_SIZE);
      expect(grid[0]?.length, `${id} width`).toBe(ACTION_ICON_SIZE);
      expect(paintedRows(grid).length, `${id} paints`).toBeGreaterThan(0);
    }
  });

  it("keeps every glyph clear of the frame edge, so buttons can crop none of it", () => {
    for (const id of ACTION_ICON_IDS) {
      const grid = ACTION_ICON_ART[id];
      const rows = paintedRows(grid);
      expect(Math.min(...rows), `${id} top margin`).toBeGreaterThan(0);
      expect(Math.max(...rows), `${id} bottom margin`).toBeLessThan(
        ACTION_ICON_SIZE - 1,
      );
    }
  });

  it("carries no ground shadow — a button face is not standing on anything", () => {
    for (const id of ACTION_ICON_IDS) {
      expect(ACTION_ICON_ART[id].join("").includes("z"), `${id} shadow`).toBe(
        false,
      );
    }
  });
});
