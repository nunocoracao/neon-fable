import { describe, expect, it } from "vitest";
import { nextFloat } from "../state/rng";
import { takeAction } from "./actions";
import { CombatError, type CombatState } from "./types";
import { combatStat, getCombatant, playerCombatant } from "./state";
import { makeCombat, makeCombatant } from "./testSupport";

/**
 * Smallest seed whose first draw satisfies pred. Rolls below 0.05 land
 * under every clamped hit/flee chance (always hit/succeed); rolls at 0.95
 * or above sit at or over every ceiling (always miss/fail).
 */
function seedWhere(pred: (value: number) => boolean): number {
  for (let seed = 0; seed < 100_000; seed++) {
    if (pred(nextFloat({ seed }).value)) return seed;
  }
  throw new Error("no seed found");
}

const HIT_SEED = seedWhere((v) => v < 0.05);
const MISS_SEED = seedWhere((v) => v >= 0.95);

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof CombatError) return error.code;
    throw error;
  }
  throw new Error("expected a CombatError");
}

function duel(overrides: Partial<CombatState> = {}): CombatState {
  return makeCombat(
    [
      makeCombatant({ id: "player", kind: "player", position: { x: 1, y: 1 } }),
      makeCombatant({ id: "foe", position: { x: 2, y: 1 } }),
    ],
    overrides,
  );
}

/** A duel where the player has these consumables in reach. */
function carrying(...itemIds: string[]): CombatState {
  const state = duel();
  return {
    ...state,
    combatants: state.combatants.map((c) =>
      c.id === "player"
        ? {
            ...c,
            consumables: itemIds.map((itemId) => ({ itemId, quantity: 1 })),
          }
        : c,
    ),
  };
}

describe("move", () => {
  it("steps the actor and spends the move budget", () => {
    const state = duel({ moveRemaining: 3 });
    const next = takeAction(state, { type: "move", to: { x: 1, y: 3 } });
    expect(playerCombatant(next).position).toEqual({ x: 1, y: 3 });
    expect(next.moveRemaining).toBe(1);
    expect(next.log.at(-1)).toEqual({
      type: "moved",
      combatantId: "player",
      from: { x: 1, y: 1 },
      to: { x: 1, y: 3 },
    });
  });

  it("allows several moves per turn until the budget runs out", () => {
    let state = duel({ moveRemaining: 3 });
    state = takeAction(state, { type: "move", to: { x: 1, y: 2 } });
    state = takeAction(state, { type: "move", to: { x: 1, y: 4 } });
    expect(state.moveRemaining).toBe(0);
    expect(
      code(() => takeAction(state, { type: "move", to: { x: 1, y: 5 } })),
    ).toBe("invalid-move");
  });

  it("rejects moves beyond the budget, off-grid, onto tiles, or in place", () => {
    const state = duel({ moveRemaining: 2 });
    expect(
      code(() => takeAction(state, { type: "move", to: { x: 1, y: 4 } })),
    ).toBe("invalid-move"); // 3 steps > 2 budget
    expect(
      code(() => takeAction(state, { type: "move", to: { x: -1, y: 1 } })),
    ).toBe("invalid-move");
    expect(
      code(() => takeAction(state, { type: "move", to: { x: 2, y: 1 } })),
    ).toBe("invalid-move"); // foe stands there
    expect(
      code(() => takeAction(state, { type: "move", to: { x: 1, y: 1 } })),
    ).toBe("invalid-move");
  });

  it("allows moving onto a defeated combatant's tile", () => {
    let state = duel({ moveRemaining: 2 });
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe" ? { ...c, hp: 0 } : c,
      ),
    };
    const next = takeAction(state, { type: "move", to: { x: 2, y: 1 } });
    expect(playerCombatant(next).position).toEqual({ x: 2, y: 1 });
  });
});

