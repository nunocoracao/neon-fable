import { describe, expect, it } from "vitest";
import { requireAbility } from "../data/abilities";
import { takeAction } from "./actions";
import {
  chargeImpact,
  isCharged,
  isUnderThreat,
  pendingCharges,
  threatenedTiles,
  windUpTurns,
} from "./charge";
import { makeCombat, makeCombatant } from "./testSupport";
import { threatTiles } from "./telegraph";
import type { CombatState, GridPosition } from "./types";

/**
 * Charged attacks: declared on one turn, thrown on the next, at the
 * ground rather than at the body. The properties that make it fair are
 * the ones under test — the shape is frozen when it is called, the tiles
 * are marked from that instant, stepping off them beats it, and stunning
 * the caster holds it rather than cancelling it.
 */

const at = (x: number, y: number): GridPosition => ({ x, y });
const VOLLEY = "ability-shoulder-volley";
const key = (t: GridPosition): string => `${t.x},${t.y}`;

/**
 * A 9×7 arena with the chassis acting first. The player is dead level
 * with the chassis's anchor row so the lane runs straight down it.
 */
function arena(overrides: Partial<CombatState> = {}): CombatState {
  const chassis = makeCombatant({
    id: "chassis",
    name: "Chassis",
    position: at(6, 3),
    footprint: { width: 2, height: 2 },
    maxHp: 40,
    hp: 40,
    armor: 4,
    stats: { body: 9, reflexes: 4, tech: 4, cool: 5, intelligence: 3 },
    weapon: { name: "Piston", damage: 7, rangeType: "melee" },
    abilityIds: [VOLLEY],
  });
  const player = makeCombatant({
    id: "player",
    kind: "player",
    name: "You",
    position: at(1, 3),
    maxHp: 30,
    hp: 30,
    armor: 2,
    stats: { body: 6, reflexes: 8, tech: 5, cool: 5, intelligence: 5 },
    weapon: { name: "Spitter", damage: 6, rangeType: "ranged" },
  });
  return makeCombat([chassis, player], {
    grid: { width: 9, height: 7 },
    initiativeOrder: ["chassis", "player"],
    turnIndex: 0,
    moveRemaining: 3,
    ...overrides,
  });
}

/** Declare the volley, then hand the turn back round to the chassis. */
function declared(state = arena()): CombatState {
  return takeAction(state, {
    type: "use-ability",
    abilityId: VOLLEY,
    targetId: "player",
  });
}

/**
 * End turns until the named combatant is acting again — always at least
 * one, so calling it on that combatant's own turn takes the fight all
 * the way round rather than answering immediately.
 */
function passTo(state: CombatState, id: string): CombatState {
  let next = takeAction(state, { type: "end-turn" });
  for (let i = 0; i < 8; i++) {
    if (
      next.status !== "active" ||
      next.initiativeOrder[next.turnIndex] === id
    ) {
      return next;
    }
    next = takeAction(next, { type: "end-turn" });
  }
  throw new Error(`never got back round to "${id}"`);
}

describe("windUpTurns", () => {
  it("reads a plain ability as thrown on the spot", () => {
    expect(windUpTurns(requireAbility("ability-crush"))).toBe(0);
    expect(isCharged(requireAbility("ability-crush"))).toBe(false);
  });

  it("reads a charged one as a turn away", () => {
    expect(windUpTurns(requireAbility(VOLLEY))).toBe(1);
    expect(isCharged(requireAbility(VOLLEY))).toBe(true);
  });
});

describe("declaring", () => {
  it("spends the action, deals nothing, and marks the ground", () => {
    const state = declared();
    const chassis = state.combatants.find((c) => c.id === "chassis")!;
    const player = state.combatants.find((c) => c.id === "player")!;
    expect(state.actionUsed).toBe(true);
    expect(player.hp).toBe(30);
    expect(chassis.charge).toMatchObject({
      abilityId: VOLLEY,
      targetId: "player",
      turnsLeft: 1,
    });
    expect(state.log.at(-1)).toEqual({
      type: "charge-started",
      combatantId: "chassis",
      abilityId: VOLLEY,
      targetId: "player",
      turns: 1,
    });
  });

  it("freezes the lane it will land on, caster tile excluded", () => {
    const state = declared();
    const tiles = threatenedTiles(state).map(key);
    // A line ability walks the path from the caster's anchor to the
    // target's tile, dominant axis first: five columns of row 3.
    expect(tiles).toEqual(["5,3", "4,3", "3,3", "2,3", "1,3"]);
    expect(pendingCharges(state)).toHaveLength(1);
  });

  it("tints the frozen lane whatever the player has open", () => {
    const state = declared();
    const threat = threatTiles(state).map((t) => t.role);
    expect(threat.length).toBeGreaterThan(0);
    expect(new Set(threat)).toEqual(new Set(["threat"]));
  });

  it("says who is standing in it", () => {
    const state = declared();
    const chassis = state.combatants.find((c) => c.id === "chassis")!;
    const player = state.combatants.find((c) => c.id === "player")!;
    expect(isUnderThreat(state, player)).toBe(true);
    // Its own lane is not a threat to the thing that called it.
    expect(isUnderThreat(state, chassis)).toBe(false);
  });
});

