import { describe, expect, it } from "vitest";
import { requireAbility, type Ability } from "../data/abilities";
import { abilityAreaTiles, abilityImpact, areaTiles } from "./area";
import { makeCombat, makeCombatant } from "./testSupport";
import type { GridPosition, GridSize } from "./types";

/**
 * Where an ability actually lands. This is the promise the grid
 * telegraph makes on the engine's behalf, so what is pinned here is the
 * shared truth: the tiles a shape covers, the bodies standing on them,
 * and the fact that an arena's edges cut a shape short rather than
 * letting it spill off the board.
 */

const grid: GridSize = { width: 8, height: 8 };

/** Tiles as sorted "x,y" strings, so order never fakes a difference. */
function keys(tiles: readonly GridPosition[]): string[] {
  return tiles.map((t) => `${t.x},${t.y}`).sort();
}

const player = (over = {}) =>
  makeCombatant({
    id: "player",
    kind: "player",
    name: "Vex",
    position: { x: 1, y: 4 },
    ...over,
  });

/** An ability with an arbitrary shape, for shape-only assertions. */
function shaped(area: Ability["area"]): Ability {
  return { ...requireAbility("ability-shock-dart"), area };
}

describe("areaTiles", () => {
  it("covers exactly the aimed tile when the ability has no area", () => {
    expect(areaTiles(grid, undefined, { x: 0, y: 0 }, { x: 3, y: 3 })).toEqual([
      { x: 3, y: 3 },
    ]);
  });

  it("covers a Manhattan disc for a blast, the aimed tile included", () => {
    const tiles = areaTiles(
      grid,
      { shape: "blast", radius: 1 },
      { x: 0, y: 3 },
      { x: 3, y: 3 },
    );
    expect(keys(tiles)).toEqual(keys([
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 4, y: 3 },
      { x: 3, y: 2 },
      { x: 3, y: 4 },
    ]));
    // Diagonals are two steps away on this grid, and stay out of it.
    expect(keys(tiles)).not.toContain("2,2");
  });

  it("widens a blast by one ring per point of radius", () => {
    for (const radius of [0, 1, 2, 3]) {
      const tiles = areaTiles(
        { width: 21, height: 21 },
        { shape: "blast", radius },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      );
      // A Manhattan disc of radius r holds 2r² + 2r + 1 tiles.
      expect(tiles.length, `radius ${radius}`).toBe(2 * radius * radius + 2 * radius + 1);
    }
  });

  it("walks a lane from the caster to the target, the gun's own tile excluded", () => {
    const tiles = areaTiles(grid, { shape: "line" }, { x: 1, y: 4 }, { x: 5, y: 4 });
    expect(tiles).toEqual([
      { x: 2, y: 4 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ]);
  });

  it("bends a lane on the arena's own axis-first rule", () => {
    // The same rule everything else in the arena moves and paths by:
    // the longer axis is walked first.
    const tiles = areaTiles(grid, { shape: "line" }, { x: 1, y: 1 }, { x: 3, y: 2 });
    expect(tiles).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ]);
  });

  it("cuts a shape at the arena's edge rather than spilling off it", () => {
    const tiles = areaTiles(
      { width: 3, height: 3 },
      { shape: "blast", radius: 2 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    );
    for (const tile of tiles) {
      expect(tile.x, "x").toBeGreaterThanOrEqual(0);
      expect(tile.y, "y").toBeGreaterThanOrEqual(0);
      expect(tile.x, "x").toBeLessThan(3);
      expect(tile.y, "y").toBeLessThan(3);
    }
    expect(keys(tiles)).toEqual(keys([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
    ]));
  });

  it("treats a negative or fractional radius as the aimed tile alone", () => {
    for (const radius of [-3, 0.6]) {
      const tiles = areaTiles(
        grid,
        { shape: "blast", radius },
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      );
      expect(tiles, `radius ${radius}`).toEqual([{ x: 4, y: 4 }]);
    }
  });
});

describe("abilityImpact", () => {
  it("reaches only the aimed body when the ability has no area", () => {
    const actor = player();
    const near = makeCombatant({ id: "near", position: { x: 2, y: 4 } });
    const beside = makeCombatant({ id: "beside", position: { x: 2, y: 5 } });
    const state = makeCombat([actor, near, beside]);
    const caught = abilityImpact(state, actor, shaped(undefined), near);
    expect(caught.map((c) => c.id)).toEqual(["near"]);
  });

  it("catches everyone standing under a blast, the aimed body first", () => {
    const actor = player();
    const aimed = makeCombatant({ id: "aimed", position: { x: 4, y: 4 } });
    const splash = makeCombatant({ id: "splash", position: { x: 4, y: 5 } });
    const clear = makeCombatant({ id: "clear", position: { x: 7, y: 7 } });
    const state = makeCombat([actor, aimed, splash, clear]);
    const caught = abilityImpact(
      state,
      actor,
      shaped({ shape: "blast", radius: 1 }),
      aimed,
    );
    expect(caught.map((c) => c.id)).toEqual(["aimed", "splash"]);
  });

  it("spares the caster's own side, however wide the shape is", () => {
    // A blast is not friendly fire: the shape covers the ally's tile and
    // the ally still walks away from it.
    const actor = player();
    const ally = makeCombatant({
      id: "ally",
      kind: "player",
      position: { x: 4, y: 5 },
    });
    const aimed = makeCombatant({ id: "aimed", position: { x: 4, y: 4 } });
    const state = makeCombat([actor, ally, aimed]);
    const caught = abilityImpact(
      state,
      actor,
      shaped({ shape: "blast", radius: 1 }),
      aimed,
    );
    expect(caught.map((c) => c.id)).toEqual(["aimed"]);
  });

  it("leaves the fallen out of it — a heap is not a target", () => {
    const actor = player();
    const aimed = makeCombatant({ id: "aimed", position: { x: 4, y: 4 } });
    const down = makeCombatant({ id: "down", hp: 0, position: { x: 4, y: 5 } });
    const state = makeCombat([actor, aimed, down]);
    const caught = abilityImpact(
      state,
      actor,
      shaped({ shape: "blast", radius: 1 }),
      aimed,
    );
    expect(caught.map((c) => c.id)).toEqual(["aimed"]);
  });

  it("catches everyone in a lane, including the ones short of the target", () => {
    const actor = player();
    const midway = makeCombatant({ id: "midway", position: { x: 3, y: 4 } });
    const aimed = makeCombatant({ id: "aimed", position: { x: 5, y: 4 } });
    const state = makeCombat([actor, midway, aimed]);
    const caught = abilityImpact(state, actor, shaped({ shape: "line" }), aimed);
    expect(caught.map((c) => c.id).sort()).toEqual(["aimed", "midway"]);
    expect(caught[0]?.id, "the aimed body leads").toBe("aimed");
  });

  it("tints exactly the tiles it reaches — one resolution, two readers", () => {
    // The telegraph paints abilityAreaTiles and the engine damages
    // abilityImpact; every body the second returns must be standing on
    // a tile the first returned, or the picture lied.
    const actor = player();
    const aimed = makeCombatant({ id: "aimed", position: { x: 4, y: 4 } });
    const splash = makeCombatant({ id: "splash", position: { x: 3, y: 4 } });
    const state = makeCombat([actor, aimed, splash]);
    const ability = shaped({ shape: "blast", radius: 1 });
    const painted = keys(abilityAreaTiles(state, actor, ability, aimed.position));
    for (const body of abilityImpact(state, actor, ability, aimed)) {
      expect(painted, body.id).toContain(`${body.position.x},${body.position.y}`);
    }
  });
});