describe("attack", () => {
  it("melee needs adjacency", () => {
    let state = duel();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe" ? { ...c, position: { x: 3, y: 1 } } : c,
      ),
    };
    expect(code(() => takeAction(state, { type: "attack", targetId: "foe" }))).toBe(
      "out-of-range",
    );
  });

  it("ranged reaches 5 tiles but not 6", () => {
    const ranged = { name: "Test Pistol", damage: 5, rangeType: "ranged" as const };
    const at = (x: number, seed: number) =>
      makeCombat(
        [
          makeCombatant({
            id: "player",
            kind: "player",
            weapon: ranged,
            position: { x: 0, y: 0 },
          }),
          makeCombatant({ id: "foe", position: { x, y: 0 } }),
        ],
        { rng: { seed } },
      );
    expect(() =>
      takeAction(at(5, HIT_SEED), { type: "attack", targetId: "foe" }),
    ).not.toThrow();
    expect(
      code(() => takeAction(at(6, HIT_SEED), { type: "attack", targetId: "foe" })),
    ).toBe("out-of-range");
  });

  it("a hit deals weapon + stat bonus minus armor, and advances the RNG", () => {
    let state = duel({ rng: { seed: HIT_SEED } });
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe" ? { ...c, armor: 2 } : c,
      ),
    };
    // Body 5 → +0 bonus; blade 4 - armor 2 = 2 damage.
    const next = takeAction(state, { type: "attack", targetId: "foe" });
    expect(getCombatant(next, "foe")!.hp).toBe(18);
    expect(next.actionUsed).toBe(true);
    expect(next.rng).not.toEqual(state.rng);
    expect(next.log.at(-1)).toEqual({
      type: "attacked",
      attackerId: "player",
      targetId: "foe",
      hit: true,
      damage: 2,
    });
  });

  it("armor never reduces a landed hit below 1 damage", () => {
    let state = duel({ rng: { seed: HIT_SEED } });
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe" ? { ...c, armor: 99 } : c,
      ),
    };
    const next = takeAction(state, { type: "attack", targetId: "foe" });
    expect(getCombatant(next, "foe")!.hp).toBe(19);
  });

  it("a miss deals nothing but still spends the action", () => {
    const state = duel({ rng: { seed: MISS_SEED } });
    const next = takeAction(state, { type: "attack", targetId: "foe" });
    expect(getCombatant(next, "foe")!.hp).toBe(20);
    expect(next.actionUsed).toBe(true);
    expect(next.log.at(-1)).toEqual({
      type: "attacked",
      attackerId: "player",
      targetId: "foe",
      hit: false,
      damage: 0,
    });
  });

  it("only one main action per turn", () => {
    const state = duel({ rng: { seed: MISS_SEED } });
    const next = takeAction(state, { type: "attack", targetId: "foe" });
    expect(code(() => takeAction(next, { type: "attack", targetId: "foe" }))).toBe(
      "action-used",
    );
  });

  it("rejects dead targets and friendly fire", () => {
    let state = duel();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe" ? { ...c, hp: 0 } : c,
      ),
    };
    expect(code(() => takeAction(state, { type: "attack", targetId: "foe" }))).toBe(
      "invalid-target",
    );
    expect(
      code(() => takeAction(duel(), { type: "attack", targetId: "player" })),
    ).toBe("invalid-target");
  });

  it("killing the last enemy ends combat in victory", () => {
    let state = duel({ rng: { seed: HIT_SEED } });
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "foe" ? { ...c, hp: 1 } : c,
      ),
    };
    const next = takeAction(state, { type: "attack", targetId: "foe" });
    expect(next.status).toBe("victory");
    expect(next.log.at(-2)).toEqual({ type: "defeated", combatantId: "foe" });
    expect(next.log.at(-1)).toEqual({ type: "combat-ended", result: "victory" });
    expect(code(() => takeAction(next, { type: "end-turn" }))).toBe("combat-over");
  });

  it("the player dropping to 0 hp ends combat in defeat", () => {
    let state = duel({ rng: { seed: HIT_SEED }, turnIndex: 1 });
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "player" ? { ...c, hp: 1 } : c,
      ),
    };
    const next = takeAction(state, { type: "attack", targetId: "player" });
    expect(next.status).toBe("defeat");
    expect(next.log.at(-1)).toEqual({ type: "combat-ended", result: "defeat" });
  });
});

