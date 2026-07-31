import { describe, expect, it } from "vitest";
import { attackOptions } from "./legal";
import { outcomesFor } from "./preview";
import {
  TELEGRAPH_ROLES,
  resolveTelegraphTiles,
  telegraphField,
  telegraphHover,
  telegraphTargetAt,
  telegraphTiles,
  type TelegraphIntent,
  type TelegraphRole,
} from "./telegraph";
import { makeCombat, makeCombatant } from "./testSupport";
import type { CombatState, GridPosition } from "./types";

/**
 * What the grid promises. Three things are pinned here: that a tinted
 * tile is a tile the engine would actually accept, that an outcome chip
 * quotes the preview layer's own figures rather than a second set, and
 * that a refusal names the *first* thing standing in the way — the
 * negative tint is only useful if it says what to change.
 */

const player = (over = {}) =>
  makeCombatant({
    id: "player",
    kind: "player",
    name: "Vex",
    position: { x: 2, y: 2 },
    weapon: { name: "Shard Knife", damage: 5, rangeType: "melee" },
    ...over,
  });

const foe = (id: string, over = {}) =>
  makeCombatant({ id, name: id, ...over });

/** Every tile carrying one role, as sorted "x,y" strings. */
function tilesWithRole(
  state: CombatState,
  intent: TelegraphIntent,
  role: TelegraphRole,
): string[] {
  return telegraphField(state, intent)
    .filter((tile) => tile.role === role)
    .map((tile) => `${tile.x},${tile.y}`)
    .sort();
}

function hoverAt(
  state: CombatState,
  intent: TelegraphIntent,
  tile: GridPosition,
): ReturnType<typeof telegraphHover> {
  return telegraphHover(state, intent, tile);
}

describe("telegraphField", () => {
  it("tints nothing with nothing selected", () => {
    const state = makeCombat([player(), foe("thug")]);
    expect(telegraphField(state, { kind: "none" })).toEqual([]);
  });

  it("marks the actor's own tile whatever is open", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 3, y: 2 } })]);
    for (const intent of [
      { kind: "move" } as const,
      { kind: "attack" } as const,
    ]) {
      expect(tilesWithRole(state, intent, "origin")).toEqual(["2,2"]);
    }
  });

  it("tints exactly the tiles the move rules would accept", () => {
    const state = makeCombat(
      [player(), foe("thug", { position: { x: 3, y: 2 } })],
      { moveRemaining: 2 },
    );
    const tinted = tilesWithRole(state, { kind: "move" }, "reach");
    // The occupied tile is inside the budget and stays out of the tint,
    // because the engine would refuse a move onto it.
    expect(tinted).not.toContain("3,2");
    expect(tinted).toContain("2,4");
    expect(tinted).not.toContain("2,5");
  });

  it("tints the weapon's whole reach, not merely the bodies in it", () => {
    const state = makeCombat([
      player({ weapon: { name: "Rail Spitter", damage: 4, rangeType: "ranged" } }),
      foe("thug", { position: { x: 5, y: 2 } }),
    ]);
    const tinted = tilesWithRole(state, { kind: "attack" }, "range");
    expect(tinted).toContain("5,2");
    // Empty ground within reach is still ground you can shoot across.
    expect(tinted).toContain("2,7");
    // Six steps out: past the barrel, and off the tint.
    expect(tinted).not.toContain("3,7");
  });

  it("tints nothing once the turn's action is spent", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 3, y: 2 } })], {
      actionUsed: true,
    });
    expect(telegraphField(state, { kind: "attack" })).toEqual([]);
  });

  it("tints nothing while an enemy is acting, or once the fight is over", () => {
    const combatants = [player(), foe("thug", { position: { x: 3, y: 2 } })];
    expect(
      telegraphField(makeCombat(combatants, { turnIndex: 1 }), { kind: "move" }),
    ).toEqual([]);
    expect(
      telegraphField(makeCombat(combatants, { status: "victory" }), {
        kind: "move",
      }),
    ).toEqual([]);
  });

  it("shows a self-boost as reaching nowhere but the caster", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-combat-focus"] }),
      foe("thug", { position: { x: 3, y: 2 } }),
    ]);
    const field = telegraphField(state, {
      kind: "ability",
      abilityId: "ability-combat-focus",
    });
    expect(field).toEqual([{ x: 2, y: 2, role: "origin" }]);
  });

  it("tints nothing for an ability still cooling down", () => {
    const state = makeCombat([
      player({
        abilityIds: ["ability-shock-dart"],
        cooldowns: { "ability-shock-dart": 2 },
      }),
      foe("thug", { position: { x: 4, y: 2 } }),
    ]);
    expect(
      telegraphField(state, { kind: "ability", abilityId: "ability-shock-dart" }),
    ).toEqual([]);
  });
});

