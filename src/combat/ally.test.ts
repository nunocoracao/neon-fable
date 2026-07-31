import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { getCompanion } from "../data/companions";
import { requireItem } from "../data/items";
import { createNewGame, recruitCompanion, type GameState } from "../state";
import { takeAction } from "./actions";
import { chooseEnemyAction, runEnemyTurns } from "./ai";
import {
  allyCombatant,
  allyCombatantId,
  allyStartTile,
  allyStats,
  companionIdOf,
} from "./ally";
import { resolveCombat } from "./outcome";
import { createCombat, PLAYER_COMBATANT_ID } from "./setup";
import {
  activeCombatant,
  allyCombatants,
  areOpposed,
  isPlayerControlled,
  livingCrew,
  requireCombatant,
} from "./state";
import { nextFloat } from "../state/rng";
import { makeCombat, makeCombatant } from "./testSupport";
import { CombatError, type CombatState } from "./types";
import { memberFrom } from "../state/party";

/**
 * Companions in a fight: they come in with the party, they take their
 * turns through the same actions the player's do, and being dropped
 * costs them the rest of that fight and nothing else.
 */

const ENCOUNTER_ID = "enc-quays-salvage";

/** Smallest seed whose first draw lands under every clamped hit chance. */
const HIT_SEED = ((): number => {
  for (let seed = 0; seed < 100_000; seed++) {
    if (nextFloat({ seed }).value < 0.05) return seed;
  }
  throw new Error("no seed found");
})();
const VESPER_ID = allyCombatantId("vesper");

function withVesper(seed = 11): GameState {
  const state = createNewGame({ character: fixtureCharacter({}), seed });
  return { ...state, party: recruitCompanion(state.party, "vesper") };
}

/** Winds the fight forward to the named combatant's turn. */
function turnOf(combat: CombatState, id: string): CombatState {
  let next = combat;
  for (let i = 0; i < 20 && activeCombatant(next).id !== id; i++) {
    next =
      activeCombatant(next).kind === "enemy"
        ? takeAction(next, chooseEnemyAction(next))
        : takeAction(next, { type: "end-turn" });
  }
  return next;
}

describe("allyCombatantId", () => {
  it("round-trips a companion id and ignores everybody else's", () => {
    expect(companionIdOf(allyCombatantId("vesper"))).toBe("vesper");
    expect(companionIdOf(PLAYER_COMBATANT_ID)).toBeNull();
    expect(companionIdOf("nme-vent-crawler-1")).toBeNull();
  });
});

describe("allyCombatant", () => {
  const member = memberFrom(getCompanion("vesper")!);

  it("derives its combat inputs from the member's own gear", () => {
    const ally = allyCombatant(member, { x: 2, y: 2 });
    const harness = requireItem("out-diver-harness");
    const hookline = requireItem("wpn-hookline");
    expect(ally.kind).toBe("ally");
    expect(ally.name).toBe("Vesper Kade");
    expect(ally.companionId).toBe("vesper");
    expect(ally.weapon).toEqual({
      name: hookline.name,
      damage: hookline.kind === "weapon" ? hookline.damage : 0,
      rangeType: hookline.kind === "weapon" ? hookline.rangeType : "melee",
    });
    expect(ally.armor).toBe(harness.kind === "outfit" ? harness.armor : 0);
    // The harness's tech mod lands on her the way it lands on a player.
    expect(allyStats(member, requireItem).tech).toBe(member.stats.tech + 1);
    expect(ally.consumables).toEqual([]);
  });

  it("brings a hurt companion in standing, never at zero", () => {
    const ally = allyCombatant({ ...member, hp: 0 }, { x: 0, y: 0 });
    expect(ally.hp).toBe(1);
  });

  it("names the id when a build has no content for the companion", () => {
    const ally = allyCombatant(
      { ...member, companionId: "ghost" },
      { x: 0, y: 0 },
    );
    expect(ally.name).toBe("ghost");
  });
});

describe("allyStartTile", () => {
  it("puts the companion on the nearest free tile to the player", () => {
    const player = makeCombatant({
      id: "player",
      kind: "player",
      position: { x: 1, y: 3 },
    });
    const tile = allyStartTile({ width: 9, height: 7 }, player.position, [
      player,
    ]);
    expect(tile).toEqual({ x: 1, y: 2 });
  });

  it("steps around whoever is already standing there", () => {
    const player = makeCombatant({
      id: "player",
      kind: "player",
      position: { x: 1, y: 3 },
    });
    const squatter = makeCombatant({ id: "foe", position: { x: 1, y: 2 } });
    const tile = allyStartTile({ width: 9, height: 7 }, player.position, [
      player,
      squatter,
    ]);
    expect(tile).not.toEqual({ x: 1, y: 2 });
    expect(tile).toEqual({ x: 0, y: 3 });
  });

  it("reports no room rather than standing on somebody", () => {
    const player = makeCombatant({
      id: "player",
      kind: "player",
      position: { x: 0, y: 0 },
    });
    expect(allyStartTile({ width: 1, height: 1 }, player.position, [player]))
      .toBeNull();
  });
});