describe("use-item", () => {
  it("healing consumes the item, heals capped at maxHp, and records use", () => {
    let state = duel();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "player"
          ? {
              ...c,
              hp: 14,
              consumables: [{ itemId: "con-trauma-patch", quantity: 2 }],
            }
          : c,
      ),
    };
    const next = takeAction(state, {
      type: "use-item",
      itemId: "con-trauma-patch",
    });
    const player = playerCombatant(next);
    expect(player.hp).toBe(20); // +10 capped at maxHp 20
    expect(player.consumables).toEqual([
      { itemId: "con-trauma-patch", quantity: 1 },
    ]);
    expect(next.itemsConsumed).toEqual([
      { itemId: "con-trauma-patch", quantity: 1 },
    ]);
    expect(next.actionUsed).toBe(true);
    expect(next.log.at(-1)).toEqual({
      type: "healed",
      combatantId: "player",
      amount: 6,
    });
  });

  it("a boost consumable raises the stat for its duration", () => {
    let state = duel();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "player"
          ? { ...c, consumables: [{ itemId: "con-surge-stim", quantity: 1 }] }
          : c,
      ),
    };
    const next = takeAction(state, { type: "use-item", itemId: "con-surge-stim" });
    const player = playerCombatant(next);
    expect(combatStat(player, "reflexes")).toBe(7); // 5 + 2
    expect(player.boosts).toEqual([
      {
        stat: "reflexes",
        amount: 2,
        turnsLeft: 3,
        family: "reflex-stim",
        // The bill, carried on the lift that owes it.
        after: { stat: "reflexes", amount: -1, turns: 2 },
      },
    ]);
    expect(player.consumables).toEqual([]);
  });

  it("rejects items the player does not carry, and enemy item use", () => {
    expect(
      code(() =>
        takeAction(duel(), { type: "use-item", itemId: "con-trauma-patch" }),
      ),
    ).toBe("no-item");
    expect(
      code(() =>
        takeAction(duel({ turnIndex: 1 }), {
          type: "use-item",
          itemId: "con-trauma-patch",
        }),
      ),
    ).toBe("player-only");
  });

  it("refuses a kit nobody opens mid-fight, even when it is in the pack", () => {
    // The snapshot normally filters these out (see playerConsumables);
    // the engine still refuses one, so a hand-built state cannot smuggle
    // a twenty-minute dressing into a firefight.
    const state = carrying("con-medic-roll");
    expect(
      code(() => takeAction(state, { type: "use-item", itemId: "con-medic-roll" })),
    ).toBe("wrong-context");
  });

  it("hands the crash back when the lift runs out, and says so", () => {
    let state = takeAction(carrying("con-surge-stim"), {
      type: "use-item",
      itemId: "con-surge-stim",
    });
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(7);
    // Three of the player's own turns of lift, then the bill.
    for (let i = 0; i < 3; i++) {
      state = takeAction(state, { type: "end-turn" });
      state = takeAction(state, { type: "end-turn" });
    }
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(4);
    expect(state.log).toContainEqual({
      type: "crashed",
      combatantId: "player",
      stat: "reflexes",
      amount: -1,
      turns: 2,
    });
    // And the bill runs out too.
    for (let i = 0; i < 2; i++) {
      state = takeAction(state, { type: "end-turn" });
      state = takeAction(state, { type: "end-turn" });
    }
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(5);
  });

  it("replaces a running dose of the same family instead of stacking it", () => {
    let state = carrying("con-kick-stim", "con-redline-amp");
    state = takeAction(state, { type: "use-item", itemId: "con-kick-stim" });
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(6);
    state = { ...state, actionUsed: false };
    state = takeAction(state, { type: "use-item", itemId: "con-redline-amp" });
    // 5 + 3, not 5 + 1 + 3: one nerve, one lift.
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(8);
    expect(playerCombatant(state).boosts).toHaveLength(1);
  });

  it("lets lifts on different nerves run together", () => {
    let state = carrying("con-surge-stim", "con-hammerhead");
    state = takeAction(state, { type: "use-item", itemId: "con-surge-stim" });
    state = takeAction(
      { ...state, actionUsed: false },
      { type: "use-item", itemId: "con-hammerhead" },
    );
    const player = playerCombatant(state);
    expect(combatStat(player, "reflexes")).toBe(7);
    expect(combatStat(player, "body")).toBe(7);
  });

  it("settles a body: the crash bled off and the chrome's clock restarted", () => {
    let state = carrying("con-surge-stim", "con-wake-sugar");
    state = takeAction(state, { type: "use-item", itemId: "con-surge-stim" });
    for (let i = 0; i < 3; i++) {
      state = takeAction(state, { type: "end-turn" });
      state = takeAction(state, { type: "end-turn" });
    }
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(4);

    // Chrome one turn from going off, and a crash already being carried.
    state = {
      ...state,
      surge: { combatantId: "player", charge: 3, armed: true, spent: false },
    };
    state = takeAction(state, { type: "use-item", itemId: "con-wake-sugar" });
    expect(playerCombatant(state).boosts).toEqual([]);
    expect(combatStat(playerCombatant(state), "reflexes")).toBe(5);
    // Restarted rather than spent: the noise still has to be answered,
    // it simply has three more turns to build in.
    expect(state.surge).toMatchObject({ charge: 0, armed: false, spent: false });
    expect(state.log.at(-1)).toEqual({ type: "settled", combatantId: "player" });
  });
});

