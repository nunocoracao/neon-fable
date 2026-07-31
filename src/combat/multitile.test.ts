import { describe, expect, it } from "vitest";
import { takeAction } from "./actions";
import { chooseEnemyAction } from "./ai";
import { abilityImpact } from "./area";
import { bodyGap, bodyTiles } from "./footprint";
import { canStand, combatantAt, isBlocked, isOccupied } from "./grid";
import { attackOptions, reachableTiles } from "./legal";
import { makeCombat, makeCombatant } from "./testSupport";
import { telegraphHover, telegraphTiles } from "./telegraph";
import { CombatError, type CombatState, type GridPosition } from "./types";
import { requireAbility } from "../data/abilities";

/**
 * The engine under a body that does not fit on one tile. The chassis in
 * these fixtures is a bare 2×2 combatant — no boss content anywhere in
 * here — because the whole point of the footprint field is that the
 * rules do not know what a boss is.
 */

const at = (x: number, y: number): GridPosition => ({ x, y });
const BLOCK = { width: 2, height: 2 };

/** A 9×7 arena: the player on the left, a 2×2 chassis on the right. */
function arena(overrides: Partial<CombatState> = {}): CombatState {
  const player = makeCombatant({
    id: "player",
    kind: "player",
    name: "You",
    position: at(1, 3),
    stats: { body: 6, reflexes: 8, tech: 5, cool: 5, intelligence: 5 },
    weapon: { name: "Spitter", damage: 6, rangeType: "ranged" },
  });
  const chassis = makeCombatant({
    id: "chassis",
    name: "Chassis",
    position: at(6, 2),
    footprint: { ...BLOCK },
    maxHp: 40,
    hp: 40,
    stats: { body: 9, reflexes: 4, tech: 4, cool: 5, intelligence: 3 },
    weapon: { name: "Piston", damage: 7, rangeType: "melee" },
  });
  return makeCombat([player, chassis], {
    grid: { width: 9, height: 7 },
    ...overrides,
  });
}

/** Turn order handed to the chassis. */
function chassisTurn(state: CombatState): CombatState {
  return {
    ...state,
    turnIndex: state.initiativeOrder.indexOf("chassis"),
    moveRemaining: 3,
    actionUsed: false,
  };
}

describe("occupancy", () => {
  it("counts every tile of the block as taken", () => {
    const state = arena();
    for (const tile of bodyTiles(state.combatants[1]!)) {
      expect(isOccupied(state.combatants, tile), `${tile.x},${tile.y}`).toBe(
        true,
      );
    }
    expect(isOccupied(state.combatants, at(8, 2))).toBe(false);
    expect(isOccupied(state.combatants, at(6, 4))).toBe(false);
  });

  it("resolves any tile of the block back to the body standing on it", () => {
    const state = arena();
    expect(combatantAt(state.combatants, at(7, 3))?.id).toBe("chassis");
    expect(combatantAt(state.combatants, at(6, 2))?.id).toBe("chassis");
    expect(combatantAt(state.combatants, at(8, 2))).toBeUndefined();
  });

  it("blocks a block that would overlap, even where its anchor is free", () => {
    const state = arena();
    // (5, 3) is empty ground, but a 2×2 anchored there reaches (6, 3).
    expect(isOccupied(state.combatants, at(5, 3))).toBe(false);
    expect(isBlocked(state.combatants, at(5, 3), BLOCK)).toBe(true);
    // Ignoring the chassis itself, its own tiles are free again.
    expect(isBlocked(state.combatants, at(6, 2), BLOCK, "chassis")).toBe(false);
  });

  it("stops counting a body once it is dead", () => {
    const state = arena();
    const dead = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "chassis" ? { ...c, hp: 0 } : c,
      ),
    };
    expect(isOccupied(dead.combatants, at(7, 3))).toBe(false);
    expect(canStand(dead.grid, dead.combatants, at(6, 2), BLOCK)).toBe(true);
  });
});