describe("createCombat with a party", () => {
  it("brings the active companion into the fight beside the player", () => {
    const combat = createCombat(withVesper(), ENCOUNTER_ID);
    const ally = requireCombatant(combat, VESPER_ID);
    const player = requireCombatant(combat, PLAYER_COMBATANT_ID);
    expect(allyCombatants(combat)).toHaveLength(1);
    expect(ally.position).not.toEqual(player.position);
    expect(
      Math.abs(ally.position.x - player.position.x) +
        Math.abs(ally.position.y - player.position.y),
    ).toBe(1);
  });

  it("leaves a benched companion at home", () => {
    const state = withVesper();
    const benched: GameState = {
      ...state,
      party: {
        members: state.party.members.map((m) => ({ ...m, active: false })),
      },
    };
    expect(allyCombatants(createCombat(benched, ENCOUNTER_ID))).toEqual([]);
  });

  it("orders the companion into initiative on their own Reflexes", () => {
    const combat = createCombat(withVesper(), ENCOUNTER_ID);
    expect(combat.initiativeOrder).toContain(VESPER_ID);
    // Sorted by Reflexes, so a quicker body is ahead of a slower one.
    const byReflexes = [...combat.combatants].sort(
      (a, b) => b.stats.reflexes - a.stats.reflexes,
    );
    const first = byReflexes[0]!;
    const last = byReflexes[byReflexes.length - 1]!;
    expect(combat.initiativeOrder.indexOf(first.id)).toBeLessThan(
      combat.initiativeOrder.indexOf(last.id),
    );
  });

  it("changes nothing at all for a player with no party", () => {
    const solo = createNewGame({ character: fixtureCharacter({}), seed: 11 });
    const combat = createCombat(solo, ENCOUNTER_ID);
    expect(allyCombatants(combat)).toEqual([]);
    expect(combat.combatants.map((c) => c.id)).toEqual(
      createCombat(solo, ENCOUNTER_ID).combatants.map((c) => c.id),
    );
  });
});