describe("telegraphHover — moving", () => {
  it("previews the pathfinder's own steps, and what they cost", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 7, y: 7 } })], {
      moveRemaining: 3,
    });
    const hover = hoverAt(state, { kind: "move" }, { x: 4, y: 3 });
    expect(hover.valid).toBe(true);
    expect(hover.reason).toBeNull();
    // Dominant axis first — the same walk the engine and the scene take.
    expect(hover.path).toEqual([
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 4, y: 3 },
    ]);
    expect(hover.cost).toBe(3);
    expect(hover.stepsLeft).toBe(0);
  });

  it("costs exactly as many steps as the path has tiles", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 7, y: 7 } })], {
      moveRemaining: 4,
    });
    for (const tile of [
      { x: 3, y: 2 },
      { x: 4, y: 4 },
      { x: 0, y: 1 },
    ]) {
      const hover = hoverAt(state, { kind: "move" }, tile);
      expect(hover.path.length, `${tile.x},${tile.y}`).toBe(hover.cost);
    }
  });

  it("refuses a tile beyond the budget, and says which budget", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 7, y: 7 } })], {
      moveRemaining: 2,
    });
    const hover = hoverAt(state, { kind: "move" }, { x: 6, y: 2 });
    expect(hover.valid).toBe(false);
    expect(hover.reason).toBe("out-of-range");
    expect(hover.path).toEqual([]);
    expect(hover.cost).toBeNull();
  });

  it("refuses an occupied tile, the actor's own tile, and off-grid ones", () => {
    const state = makeCombat(
      [player(), foe("thug", { position: { x: 3, y: 2 } })],
      { moveRemaining: 4 },
    );
    expect(hoverAt(state, { kind: "move" }, { x: 3, y: 2 }).reason).toBe(
      "occupied",
    );
    expect(hoverAt(state, { kind: "move" }, { x: 2, y: 2 }).reason).toBe(
      "same-tile",
    );
    expect(hoverAt(state, { kind: "move" }, { x: -1, y: 2 }).reason).toBe(
      "off-grid",
    );
  });

  it("names the spent budget before anything about the tile", () => {
    const state = makeCombat([player(), foe("thug")], { moveRemaining: 0 });
    expect(hoverAt(state, { kind: "move" }, { x: 3, y: 2 }).reason).toBe(
      "no-steps",
    );
  });

  it("refuses everything while an enemy is acting", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 5, y: 5 } })], {
      turnIndex: 1,
    });
    expect(hoverAt(state, { kind: "move" }, { x: 3, y: 2 }).reason).toBe(
      "not-your-turn",
    );
  });

  it("says nothing at all with no intent open", () => {
    // A cursor drifting over the arena is not an error.
    const state = makeCombat([player(), foe("thug")]);
    const hover = hoverAt(state, { kind: "none" }, { x: 3, y: 2 });
    expect(hover.valid).toBe(false);
    expect(hover.reason).toBeNull();
  });
});