describe("releasing", () => {
  it("fires at the start of the caster's next turn", () => {
    const fired = passTo(declared(), "chassis");
    const player = fired.combatants.find((c) => c.id === "player")!;
    const chassis = fired.combatants.find((c) => c.id === "chassis")!;
    expect(chassis.charge ?? null).toBeNull();
    // 7 damage less the player's 2 armor.
    expect(player.hp).toBe(30 - 5);
    expect(fired.log.some((e) => e.type === "charge-released")).toBe(true);
    expect(
      fired.log.some(
        (e) => e.type === "ability-used" && e.targetId === "player",
      ),
    ).toBe(true);
  });

  it("spends the turn's action, so the caster does not also swing", () => {
    const fired = passTo(declared(), "chassis");
    expect(fired.actionUsed).toBe(true);
  });

  it("clears the marked ground once it has gone off", () => {
    const fired = passTo(declared(), "chassis");
    expect(threatenedTiles(fired)).toEqual([]);
    expect(threatTiles(fired)).toEqual([]);
  });

  it("catches nobody when the body it was aimed at walked out of it", () => {
    let state = declared();
    state = takeAction(state, { type: "end-turn" });
    // The player's own turn: one step off the lane it is standing in.
    state = takeAction(state, { type: "move", to: at(1, 2) });
    const fired = passTo(state, "chassis");
    const player = fired.combatants.find((c) => c.id === "player")!;
    expect(player.hp).toBe(30);
    expect(fired.log).toContainEqual({
      type: "charge-released",
      combatantId: "chassis",
      abilityId: VOLLEY,
      bodies: 0,
    });
    expect(
      fired.log.some(
        (e) => e.type === "ability-used" && e.abilityId === VOLLEY,
      ),
    ).toBe(false);
  });

  it("catches whoever walked into it, aimed at or not", () => {
    // A bystander starting off the lane, walked onto it before it fires.
    const base = arena();
    const bystander = makeCombatant({
      id: "ally",
      kind: "player",
      name: "Ally",
      position: at(3, 1),
      armor: 0,
      maxHp: 20,
      hp: 20,
    });
    const withAlly: CombatState = {
      ...base,
      combatants: [...base.combatants, bystander],
      initiativeOrder: ["chassis", "player", "ally"],
    };
    let next = declared(withAlly);
    next = takeAction(next, { type: "end-turn" }); // player's turn
    next = takeAction(next, { type: "end-turn" }); // ally's turn
    next = takeAction(next, { type: "move", to: at(3, 3) });
    const fired = passTo(next, "chassis");
    const ally = fired.combatants.find((c) => c.id === "ally")!;
    expect(ally.hp).toBe(20 - 7);
  });

  it("reports the aimed body first among everyone it caught", () => {
    const base = arena();
    const bystander = makeCombatant({
      id: "ally",
      kind: "player",
      name: "Ally",
      position: at(3, 3),
    });
    const withAlly: CombatState = {
      ...base,
      combatants: [...base.combatants, bystander],
      initiativeOrder: ["chassis", "player", "ally"],
    };
    const state = declared(withAlly);
    const chassis = state.combatants.find((c) => c.id === "chassis")!;
    expect(chargeImpact(state, chassis, chassis.charge!).map((c) => c.id)).toEqual(
      ["player", "ally"],
    );
  });

  it("holds rather than cancels when the caster is stunned", () => {
    let state = declared();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "chassis" ? { ...c, stunTurns: 1 } : c,
      ),
    };
    // Chassis ends its turn -> player acts -> player ends: the chassis's
    // next turn is burned by the stun, and the lane is still promised.
    state = takeAction(state, { type: "end-turn" });
    state = takeAction(state, { type: "end-turn" });
    expect(state.log.some((e) => e.type === "stun-skipped")).toBe(true);
    expect(state.log.some((e) => e.type === "charge-released")).toBe(false);
    expect(threatenedTiles(state).length).toBeGreaterThan(0);
    // The turn after that it fires, a round late.
    const fired = takeAction(state, { type: "end-turn" });
    expect(fired.log.some((e) => e.type === "charge-released")).toBe(true);
  });

  it("goes down with the caster", () => {
    let state = declared();
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.id === "chassis" ? { ...c, hp: 0 } : c,
      ),
    };
    expect(threatenedTiles(state)).toEqual([]);
    expect(pendingCharges(state)).toEqual([]);
  });
});

describe("determinism", () => {
  it("draws no dice: the same declaration resolves identically", () => {
    const one = passTo(declared(), "chassis");
    const two = passTo(declared(), "chassis");
    expect(one.rng).toEqual(two.rng);
    expect(one.log).toEqual(two.log);
    // And it consumed nothing: a declaration and its release are pure
    // grid work, so nothing about the wind-up can move a damage roll.
    expect(one.rng).toEqual(arena().rng);
  });
});
