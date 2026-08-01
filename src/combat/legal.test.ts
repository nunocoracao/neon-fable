import { describe, expect, it } from "vitest";
import {
  abilityOptions,
  attackOptions,
  fleeChanceFor,
  itemOptions,
  manhattanPath,
  reachableTiles,
} from "./legal";
import { hitChance, attackDamage, fleeChance } from "./damage";
import { makeCombat, makeCombatant } from "./testSupport";

const player = (over = {}) =>
  makeCombatant({ id: "player", kind: "player", position: { x: 2, y: 2 }, ...over });

describe("reachableTiles", () => {
  it("lists in-bounds tiles within the move budget, excluding the origin", () => {
    const state = makeCombat([player()], { moveRemaining: 1, grid: { width: 5, height: 5 } });
    expect(reachableTiles(state)).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
    ]);
  });

  it("excludes tiles under living combatants but not dead ones", () => {
    const state = makeCombat(
      [
        player(),
        makeCombatant({ id: "live", position: { x: 3, y: 2 } }),
        makeCombatant({ id: "dead", position: { x: 1, y: 2 }, hp: 0 }),
      ],
      { moveRemaining: 1, grid: { width: 5, height: 5 } },
    );
    expect(reachableTiles(state)).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
    ]);
  });

  it("is empty with no movement left or when combat is over", () => {
    expect(reachableTiles(makeCombat([player()], { moveRemaining: 0 }))).toEqual([]);
    expect(
      reachableTiles(makeCombat([player()], { moveRemaining: 3, status: "victory" })),
    ).toEqual([]);
  });

  it("respects grid bounds from a corner", () => {
    const state = makeCombat([player({ position: { x: 0, y: 0 } })], {
      moveRemaining: 1,
      grid: { width: 3, height: 3 },
    });
    expect(reachableTiles(state)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });
});

describe("attackOptions", () => {
  it("lists living opponents in range with engine hit chance and damage", () => {
    const enemy = makeCombatant({
      id: "foe",
      position: { x: 3, y: 2 },
      armor: 1,
      stats: { body: 5, reflexes: 7, tech: 5, cool: 5, intelligence: 5 },
    });
    const state = makeCombat([player(), enemy]);
    const [option] = attackOptions(state);
    expect(option).toEqual({
      targetId: "foe",
      distance: 1,
      hitChance: hitChance(5, 7),
      damage: attackDamage(player().weapon, 5, 1),
    });
  });

  it("excludes out-of-range, dead, and same-side combatants", () => {
    const state = makeCombat([
      player(), // melee, range 1
      makeCombatant({ id: "far", position: { x: 5, y: 2 } }),
      makeCombatant({ id: "dead", position: { x: 2, y: 3 }, hp: 0 }),
      makeCombatant({ id: "ally", kind: "player", position: { x: 1, y: 2 } }),
      makeCombatant({ id: "near", position: { x: 3, y: 2 } }),
    ]);
    expect(attackOptions(state).map((o) => o.targetId)).toEqual(["near"]);
  });

  it("uses ranged reach and Reflexes for ranged weapons", () => {
    const state = makeCombat([
      player({
        weapon: { name: "Pistol", damage: 5, rangeType: "ranged" },
        stats: { body: 3, reflexes: 8, tech: 5, cool: 5, intelligence: 5 },
      }),
      makeCombatant({ id: "far", position: { x: 2, y: 7 }, armor: 0 }),
    ]);
    const [option] = attackOptions(state);
    expect(option?.distance).toBe(5);
    expect(option?.hitChance).toBe(hitChance(8, 5));
    expect(option?.damage).toBe(attackDamage({ name: "Pistol", damage: 5, rangeType: "ranged" }, 8, 0));
  });

  it("is empty once the main action is spent", () => {
    const state = makeCombat(
      [player(), makeCombatant({ id: "foe", position: { x: 3, y: 2 } })],
      { actionUsed: true },
    );
    expect(attackOptions(state)).toEqual([]);
  });
});