describe("telegraphHover — aiming", () => {
  it("quotes the preview layer's figures for a weapon shot", () => {
    const state = makeCombat([
      player(),
      foe("thug", { position: { x: 3, y: 2 }, armor: 1 }),
    ]);
    const hover = hoverAt(state, { kind: "attack" }, { x: 3, y: 2 });
    expect(hover.valid).toBe(true);
    expect(hover.targetId).toBe("thug");
    expect(hover.impact).toEqual([{ x: 3, y: 2 }]);
    // The single-source check: the chip's outcomes are outcomesFor's.
    expect(hover.outcomes).toEqual(outcomesFor(state, { kind: "attack" }, "thug"));
    const option = attackOptions(state).find((o) => o.targetId === "thug");
    expect(hover.outcomes[0]?.damageMax).toBe(option?.damage);
    expect(hover.outcomes[0]?.hitChance).toBe(option?.hitChance);
    // A weapon can miss, so the bottom of its span is nothing at all.
    expect(hover.outcomes[0]?.damageMin).toBe(0);
  });

  it("refuses empty ground and the player's own tile as targets", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 3, y: 2 } })]);
    expect(hoverAt(state, { kind: "attack" }, { x: 5, y: 5 }).reason).toBe(
      "no-target",
    );
    expect(hoverAt(state, { kind: "attack" }, { x: 2, y: 2 }).reason).toBe(
      "no-target",
    );
  });

  it("refuses a body the weapon cannot reach, and says so", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 6, y: 2 } })]);
    const hover = hoverAt(state, { kind: "attack" }, { x: 6, y: 2 });
    expect(hover.valid).toBe(false);
    expect(hover.reason).toBe("out-of-range");
    expect(hover.impact).toEqual([]);
    expect(hover.outcomes).toEqual([]);
  });

  it("names the spent action before the range", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 6, y: 2 } })], {
      actionUsed: true,
    });
    expect(hoverAt(state, { kind: "attack" }, { x: 6, y: 2 }).reason).toBe(
      "action-used",
    );
  });

  it("shows a single-target ability touching one tile", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-shock-dart"] }),
      foe("thug", { position: { x: 5, y: 2 } }),
    ]);
    const hover = hoverAt(
      state,
      { kind: "ability", abilityId: "ability-shock-dart" },
      { x: 5, y: 2 },
    );
    expect(hover.valid).toBe(true);
    expect(hover.impact).toEqual([{ x: 5, y: 2 }]);
    expect(hover.outcomes).toHaveLength(1);
    // Abilities never roll to hit; the chip must not imply they do.
    expect(hover.outcomes[0]?.hitChance).toBeNull();
    expect(hover.outcomes[0]?.damageMin).toBe(hover.outcomes[0]?.damageMax);
  });

  it("shows an area ability's whole shape, and every body under it", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-stun-strike"] }),
      foe("aimed", { position: { x: 3, y: 2 } }),
      foe("beside", { position: { x: 4, y: 2 } }),
      foe("clear", { position: { x: 7, y: 7 } }),
    ]);
    const hover = hoverAt(
      state,
      { kind: "ability", abilityId: "ability-stun-strike" },
      { x: 3, y: 2 },
    );
    expect(hover.valid).toBe(true);
    // The blast's whole diamond is tinted, including the empty ground —
    // the player has to be able to see where to stand to catch a second.
    expect(hover.impact.map((t) => `${t.x},${t.y}`).sort()).toEqual([
      "2,2",
      "3,1",
      "3,2",
      "3,3",
      "4,2",
    ]);
    expect(hover.outcomes.map((o) => o.targetId)).toEqual(["aimed", "beside"]);
    expect(hover.outcomes[0]?.primary).toBe(true);
    expect(hover.outcomes[1]?.primary).toBe(false);
    // The stun is promised on every body it reaches, not just the aim.
    for (const outcome of hover.outcomes) {
      expect(outcome.statuses, outcome.targetId).toEqual([
        { kind: "stun", turns: 1 },
      ]);
    }
  });

  it("refuses to aim a self-boost anywhere but at its caster", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-combat-focus"] }),
      foe("thug", { position: { x: 3, y: 2 } }),
    ]);
    const intent = {
      kind: "ability",
      abilityId: "ability-combat-focus",
    } as const;
    expect(hoverAt(state, intent, { x: 3, y: 2 }).reason).toBe("self-only");
    const own = hoverAt(state, intent, { x: 2, y: 2 });
    expect(own.valid).toBe(true);
    expect(own.outcomes[0]?.statuses).toEqual([
      { kind: "boost", stat: "reflexes", amount: 2, turns: 2 },
    ]);
  });

  it("names a cooling ability's cooldown, wherever it is pointed", () => {
    const state = makeCombat([
      player({
        abilityIds: ["ability-shock-dart"],
        cooldowns: { "ability-shock-dart": 1 },
      }),
      foe("thug", { position: { x: 4, y: 2 } }),
    ]);
    expect(
      hoverAt(
        state,
        { kind: "ability", abilityId: "ability-shock-dart" },
        { x: 4, y: 2 },
      ).reason,
    ).toBe("on-cooldown");
  });
});