describe("use-ability", () => {
  function withAbility(abilityId: string, foeArmor = 0): CombatState {
    return makeCombat([
      makeCombatant({
        id: "player",
        kind: "player",
        abilityIds: [abilityId],
        position: { x: 1, y: 1 },
      }),
      makeCombatant({ id: "foe", armor: foeArmor, position: { x: 2, y: 1 } }),
    ]);
  }

  it("damage abilities hit without a roll, stun, and start their cooldown", () => {
    const state = withAbility("ability-stun-strike", 1);
    const next = takeAction(state, {
      type: "use-ability",
      abilityId: "ability-stun-strike",
      targetId: "foe",
    });
    const foe = getCombatant(next, "foe")!;
    expect(foe.hp).toBe(19); // 2 - 1 armor, min 1
    expect(foe.stunTurns).toBe(1);
    expect(playerCombatant(next).cooldowns["ability-stun-strike"]).toBe(3);
    expect(next.actionUsed).toBe(true);
    expect(next.log.at(-1)).toEqual({
      type: "ability-used",
      combatantId: "player",
      abilityId: "ability-stun-strike",
      targetId: "foe",
      damage: 1,
      stunTurns: 1,
    });
  });

  it("armor-ignoring abilities skip the armor reduction", () => {
    const state = withAbility("ability-crush", 5);
    const next = takeAction(state, {
      type: "use-ability",
      abilityId: "ability-crush",
      targetId: "foe",
    });
    expect(getCombatant(next, "foe")!.hp).toBe(13); // full 7
  });

  it("boost abilities target self and apply the boost", () => {
    const state = withAbility("ability-combat-focus");
    const next = takeAction(state, {
      type: "use-ability",
      abilityId: "ability-combat-focus",
      targetId: "player",
    });
    expect(combatStat(playerCombatant(next), "reflexes")).toBe(7);
    expect(
      code(() =>
        takeAction({ ...state }, {
          type: "use-ability",
          abilityId: "ability-combat-focus",
          targetId: "foe",
        }),
      ),
    ).toBe("invalid-target");
  });

  it("enforces ownership, cooldown, and range", () => {
    expect(
      code(() =>
        takeAction(duel(), {
          type: "use-ability",
          abilityId: "ability-crush",
          targetId: "foe",
        }),
      ),
    ).toBe("unknown-ability");

    const used = takeAction(withAbility("ability-stun-strike"), {
      type: "use-ability",
      abilityId: "ability-stun-strike",
      targetId: "foe",
    });
    // Free the action again; only the cooldown should now block it.
    const retry = { ...used, actionUsed: false };
    expect(
      code(() =>
        takeAction(retry, {
          type: "use-ability",
          abilityId: "ability-stun-strike",
          targetId: "foe",
        }),
      ),
    ).toBe("ability-on-cooldown");

    let far = withAbility("ability-stun-strike");
    far = {
      ...far,
      combatants: far.combatants.map((c) =>
        c.id === "foe" ? { ...c, position: { x: 5, y: 5 } } : c,
      ),
    };
    expect(
      code(() =>
        takeAction(far, {
          type: "use-ability",
          abilityId: "ability-stun-strike",
          targetId: "foe",
        }),
      ),
    ).toBe("out-of-range");
  });
});

