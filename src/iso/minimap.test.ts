import { describe, expect, it } from "vitest";
import { requireMap } from "../data/maps";
import { initialCamera } from "./camera";
import { TILE_H, TILE_W, worldToScreen } from "./coords";
import {
  FACING_STEP,
  MINIMAP_CELL_MAX,
  MINIMAP_CELL_MIN,
  MINIMAP_COLORS,
  MINIMAP_MAX_PX,
  minimapCell,
  minimapCells,
  minimapLayout,
  minimapPipKind,
  minimapPips,
  minimapViewport,
  pipSize,
  sameMinimapView,
  tickLength,
  tileCenter,
  tileTopLeft,
  type MinimapView,
} from "./minimap";
import { isWalkable, tileMaterial, type Interactable, type IsoMap } from "./tilemap";

/**
 * The minimap's projection math against the real maps: cells that agree
 * with the tilemap's own walkability, pips only where map data asks for
 * them, a viewport box that tracks the camera, and a view diff that only
 * reports movement. No canvas anywhere — this is all arithmetic.
 */

const hub = requireMap("cinder-plaza");

function interactable(patch: Partial<Interactable> = {}): Interactable {
  return {
    id: "thing",
    x: 1,
    y: 1,
    label: "Thing",
    spriteId: "door",
    interaction: { kind: "dialogue", nodeId: "start" },
    ...patch,
  };
}