describe("telegraphTiles", () => {
  it("lays the hover over the field it runs through", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 7, y: 7 } })], {
      moveRemaining: 3,
    });
    const intent = { kind: "move" } as const;
    const hover = hoverAt(state, intent, { x: 4, y: 2 });
    const resolved = resolveTelegraphTiles(telegraphTiles(state, intent, hover));
    const roleAt = (x: number, y: number): TelegraphRole | undefined =>
      resolved.find((t) => t.x === x && t.y === y)?.role;
    // The path wins over the reach it was drawn inside of.
    expect(roleAt(3, 2)).toBe("path");
    expect(roleAt(4, 2)).toBe("path");
    expect(roleAt(2, 3)).toBe("reach");
    expect(roleAt(2, 2)).toBe("origin");
  });

  it("marks a refused tile, and nothing else, as refused", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 3, y: 2 } })], {
      moveRemaining: 3,
    });
    const intent = { kind: "move" } as const;
    const hover = hoverAt(state, intent, { x: 3, y: 2 });
    const resolved = resolveTelegraphTiles(telegraphTiles(state, intent, hover));
    const denied = resolved.filter((t) => t.role === "denied");
    expect(denied).toEqual([{ x: 3, y: 2, role: "denied" }]);
  });

  it("gives one tile exactly one tint, however many roles claimed it", () => {
    const state = makeCombat(
      [
        player({ abilityIds: ["ability-stun-strike"] }),
        foe("aimed", { position: { x: 3, y: 2 } }),
      ],
      { moveRemaining: 3 },
    );
    const intent = {
      kind: "ability",
      abilityId: "ability-stun-strike",
    } as const;
    const hover = hoverAt(state, intent, { x: 3, y: 2 });
    const resolved = resolveTelegraphTiles(telegraphTiles(state, intent, hover));
    const keys = resolved.map((t) => `${t.x},${t.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    // The impact was laid last, so it is what the shared tiles show.
    expect(resolved.find((t) => t.x === 3 && t.y === 2)?.role).toBe("impact");
  });

  it("uses only roles the palette knows how to paint", () => {
    const state = makeCombat([player(), foe("thug", { position: { x: 3, y: 2 } })]);
    const intent = { kind: "attack" } as const;
    const tiles = telegraphTiles(state, intent, hoverAt(state, intent, { x: 3, y: 2 }));
    for (const tile of tiles) {
      expect(TELEGRAPH_ROLES, `${tile.x},${tile.y}`).toContain(tile.role);
    }
  });
});

describe("telegraphTargetAt", () => {
  it("names the living body on a tile, and nothing on an empty one", () => {
    const state = makeCombat([
      player(),
      foe("thug", { position: { x: 3, y: 2 } }),
      foe("down", { position: { x: 4, y: 2 }, hp: 0 }),
    ]);
    expect(telegraphTargetAt(state, { x: 3, y: 2 })).toBe("thug");
    expect(telegraphTargetAt(state, { x: 4, y: 2 })).toBeNull();
    expect(telegraphTargetAt(state, { x: 6, y: 6 })).toBeNull();
    expect(telegraphTargetAt(state, null)).toBeNull();
  });
});