describe("flee", () => {
  it("a successful roll ends combat as fled", () => {
    const next = takeAction(duel({ rng: { seed: HIT_SEED } }), { type: "flee" });
    expect(next.status).toBe("fled");
    expect(next.log.at(-2)).toEqual({
      type: "flee-attempted",
      combatantId: "player",
      success: true,
    });
    expect(next.log.at(-1)).toEqual({ type: "combat-ended", result: "fled" });
  });

  it("a failed roll spends the action and combat continues", () => {
    const next = takeAction(duel({ rng: { seed: MISS_SEED } }), { type: "flee" });
    expect(next.status).toBe("active");
    expect(next.actionUsed).toBe(true);
    expect(next.log.at(-1)).toEqual({
      type: "flee-attempted",
      combatantId: "player",
      success: false,
    });
  });

  it("is blocked in unfleeable encounters and for enemies", () => {
    expect(code(() => takeAction(duel({ fleeable: false }), { type: "flee" }))).toBe(
      "cannot-flee",
    );
    expect(code(() => takeAction(duel({ turnIndex: 1 }), { type: "flee" }))).toBe(
      "player-only",
    );
  });
});

describe("end-turn and rounds", () => {
  it("passes to the next combatant with a fresh move budget", () => {
    const state = duel({ moveRemaining: 0, actionUsed: true });
    const next = takeAction(state, { type: "end-turn" });
    expect(next.turnIndex).toBe(1);
    expect(next.round).toBe(1);
    expect(next.actionUsed).toBe(false);
    expect(next.moveRemaining).toBe(3); // foe Reflexes 5 → 2 + 1
    expect(next.log.at(-1)).toEqual({
      type: "turn-started",
      combatantId: "foe",
    });
  });

  it("wrapping the order starts a new round", () => {
    let state = duel();
    state = takeAction(state, { type: "end-turn" }); // player -> foe
    state = takeAction(state, { type: "end-turn" }); // foe -> player, round 2
    expect(state.round).toBe(2);
    expect(state.turnIndex).toBe(0);
    expect(state.log.at(-2)).toEqual({ type: "round-started", round: 2 });
  });

  it("skips dead combatants and burns stun turns", () => {
    let state = makeCombat([
      makeCombatant({ id: "player", kind: "player", position: { x: 0, y: 0 } }),
      makeCombatant({ id: "dead", hp: 0, position: { x: 3, y: 3 } }),
      makeCombatant({ id: "stunned", stunTurns: 1, position: { x: 5, y: 5 } }),
    ]);
    state = takeAction(state, { type: "end-turn" });
    // dead is skipped silently, stunned loses its turn, back to the player.
    expect(state.turnIndex).toBe(0);
    expect(state.round).toBe(2);
    expect(getCombatant(state, "stunned")!.stunTurns).toBe(0);
    expect(state.log.at(-3)).toEqual({
      type: "stun-skipped",
      combatantId: "stunned",
    });
    expect(state.log.at(-2)).toEqual({ type: "round-started", round: 2 });
  });

  it("expires the outgoing combatant's boosts and ticks cooldowns", () => {
    let state = duel();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "player"
          ? {
              ...c,
              boosts: [{ stat: "reflexes" as const, amount: 2, turnsLeft: 1 }],
              cooldowns: { "ability-crush": 2 },
            }
          : c,
      ),
    };
    const next = takeAction(state, { type: "end-turn" });
    const player = playerCombatant(next);
    expect(player.boosts).toEqual([]);
    expect(player.cooldowns["ability-crush"]).toBe(1);
  });
});