/** Relative luminance of a #rrggbb color, for contrast assertions. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("minimapLayout", () => {
  it("fits the map inside the budget at whole pixels per tile", () => {
    const layout = minimapLayout(hub);
    expect(Number.isInteger(layout.cell)).toBe(true);
    expect(layout.width).toBe(layout.cell * hub.width);
    expect(layout.height).toBe(layout.cell * hub.height);
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(
      MINIMAP_MAX_PX,
    );
  });

  it("keeps every registered map's overview inside the budget", () => {
    for (const map of [
      requireMap("greywater-steps"),
      requireMap("exchange-ventworks"),
      requireMap("auric-spire"),
      requireMap("rustyard-arena"),
    ]) {
      const layout = minimapLayout(map);
      expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(
        MINIMAP_MAX_PX,
      );
    }
  });

  it("clamps the cell size at both ends", () => {
    expect(minimapLayout({ width: 400, height: 400 }).cell).toBe(
      MINIMAP_CELL_MIN,
    );
    expect(minimapLayout({ width: 2, height: 2 }).cell).toBe(MINIMAP_CELL_MAX);
  });

  it("survives a degenerate map without dividing by zero", () => {
    expect(minimapLayout({ width: 0, height: 0 })).toEqual({
      cell: MINIMAP_CELL_MAX,
      width: 0,
      height: 0,
    });
  });
});

describe("tile projection", () => {
  const layout = minimapLayout(hub);

  it("tiles each cell edge to edge with no gap or overlap", () => {
    expect(tileTopLeft(layout, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(tileTopLeft(layout, 1, 2)).toEqual({
      x: layout.cell,
      y: layout.cell * 2,
    });
    const last = tileTopLeft(layout, hub.width - 1, hub.height - 1);
    expect(last.x + layout.cell).toBe(layout.width);
    expect(last.y + layout.cell).toBe(layout.height);
  });

  it("centers on the middle of the cell", () => {
    expect(tileCenter(layout, 3, 4)).toEqual({
      x: 3 * layout.cell + layout.cell / 2,
      y: 4 * layout.cell + layout.cell / 2,
    });
  });

  it("keeps pips and ticks small enough to read as marks", () => {
    expect(pipSize(layout)).toBeLessThanOrEqual(layout.cell);
    expect(tickLength(layout)).toBeGreaterThanOrEqual(2);
  });
});

describe("minimapCell", () => {
  it("reports void outside the map", () => {
    expect(minimapCell(hub, -1, 0)).toBe("void");
    expect(minimapCell(hub, hub.width, 0)).toBe("void");
    expect(minimapCell(hub, 0, hub.height)).toBe("void");
  });

  it("agrees with the tilemap: walkable ground is the walkable cell", () => {
    for (let y = 0; y < hub.height; y++) {
      for (let x = 0; x < hub.width; x++) {
        const cell = minimapCell(hub, x, y);
        // isWalkable also rejects tiles an interactable stands on, which
        // the minimap deliberately keeps as ground — so compare only the
        // tiles nothing is standing on.
        const occupied = hub.interactables.some((i) => i.x === x && i.y === y);
        if (occupied) continue;
        expect(cell === "walkable").toBe(isWalkable(hub, x, y));
      }
    }
  });

  it("tints water apart from ordinary blocked ground", () => {
    const water: Array<[number, number]> = [];
    for (let y = 0; y < hub.height; y++) {
      for (let x = 0; x < hub.width; x++) {
        if (tileMaterial(hub.tiles[y]?.[x] ?? "pavement") === "water") {
          water.push([x, y]);
        }
      }
    }
    expect(water.length).toBeGreaterThan(0);
    for (const [x, y] of water) expect(minimapCell(hub, x, y)).toBe("water");
  });

  it("reads building footprints as void, not as blocked ground", () => {
    // The hub's border is a ring of foundation carrying the tenements.
    expect(minimapCell(hub, 0, 1)).toBe("void");
  });

  it("keeps ground under an interactable as ground", () => {
    const npc = hub.interactables.find((i) => i.spriteId === "npc");
    expect(npc).toBeDefined();
    expect(minimapCell(hub, npc?.x ?? 0, npc?.y ?? 0)).toBe("walkable");
  });

  it("marks ground a prop blocks as blocked", () => {
    const prop = hub.props.find((p) => p.blocks && p.propId === "streetlight");
    expect(prop).toBeDefined();
    expect(minimapCell(hub, prop?.x ?? 0, prop?.y ?? 0)).toBe("blocked");
  });
});

describe("minimapCells", () => {
  it("returns one row per map row, row-major like map.tiles", () => {
    const cells = minimapCells(hub);
    expect(cells).toHaveLength(hub.height);
    for (const row of cells) expect(row).toHaveLength(hub.width);
    expect(cells[5]?.[6]).toBe(minimapCell(hub, 6, 5));
  });
});

describe("minimapPipKind", () => {
  it("always marks a way out, whatever it looks like", () => {
    expect(
      minimapPipKind(
        interactable({ spriteId: "exit", exit: { mapId: "cinder-plaza" } }),
      ),
    ).toBe("exit");
    expect(
      minimapPipKind(
        interactable({ spriteId: "npc", exit: { mapId: "cinder-plaza" } }),
      ),
    ).toBe("exit");
  });

  it("always marks people", () => {
    expect(minimapPipKind(interactable({ spriteId: "npc" }))).toBe("npc");
  });

  it("defaults the key object kinds on and everything else off", () => {
    expect(minimapPipKind(interactable({ spriteId: "terminal" }))).toBe(
      "objective",
    );
    expect(minimapPipKind(interactable({ spriteId: "stash" }))).toBe(
      "objective",
    );
    expect(minimapPipKind(interactable({ spriteId: "door" }))).toBeNull();
  });

  it("lets map data promote or hide anything", () => {
    expect(minimapPipKind(interactable({ spriteId: "door", minimap: true }))).toBe(
      "objective",
    );
    expect(
      minimapPipKind(interactable({ spriteId: "npc", minimap: false })),
    ).toBeNull();
    expect(
      minimapPipKind(
        interactable({
          spriteId: "exit",
          exit: { mapId: "cinder-plaza" },
          minimap: false,
        }),
      ),
    ).toBeNull();
  });
});

describe("minimapPips", () => {
  const layout = minimapLayout(hub);
  const pips = minimapPips(hub, layout, { tile: { x: 7, y: 10 }, facing: "n" });

  it("marks every interactable map data asks for, and no others", () => {
    const marked = pips.filter((p) => p.kind !== "player").map((p) => p.id);
    expect(marked).toEqual(
      hub.interactables.filter((i) => minimapPipKind(i)).map((i) => i.id),
    );
    expect(marked).toContain("filament-door");
    expect(marked).toContain("plaza-terminal");
  });

  it("puts each pip on its tile's center", () => {
    const terminal = hub.interactables.find((i) => i.id === "plaza-terminal");
    const pip = pips.find((p) => p.id === "plaza-terminal");
    expect(pip).toBeDefined();
    expect({ x: pip?.x, y: pip?.y }).toEqual(
      tileCenter(layout, terminal?.x ?? 0, terminal?.y ?? 0),
    );
  });

  it("draws the player last, on the player's tile", () => {
    const last = pips[pips.length - 1];
    expect(last?.kind).toBe("player");
    expect({ x: last?.x, y: last?.y }).toEqual(tileCenter(layout, 7, 10));
    expect(pips.filter((p) => p.kind === "player")).toHaveLength(1);
  });

  it("points the facing tick the way the player looks, and only there", () => {
    for (const facing of ["n", "e", "s", "w"] as const) {
      const player = minimapPips(hub, layout, {
        tile: { x: 7, y: 10 },
        facing,
      }).at(-1);
      const step = FACING_STEP[facing];
      const reach = pipSize(layout) / 2 + tickLength(layout);
      expect(player?.tick).toEqual({
        x: (player?.x ?? 0) + step.x * reach,
        y: (player?.y ?? 0) + step.y * reach,
      });
    }
    expect(pips.filter((p) => p.tick).map((p) => p.kind)).toEqual(["player"]);
  });

  it("keeps every pip inside the overview", () => {
    for (const pip of pips) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x).toBeLessThanOrEqual(layout.width);
      expect(pip.y).toBeLessThanOrEqual(layout.height);
    }
  });
});

describe("minimapViewport", () => {
  const layout = minimapLayout(hub);

  it("is empty before the canvas has been measured", () => {
    expect(minimapViewport(layout, { sx: 0, sy: 0 }, 0, 0, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it("stays clipped to the overview at any camera", () => {
    for (const camera of [
      { sx: -10_000, sy: -10_000 },
      { sx: 0, sy: 0 },
      { sx: 10_000, sy: 10_000 },
    ]) {
      const rect = minimapViewport(layout, camera, 1280, 720, 1);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(layout.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("covers the tile the camera is centered on", () => {
    const tile = { x: 5, y: 6 };
    const rect = minimapViewport(
      layout,
      worldToScreen(tile.x, tile.y),
      TILE_W * 4,
      TILE_H * 4,
      1,
    );
    const center = tileCenter(layout, tile.x, tile.y);
    expect(center.x).toBeGreaterThanOrEqual(rect.x);
    expect(center.x).toBeLessThanOrEqual(rect.x + rect.width);
    expect(center.y).toBeGreaterThanOrEqual(rect.y);
    expect(center.y).toBeLessThanOrEqual(rect.y + rect.height);
  });

  it("shrinks as the camera zooms in", () => {
    const camera = initialCamera(hub, { x: 7, y: 6 }, 1280, 720);
    const wide = minimapViewport(layout, camera, 1280, 720, 1);
    const close = minimapViewport(layout, camera, 1280, 720, 2);
    expect(close.width).toBeLessThan(wide.width);
    expect(close.height).toBeLessThan(wide.height);
  });

  it("fills the overview when the camera sees the whole small map", () => {
    const tiny: IsoMap = { ...hub, width: 3, height: 3 };
    const tinyLayout = minimapLayout(tiny);
    const rect = minimapViewport(
      tinyLayout,
      worldToScreen(1, 1),
      TILE_W * 12,
      TILE_H * 12,
      1,
    );
    expect(rect.width).toBe(tinyLayout.width);
    expect(rect.height).toBe(tinyLayout.height);
  });
});

describe("sameMinimapView", () => {
  const view: MinimapView = {
    playerTile: { x: 4, y: 5 },
    facing: "s",
    camera: { sx: 12, sy: 34 },
    viewportW: 1280,
    viewportH: 720,
    zoom: 1,
  };

  it("treats an identical view as unchanged, copies included", () => {
    expect(sameMinimapView(view, { ...view })).toBe(true);
    expect(
      sameMinimapView(view, { ...view, playerTile: { x: 4, y: 5 } }),
    ).toBe(true);
  });

  it("reports every kind of movement as a change", () => {
    const changed: MinimapView[] = [
      { ...view, playerTile: { x: 5, y: 5 } },
      { ...view, playerTile: { x: 4, y: 6 } },
      { ...view, facing: "n" },
      { ...view, camera: { sx: 13, sy: 34 } },
      { ...view, camera: { sx: 12, sy: 35 } },
      { ...view, viewportW: 1281 },
      { ...view, viewportH: 721 },
      { ...view, zoom: 2 },
    ];
    for (const next of changed) expect(sameMinimapView(view, next)).toBe(false);
  });

  it("treats a first view as a change and null as equal to null", () => {
    expect(sameMinimapView(null, view)).toBe(false);
    expect(sameMinimapView(null, null)).toBe(true);
  });
});

describe("MINIMAP_COLORS", () => {
  it("keeps walkable ground clearly brighter than blocked ground", () => {
    expect(luminance(MINIMAP_COLORS.walkable)).toBeGreaterThan(
      luminance(MINIMAP_COLORS.blocked) + 15,
    );
  });

  it("sinks void below every kind of ground", () => {
    for (const cell of ["blocked", "walkable", "water"] as const) {
      expect(luminance(MINIMAP_COLORS.void)).toBeLessThan(
        luminance(MINIMAP_COLORS[cell]),
      );
    }
  });

  it("gives every pip kind its own ink", () => {
    const inks = (["player", "exit", "npc", "objective"] as const).map(
      (kind) => MINIMAP_COLORS[kind],
    );
    expect(new Set(inks).size).toBe(inks.length);
  });
});
