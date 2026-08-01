import { describe, expect, it } from "vitest";
import { encounters, liveSpawns } from "../data/encounters";
import { addItem, useConsumable } from "../inventory";
import { createNewGame } from "../state";
import { moveSpeed } from "./grid";
import { PLAYER_COMBATANT_ID, createCombat } from "./setup";
import { combatStat, playerCombatant } from "./state";

/**
 * The default new game is a Gutter Courier: base Reflexes 7 (6 + 1
 * background), +1 from the Shard Knife and +1 from the Courier Slicker,
 * for an effective 9 — faster than every enemy in the data.
 */
function makeGame(seed = 7) {
  return createNewGame({ seed });
}

describe("createCombat", () => {
  it("gives every enemy the look its slot wears", () => {
    const combat = createCombat(makeGame(), "enc-rustyard-ambush");
    const looks = combat.combatants
      .filter((c) => c.kind === "enemy")
      .map((c) => c.lookIndex);
    // The ambush pins its two faces, so this is the encounter's call
    // rather than the seed's.
    expect(looks).toEqual([1, 2]);
  });

  it("resolves every slot's look the same way on every setup", () => {
    const first = createCombat(makeGame(1), "enc-spire-gate");
    // A different RNG seed must not move a single face: look variety is
    // seeded off the encounter and slot, never off the fight's dice.
    const second = createCombat(makeGame(999), "enc-spire-gate");
    const looksOf = (combat: typeof first) =>
      combat.combatants.map((c) => c.lookIndex ?? null);
    expect(looksOf(second)).toEqual(looksOf(first));
    for (const combatant of first.combatants) {
      if (combatant.kind !== "enemy") continue;
      expect(combatant.lookIndex, combatant.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("throws on an unknown encounter id", () => {
    expect(() => createCombat(makeGame(), "enc-nope")).toThrow(
      'No encounter with id "enc-nope"',
    );
  });

  it("snapshots the player from GameState equipment", () => {
    const combat = createCombat(makeGame(), "enc-auric-scout");
    const player = playerCombatant(combat);
    expect(player.id).toBe(PLAYER_COMBATANT_ID);
    expect(player.weapon).toEqual({
      name: "Shard Knife",
      damage: 4,
      rangeType: "melee",
    });
    expect(player.armor).toBe(2); // Courier Slicker
    expect(combatStat(player, "reflexes")).toBe(9);
    expect(player.hp).toBe(player.maxHp);
    expect(player.consumables).toEqual([]);
  });

  it("lists carried consumables (merged across stacks) on the player", () => {
    const state = makeGame();
    let inventory = addItem(state.inventory, "con-trauma-patch", 2);
    inventory = addItem(inventory, "con-surge-stim", 1);
    const combat = createCombat({ ...state, inventory }, "enc-auric-scout");
    expect(playerCombatant(combat).consumables).toEqual([
      { itemId: "con-trauma-patch", quantity: 2 },
      { itemId: "con-surge-stim", quantity: 1 },
    ]);
  });

  it("spawns enemies from the encounter at full hp on their tiles", () => {
    const combat = createCombat(makeGame(), "enc-auric-scout");
    const enemies = combat.combatants.filter((c) => c.kind === "enemy");
    expect(enemies.map((e) => e.enemyId)).toEqual([
      "nme-auric-agent",
      "nme-static-drone",
    ]);
    for (const enemy of enemies) {
      expect(enemy.hp).toBe(enemy.maxHp);
    }
    expect(enemies.map((e) => e.position)).toEqual([
      { x: 6, y: 2 },
      { x: 6, y: 4 },
    ]);
  });

  it("orders initiative by effective Reflexes, highest first", () => {
    const combat = createCombat(makeGame(), "enc-auric-scout");
    // player 9, static drone 8, auric agent 6
    expect(combat.initiativeOrder).toEqual([
      "player",
      "nme-static-drone-2",
      "nme-auric-agent-1",
    ]);
    expect(combat.turnIndex).toBe(0);
    expect(combat.round).toBe(1);
  });

  it("breaks Reflexes ties with the seeded RNG, deterministically", () => {
    const state = makeGame(123);
    // enc-rustyard-ambush spawns two identical bruisers (Reflexes 4).
    const first = createCombat(state, "enc-rustyard-ambush");
    const second = createCombat(state, "enc-rustyard-ambush");
    expect(first.initiativeOrder).toEqual(second.initiativeOrder);
    expect(first.initiativeOrder[0]).toBe("player");
    expect(first.initiativeOrder.slice(1).sort()).toEqual([
      "nme-rustyard-bruiser-1",
      "nme-rustyard-bruiser-2",
    ]);
    expect(first.rng).toEqual(second.rng);
    expect(first.rng).not.toEqual(state.rng);
  });

  it("gives the first combatant its move budget and opens the log", () => {
    const combat = createCombat(makeGame(), "enc-auric-scout");
    expect(combat.moveRemaining).toBe(moveSpeed(9));
    expect(combat.actionUsed).toBe(false);
    expect(combat.log).toEqual([
      { type: "combat-started", encounterId: "enc-auric-scout" },
      { type: "round-started", round: 1 },
      { type: "turn-started", combatantId: "player" },
    ]);
  });

  it("copies encounter fleeability onto the state", () => {
    expect(createCombat(makeGame(), "enc-auric-scout").fleeable).toBe(true);
    expect(createCombat(makeGame(), "enc-vault-guardian").fleeable).toBe(false);
  });

  it("survives a JSON round-trip unchanged", () => {
    const combat = createCombat(makeGame(), "enc-vault-guardian");
    expect(JSON.parse(JSON.stringify(combat))).toEqual(combat);
  });
});

/**
 * A body stood down before the fight. The only thing that writes one of
 * these flags today is a Breach run at a muster relay (see
 * src/data/breach.ts); what matters to the engine is that an absent
 * spawn changes nothing but its own presence.
 */
describe("what the player walks in with", () => {
  it("brings only what can be opened mid-fight", () => {
    const base = makeGame();
    const state = {
      ...base,
      inventory: [
        "con-trauma-patch",
        "con-surge-stim",
        // Neither of these is a thing anybody opens with a chassis
        // walking at them, so neither is in the fight's kit.
        "con-medic-roll",
        "con-cage-noodles",
      ].reduce((inv, id) => addItem(inv, id), base.inventory),
    };
    const combat = createCombat(state, "enc-rustyard-ambush");
    expect(
      playerCombatant(combat).consumables.map((stack) => stack.itemId).sort(),
    ).toEqual(["con-surge-stim", "con-trauma-patch"]);
  });

  it("starts the fight lifted by whatever was eaten before the door", () => {
    const base = makeGame();
    const fed = useConsumable(
      base.player,
      addItem(base.inventory, "con-cage-noodles"),
      "con-cage-noodles",
    );
    const combat = createCombat(
      { ...base, player: fed.character, inventory: fed.inventory },
      "enc-rustyard-ambush",
    );
    const player = playerCombatant(combat);
    expect(player.boosts).toEqual([
      { stat: "reflexes", amount: 1, turnsLeft: 4, family: "well-fed" },
    ]);
    // The lift is real from turn one, not a note on the sheet.
    expect(combatStat(player, "reflexes")).toBe(
      // Base 7 + knife 1 + slicker 1 + the meal.
      10,
    );
  });

  it("brings nothing extra for somebody who has not eaten", () => {
    const combat = createCombat(makeGame(), "enc-rustyard-ambush");
    expect(playerCombatant(combat).boosts).toEqual([]);
  });
});

describe("spawns a run has stood down", () => {
  const ENCOUNTER = "enc-exec-security";
  const DARK = "exec-muster-dark";

  function withFlag(value: boolean) {
    const state = makeGame(11);
    return createCombat(
      { ...state, flags: { ...state.flags, [DARK]: value } },
      ENCOUNTER,
    );
  }

  it("leaves the fight exactly as authored while the flag is unset", () => {
    const lit = createCombat(makeGame(11), ENCOUNTER);
    const off = withFlag(false);
    expect(off.combatants.map((c) => c.id)).toEqual(
      lit.combatants.map((c) => c.id),
    );
    expect(lit.combatants.some((c) => c.enemyId === "nme-static-drone")).toBe(
      true,
    );
  });

  it("takes the body off the board when the flag holds", () => {
    const dark = withFlag(true);
    expect(dark.combatants.some((c) => c.enemyId === "nme-static-drone")).toBe(
      false,
    );
    // Everybody else keeps their authored id and look, so the log and
    // the faces read identically with the drone gone.
    const lit = createCombat(makeGame(11), ENCOUNTER);
    const kept = lit.combatants.filter(
      (c) => c.enemyId !== "nme-static-drone",
    );
    expect(dark.combatants.map((c) => c.id)).toEqual(kept.map((c) => c.id));
    expect(dark.combatants.map((c) => c.lookIndex ?? null)).toEqual(
      kept.map((c) => c.lookIndex ?? null),
    );
    // And the fight still starts properly: somebody has the turn.
    expect(dark.status).toBe("active");
    expect(dark.initiativeOrder).toHaveLength(dark.combatants.length);
  });
});

/**
 * Content lint for the rule above: an advantage may empty a slot, never
 * the board. A fight with nobody in it cannot be won.
 */
describe("absent spawns never empty an encounter", () => {
  it("leaves at least one body in every fight, whatever a run has done", () => {
    for (const encounter of encounters) {
      const flags = Object.fromEntries(
        encounter.enemies.flatMap((spawn) =>
          spawn.absentWhenFlag === undefined
            ? []
            : [[spawn.absentWhenFlag, true] as const],
        ),
      );
      expect(liveSpawns(encounter, flags).length, encounter.id).toBeGreaterThan(
        0,
      );
    }
  });
});