describe("movement", () => {
  it("offers only anchors whose whole block fits the arena", () => {
    const state = chassisTurn(arena());
    const tiles = reachableTiles(state);
    // Nothing on the last column or the last row: a 2×2 anchored there
    // would hang off the 9×7 grid.
    expect(tiles.every((t) => t.x <= 7 && t.y <= 5)).toBe(true);
    expect(tiles.some((t) => t.x === 8)).toBe(false);
    expect(tiles.some((t) => t.y === 6)).toBe(false);
  });

  it("offers no anchor that would put the block inside somebody", () => {
    const state = chassisTurn(arena({}));
    const crowd: CombatState = {
      ...state,
      combatants: [
        ...state.combatants,
        makeCombatant({ id: "guard", kind: "player", position: at(5, 2) }),
      ],
      initiativeOrder: [...state.initiativeOrder, "guard"],
    };
    const tiles = reachableTiles(chassisTurn(crowd));
    for (const tile of tiles) {
      expect(
        isBlocked(crowd.combatants, tile, BLOCK, "chassis"),
        `${tile.x},${tile.y}`,
      ).toBe(false);
    }
    // (4, 2) would swallow the guard at (5, 2).
    expect(tiles.some((t) => t.x === 4 && t.y === 2)).toBe(false);
  });

  it("refuses a move that would hang the block off the grid", () => {
    const state = chassisTurn(arena());
    expect(() => takeAction(state, { type: "move", to: at(8, 2) })).toThrow(
      CombatError,
    );
    // The same step one column left is legal.
    const moved = takeAction(state, { type: "move", to: at(7, 2) });
    expect(moved.combatants.find((c) => c.id === "chassis")?.position).toEqual(
      at(7, 2),
    );
  });

  it("refuses a move that would overlap another body", () => {
    const state = chassisTurn(arena());
    const crowded: CombatState = {
      ...state,
      combatants: [
        ...state.combatants,
        makeCombatant({ id: "guard", kind: "player", position: at(5, 3) }),
      ],
      initiativeOrder: [...state.initiativeOrder, "guard"],
    };
    expect(() =>
      takeAction(chassisTurn(crowded), { type: "move", to: at(4, 3) }),
    ).toThrow(CombatError);
  });

  it("never lets two bodies end up on the same tile", () => {
    let state = chassisTurn(arena());
    // Walk the chassis at the player for as long as the engine allows.
    for (let i = 0; i < 12; i++) {
      const action = chooseEnemyAction(state);
      state = takeAction(state, action);
      if (action.type === "end-turn") state = chassisTurn(state);
      const seen = new Set<string>();
      for (const c of state.combatants) {
        for (const tile of bodyTiles(c)) {
          const key = `${tile.x},${tile.y}`;
          expect(seen.has(key), `two bodies on ${key}`).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it("still costs the distance between anchors", () => {
    const state = chassisTurn(arena());
    const moved = takeAction(state, { type: "move", to: at(5, 2) });
    expect(moved.moveRemaining).toBe(state.moveRemaining - 1);
  });
});

describe("reach", () => {
  it("measures melee range to the nearest tile of the block", () => {
    const beside = arena();
    const state: CombatState = {
      ...beside,
      combatants: beside.combatants.map((c) =>
        // Pressed against the block's near column, level with its far row.
        c.kind === "player" ? { ...c, position: at(5, 3) } : c,
      ),
    };
    const chassis = state.combatants.find((c) => c.id === "chassis")!;
    const player = state.combatants.find((c) => c.kind === "player")!;
    expect(bodyGap(player, chassis)).toBe(1);
    // Both directions, and both from the chassis's own point of view.
    expect(bodyGap(chassis, player)).toBe(1);
  });

  it("lets a melee chassis reach a body beside any of its tiles", () => {
    const base = arena();
    for (const spot of [at(5, 2), at(5, 3), at(8, 2), at(8, 3), at(6, 4)]) {
      const state = chassisTurn({
        ...base,
        combatants: base.combatants.map((c) =>
          c.kind === "player" ? { ...c, position: spot } : c,
        ),
      });
      expect(
        attackOptions(state).map((o) => o.targetId),
        `${spot.x},${spot.y}`,
      ).toEqual(["player"]);
    }
  });

  it("keeps a body a tile out of reach out of reach", () => {
    const base = arena();
    const state = chassisTurn({
      ...base,
      combatants: base.combatants.map((c) =>
        c.kind === "player" ? { ...c, position: at(4, 3) } : c,
      ),
    });
    expect(attackOptions(state)).toEqual([]);
  });

  it("quotes the block gap as the attack option's distance", () => {
    const state = arena();
    const option = attackOptions(state)[0];
    // Player (1, 3) to the block (6..7, 2..3): five columns, no rows.
    expect(option?.distance).toBe(5);
  });
});

describe("areas", () => {
  it("catches a block whose any tile is under the shape", () => {
    const state = arena();
    const actor = state.combatants[0]!;
    const chassis = state.combatants[1]!;
    const ability = requireAbility("ability-overclock-burst");
    // A lane walked from the player to the block's far corner sweeps its
    // near tiles on the way, and the body it belongs to is caught once.
    const caught = abilityImpact(state, actor, ability, chassis);
    expect(caught.map((c) => c.id)).toEqual(["chassis"]);
  });
});

describe("telegraph", () => {
  it("aims at a chassis from any of its tiles and lights all of them", () => {
    const state = arena();
    for (const tile of [at(6, 2), at(7, 3), at(7, 2)]) {
      const hover = telegraphHover(state, { kind: "attack" }, tile);
      expect(hover.valid, `${tile.x},${tile.y}`).toBe(true);
      expect(hover.targetId).toBe("chassis");
      expect(hover.impact).toHaveLength(4);
    }
  });

  it("shows nothing at all while somebody else is acting", () => {
    const state = chassisTurn(arena());
    expect(telegraphTiles(state, { kind: "move" }, null)).toEqual([]);
    expect(telegraphHover(state, { kind: "move" }, at(4, 3)).reason).toBe(
      "not-your-turn",
    );
  });
});

/**
 * Nothing in the rules is about enemies: a multi-tile *player* would get
 * the same answers, and asking for them is how that stays true.
 */
describe("a multi-tile actor's own telegraph", () => {
  function bigPlayer(): CombatState {
    const state = arena();
    return {
      ...state,
      combatants: state.combatants.map((c) =>
        c.kind === "player"
          ? { ...c, position: at(1, 2), footprint: { ...BLOCK } }
          : c,
      ),
    };
  }

  it("marks every tile it is standing on as its origin", () => {
    const tiles = telegraphTiles(bigPlayer(), { kind: "move" }, null);
    const origins = tiles
      .filter((t) => t.role === "origin")
      .map((t) => `${t.x},${t.y}`)
      .sort();
    expect(origins).toEqual(["1,2", "1,3", "2,2", "2,3"]);
  });

  it("refuses a walk whose block would leave the arena", () => {
    const hover = telegraphHover(bigPlayer(), { kind: "move" }, at(8, 2));
    expect(hover.valid).toBe(false);
    expect(hover.reason).toBe("off-grid");
  });

  it("refuses a walk whose block would land inside somebody", () => {
    const hover = telegraphHover(bigPlayer(), { kind: "move" }, at(5, 3));
    expect(hover.valid).toBe(false);
    expect(hover.reason).toBe("occupied");
  });

  it("measures its own reach from whichever tile is nearest", () => {
    const state = bigPlayer();
    const near: CombatState = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "chassis" ? { ...c, position: at(4, 2) } : c,
      ),
    };
    // Blocks (1..2, 2..3) and (4..5, 2..3): two columns of clear floor.
    expect(bodyGap(near.combatants[0]!, near.combatants[1]!)).toBe(2);
    const hover = telegraphHover(near, { kind: "attack" }, at(4, 3));
    expect(hover.valid).toBe(true);
  });
});