describe("sides", () => {
  it("puts the player and their companion on one side of the fight", () => {
    const combat = createCombat(withVesper(), ENCOUNTER_ID);
    const player = requireCombatant(combat, PLAYER_COMBATANT_ID);
    const ally = requireCombatant(combat, VESPER_ID);
    const foe = combat.combatants.find((c) => c.kind === "enemy")!;
    expect(areOpposed(player, ally)).toBe(false);
    expect(areOpposed(ally, foe)).toBe(true);
    expect(isPlayerControlled(ally)).toBe(true);
    expect(livingCrew(combat).map((c) => c.id).sort()).toEqual(
      [PLAYER_COMBATANT_ID, VESPER_ID].sort(),
    );
  });

  it("refuses an attack on your own side", () => {
    const player = makeCombatant({
      id: "player",
      kind: "player",
      position: { x: 0, y: 0 },
    });
    const ally = makeCombatant({
      id: "ally:vesper",
      kind: "ally",
      position: { x: 1, y: 0 },
    });
    const combat = makeCombat([player, ally]);
    try {
      takeAction(combat, { type: "attack", targetId: "ally:vesper" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CombatError);
      expect((error as CombatError).code).toBe("invalid-target");
    }
  });
});

describe("the companion's turn", () => {
  it("is the player's to take: it moves and attacks through takeAction", () => {
    const combat = turnOf(createCombat(withVesper(), ENCOUNTER_ID), VESPER_ID);
    expect(activeCombatant(combat).id).toBe(VESPER_ID);
    expect(isPlayerControlled(activeCombatant(combat))).toBe(true);

    const from = requireCombatant(combat, VESPER_ID).position;
    const moved = takeAction(combat, {
      type: "move",
      to: { x: from.x + 1, y: from.y },
    });
    expect(requireCombatant(moved, VESPER_ID).position).toEqual({
      x: from.x + 1,
      y: from.y,
    });
  });

  it("is never handed to the enemy AI", () => {
    const combat = turnOf(createCombat(withVesper(), ENCOUNTER_ID), VESPER_ID);
    try {
      chooseEnemyAction(combat);
      expect.unreachable();
    } catch (error) {
      expect((error as CombatError).code).toBe("enemy-only");
    }
    // And the AI runner stops rather than playing her turn for her.
    expect(runEnemyTurns(combat)).toBe(combat);
  });

  it("cannot reach into the player's pockets or call the retreat", () => {
    const combat = turnOf(createCombat(withVesper(), ENCOUNTER_ID), VESPER_ID);
    for (const action of [
      { type: "use-item" as const, itemId: "con-trauma-patch" },
      { type: "flee" as const },
    ]) {
      try {
        takeAction(combat, action);
        expect.unreachable();
      } catch (error) {
        expect((error as CombatError).code).toBe("player-only");
      }
    }
  });
});

describe("a companion going down", () => {
  const player = makeCombatant({
    id: "player",
    kind: "player",
    position: { x: 0, y: 0 },
  });
  const ally = makeCombatant({
    id: "ally:vesper",
    kind: "ally",
    hp: 2,
    position: { x: 0, y: 1 },
  });
  const foe = makeCombatant({
    id: "foe",
    weapon: { name: "Maul", damage: 40, rangeType: "melee" },
    position: { x: 1, y: 1 },
  });

  it("does not end the fight — only the player's own defeat does", () => {
    const combat = makeCombat([player, ally, foe], {
      initiativeOrder: ["foe", "player", "ally:vesper"],
      turnIndex: 0,
      rng: { seed: HIT_SEED },
    });
    const struck = takeAction(combat, { type: "attack", targetId: "ally:vesper" });
    expect(requireCombatant(struck, "ally:vesper").hp).toBeLessThanOrEqual(0);
    expect(struck.status).toBe("active");
    expect(struck.log.some((e) => e.type === "combat-ended")).toBe(false);
  });

  it("benches them: the turn order skips them for the rest of the fight", () => {
    const combat = makeCombat([player, ally, foe], {
      initiativeOrder: ["foe", "player", "ally:vesper"],
      turnIndex: 0,
      rng: { seed: HIT_SEED },
    });
    let next = takeAction(combat, { type: "attack", targetId: "ally:vesper" });
    next = takeAction(next, { type: "end-turn" });
    expect(activeCombatant(next).id).toBe("player");
    next = takeAction(next, { type: "end-turn" });
    // Straight past the downed companion and back round to the enemy.
    expect(activeCombatant(next).id).toBe("foe");
    expect(next.log.some((e) => e.type === "defeated")).toBe(true);
  });

  it("costs them that fight and nothing after it", () => {
    const state = withVesper();
    const combat = createCombat(state, ENCOUNTER_ID);
    const downed: CombatState = {
      ...combat,
      status: "victory",
      combatants: combat.combatants.map((c) =>
        c.id === VESPER_ID ? { ...c, hp: 0 } : c,
      ),
    };
    const after = resolveCombat(state, downed);
    const member = after.party.members.find((m) => m.companionId === "vesper")!;
    expect(member.hp).toBe(1);
    expect(member.recruited).toBe(true);
    expect(member.active).toBe(true);
    // The next fight opens with her on her feet.
    expect(
      requireCombatant(createCombat(after, ENCOUNTER_ID), VESPER_ID).hp,
    ).toBe(1);
  });

  it("carries a companion's wounds out of the fight and back into the next", () => {
    const state = withVesper();
    const combat = createCombat(state, ENCOUNTER_ID);
    const hurt: CombatState = {
      ...combat,
      status: "victory",
      combatants: combat.combatants.map((c) =>
        c.id === VESPER_ID ? { ...c, hp: 9 } : c,
      ),
    };
    const after = resolveCombat(state, hurt);
    expect(
      after.party.members.find((m) => m.companionId === "vesper")!.hp,
    ).toBe(9);
    expect(
      requireCombatant(createCombat(after, ENCOUNTER_ID), VESPER_ID).hp,
    ).toBe(9);
  });
});

describe("enemy targeting", () => {
  it("goes for the nearest body on the player's side", () => {
    const player = makeCombatant({
      id: "player",
      kind: "player",
      position: { x: 0, y: 0 },
    });
    const ally = makeCombatant({
      id: "ally:vesper",
      kind: "ally",
      position: { x: 5, y: 0 },
    });
    const foe = makeCombatant({ id: "foe", position: { x: 6, y: 0 } });
    const combat = makeCombat([player, ally, foe], {
      initiativeOrder: ["foe", "player", "ally:vesper"],
    });
    expect(chooseEnemyAction(combat)).toEqual({
      type: "attack",
      targetId: "ally:vesper",
    });
  });

  it("falls back to the player once the companion is down", () => {
    const player = makeCombatant({
      id: "player",
      kind: "player",
      position: { x: 4, y: 0 },
    });
    const ally = makeCombatant({
      id: "ally:vesper",
      kind: "ally",
      hp: 0,
      position: { x: 5, y: 0 },
    });
    const foe = makeCombatant({ id: "foe", position: { x: 6, y: 0 } });
    const combat = makeCombat([player, ally, foe], {
      initiativeOrder: ["foe", "player"],
    });
    expect(chooseEnemyAction(combat)).toEqual({
      type: "move",
      to: { x: 5, y: 0 },
    });
  });
});