describe("abilityOptions", () => {
  it("offers a damage ability's in-range opponents with computed damage", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-shock-dart"] }), // range 5, 4 dmg
      makeCombatant({ id: "near", position: { x: 4, y: 2 }, armor: 1 }),
      makeCombatant({ id: "far", position: { x: 2, y: 8 } }),
    ]);
    const [option] = abilityOptions(state);
    expect(option?.ready).toBe(true);
    expect(option?.selfTarget).toBe(false);
    expect(option?.targets).toEqual([{ targetId: "near", damage: 3, stunTurns: 0 }]);
  });

  it("ignores armor and reports stun turns per the ability data", () => {
    const state = makeCombat([
      player({ abilityIds: ["ability-crush", "ability-stun-strike"] }),
      makeCombatant({ id: "foe", position: { x: 3, y: 2 }, armor: 2 }),
    ]);
    const [crush, stun] = abilityOptions(state);
    expect(crush?.targets).toEqual([{ targetId: "foe", damage: 7, stunTurns: 0 }]);
    // Stun Strike's 2 damage is reduced by the armor of 2, floored at 1.
    expect(stun?.targets).toEqual([{ targetId: "foe", damage: 1, stunTurns: 1 }]);
  });

  it("targets self for boost abilities", () => {
    const state = makeCombat([player({ abilityIds: ["ability-combat-focus"] })]);
    const [option] = abilityOptions(state);
    expect(option?.selfTarget).toBe(true);
    expect(option?.targets).toEqual([{ targetId: "player", damage: 0, stunTurns: 0 }]);
  });

  it("reports cooldowns and offers no targets while not ready", () => {
    const state = makeCombat(
      [
        player({
          abilityIds: ["ability-shock-dart"],
          cooldowns: { "ability-shock-dart": 2 },
        }),
        makeCombatant({ id: "foe", position: { x: 3, y: 2 } }),
      ],
    );
    const [option] = abilityOptions(state);
    expect(option).toMatchObject({ cooldown: 2, ready: false, targets: [] });
  });

  it("is not ready once the main action is spent", () => {
    const state = makeCombat(
      [
        player({ abilityIds: ["ability-shock-dart"] }),
        makeCombatant({ id: "foe", position: { x: 3, y: 2 } }),
      ],
      { actionUsed: true },
    );
    expect(abilityOptions(state)[0]).toMatchObject({ ready: false, targets: [] });
  });
});

describe("itemOptions", () => {
  it("lists the player's carried consumables", () => {
    const state = makeCombat([
      player({ consumables: [{ itemId: "con-trauma-patch", quantity: 2 }] }),
    ]);
    expect(itemOptions(state)).toEqual([
      {
        itemId: "con-trauma-patch",
        quantity: 2,
        // Every option carries what it would do to this body, so the
        // button quoting it and the engine applying it are one figure.
        outcome: expect.objectContaining({
          itemId: "con-trauma-patch",
          heal: expect.any(Number),
        }),
      },
    ]);
  });

  it("prices each option against the body holding it", () => {
    const nearlyWhole = makeCombat([
      player({
        hp: 18,
        maxHp: 20,
        consumables: [{ itemId: "con-trauma-patch", quantity: 1 }],
      }),
    ]);
    expect(itemOptions(nearlyWhole)[0]?.outcome.heal).toBe(2);
    const bleeding = makeCombat([
      player({
        hp: 4,
        maxHp: 20,
        consumables: [{ itemId: "con-trauma-patch", quantity: 1 }],
      }),
    ]);
    expect(itemOptions(bleeding)[0]?.outcome.heal).toBe(10);
  });

  it("leaves out anything nobody opens mid-fight", () => {
    const state = makeCombat([
      player({
        consumables: [
          { itemId: "con-trauma-patch", quantity: 1 },
          { itemId: "con-medic-roll", quantity: 1 },
          { itemId: "con-cage-noodles", quantity: 2 },
        ],
      }),
    ]);
    expect(itemOptions(state).map((option) => option.itemId)).toEqual([
      "con-trauma-patch",
    ]);
  });

  it("is empty for enemies, spent actions, and empty packs", () => {
    expect(itemOptions(makeCombat([makeCombatant({ id: "foe" })]))).toEqual([]);
    expect(
      itemOptions(
        makeCombat(
          [player({ consumables: [{ itemId: "con-trauma-patch", quantity: 1 }] })],
          { actionUsed: true },
        ),
      ),
    ).toEqual([]);
    expect(itemOptions(makeCombat([player()]))).toEqual([]);
  });
});

describe("fleeChanceFor", () => {
  it("matches the engine flee chance against living enemies", () => {
    const state = makeCombat([
      player(),
      makeCombatant({ id: "a", stats: { body: 5, reflexes: 7, tech: 5, cool: 5, intelligence: 5 } }),
      makeCombatant({ id: "dead", hp: 0, stats: { body: 5, reflexes: 9, tech: 5, cool: 5, intelligence: 5 } }),
    ]);
    expect(fleeChanceFor(state)).toBe(fleeChance(5, [7]));
  });

  it("is null when not fleeable, action spent, or an enemy is acting", () => {
    expect(fleeChanceFor(makeCombat([player()], { fleeable: false }))).toBeNull();
    expect(fleeChanceFor(makeCombat([player()], { actionUsed: true }))).toBeNull();
    expect(fleeChanceFor(makeCombat([makeCombatant({ id: "foe" }), player()]))).toBeNull();
  });
});

describe("manhattanPath", () => {
  it("walks the dominant axis first, excluding start and including end", () => {
    expect(manhattanPath({ x: 0, y: 0 }, { x: 2, y: 1 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
    expect(manhattanPath({ x: 0, y: 0 }, { x: 1, y: -2 })).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: -2 },
      { x: 1, y: -2 },
    ]);
  });

  it("returns an empty path for the same tile", () => {
    expect(manhattanPath({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
  });

  it("always has length equal to the Manhattan distance", () => {
    expect(manhattanPath({ x: 1, y: 1 }, { x: 4, y: 3 })).toHaveLength(5);
  });
});