describe("area abilities", () => {
  /** A player with the arc, two enemies pressed together, one clear. */
  function crowd(): CombatState {
    return makeCombat([
      makeCombatant({
        id: "player",
        kind: "player",
        position: { x: 1, y: 1 },
        abilityIds: ["ability-stun-strike"],
      }),
      makeCombatant({ id: "aimed", position: { x: 2, y: 1 } }),
      makeCombatant({ id: "beside", position: { x: 3, y: 1 } }),
      makeCombatant({ id: "clear", position: { x: 6, y: 6 } }),
    ]);
  }

  it("damages and stuns everyone the shape covers, not only the aim", () => {
    const state = takeAction(crowd(), {
      type: "use-ability",
      abilityId: "ability-stun-strike",
      targetId: "aimed",
    });
    // Stun Strike is a blast of radius 1: the tile beside the aim is in.
    expect(getCombatant(state, "aimed")!.hp).toBe(18);
    expect(getCombatant(state, "beside")!.hp).toBe(18);
    expect(getCombatant(state, "aimed")!.stunTurns).toBe(1);
    expect(getCombatant(state, "beside")!.stunTurns).toBe(1);
    // And a body outside the shape is untouched.
    expect(getCombatant(state, "clear")!.hp).toBe(20);
    expect(getCombatant(state, "clear")!.stunTurns).toBe(0);
  });

  it("logs one blow per body, the aimed one first", () => {
    const state = takeAction(crowd(), {
      type: "use-ability",
      abilityId: "ability-stun-strike",
      targetId: "aimed",
    });
    const used = state.log.filter((e) => e.type === "ability-used");
    expect(used.map((e) => (e.type === "ability-used" ? e.targetId : ""))).toEqual([
      "aimed",
      "beside",
    ]);
  });

  it("still spends one action and one cooldown, however many it caught", () => {
    const state = takeAction(crowd(), {
      type: "use-ability",
      abilityId: "ability-stun-strike",
      targetId: "aimed",
    });
    expect(state.actionUsed).toBe(true);
    expect(playerCombatant(state).cooldowns["ability-stun-strike"]).toBe(3);
  });

  it("reports every body it put down", () => {
    const frail = makeCombat([
      makeCombatant({
        id: "player",
        kind: "player",
        position: { x: 1, y: 1 },
        abilityIds: ["ability-stun-strike"],
      }),
      makeCombatant({ id: "aimed", hp: 1, position: { x: 2, y: 1 } }),
      makeCombatant({ id: "beside", hp: 1, position: { x: 3, y: 1 } }),
    ]);
    const state = takeAction(frail, {
      type: "use-ability",
      abilityId: "ability-stun-strike",
      targetId: "aimed",
    });
    const defeated = state.log
      .filter((e) => e.type === "defeated")
      .map((e) => (e.type === "defeated" ? e.combatantId : ""));
    expect(defeated).toEqual(["aimed", "beside"]);
    expect(state.status).toBe("victory");
  });

  it("leaves an ability with no shape hitting exactly what it was aimed at", () => {
    const state = takeAction(
      makeCombat([
        makeCombatant({
          id: "player",
          kind: "player",
          position: { x: 1, y: 1 },
          abilityIds: ["ability-crush"],
        }),
        makeCombatant({ id: "aimed", position: { x: 2, y: 1 } }),
        makeCombatant({ id: "beside", position: { x: 3, y: 1 } }),
      ]),
      { type: "use-ability", abilityId: "ability-crush", targetId: "aimed" },
    );
    expect(getCombatant(state, "aimed")!.hp).toBe(13);
    expect(getCombatant(state, "beside")!.hp).toBe(20);
  });

  it("spares the caster's own side under its own blast", () => {
    const state = takeAction(
      makeCombat([
        makeCombatant({
          id: "player",
          kind: "player",
          position: { x: 1, y: 1 },
          abilityIds: ["ability-stun-strike"],
        }),
        makeCombatant({
          id: "ally",
          kind: "player",
          position: { x: 2, y: 2 },
        }),
        makeCombatant({ id: "aimed", position: { x: 2, y: 1 } }),
      ]),
      {
        type: "use-ability",
        abilityId: "ability-stun-strike",
        targetId: "aimed",
      },
    );
    expect(getCombatant(state, "ally")!.hp).toBe(20);
  });
});
