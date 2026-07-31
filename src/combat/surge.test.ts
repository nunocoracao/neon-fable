import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { CharacterState } from "../character/create";
import { requireItem } from "../data/items";
import { addItem, emptyInventory } from "../inventory/inventory";
import { installEnhancement } from "../inventory/equipment";
import type { Item, ItemResolver } from "../inventory/items";
import { staticReading } from "../inventory/staticLoad";
import { createNewGame, type GameState } from "../state";
import { takeAction } from "./actions";
import { createCombat, PLAYER_COMBATANT_ID } from "./setup";
import { initiativeScore } from "./state";
import {
  SURGE_ARM_TURNS,
  SURGE_STUN_TURNS,
  closeSurgeTurn,
  isSurgeArmed,
  openSurgeTurn,
  pendingSurge,
  startingSurge,
  surgeTurnsToArm,
} from "./surge";
import { makeCombat, makeCombatant } from "./testSupport";
import type { CombatEvent, CombatState } from "./types";

/**
 * Fixture implants: one that alone pushes a character straight to the
 * screaming band, and one quiet enough to stay clear. Which shipped
 * loadouts reach which band is src/data/static.test.ts's business.
 */
const fixtures: Item[] = [
  {
    id: "fix-scream",
    kind: "enhancement",
    name: "Screamer",
    description: "test",
    slot: "eyes",
    neuralCost: 1,
    staticLoad: 20,
    effects: [],
  },
  {
    id: "fix-whisper",
    kind: "enhancement",
    name: "Whisper",
    description: "test",
    slot: "arms",
    neuralCost: 1,
    staticLoad: 1,
    effects: [],
  },
];

/** Fixtures first, then the shipped catalog — a fixture-implanted
 * character still walks in wearing real starting gear. */
const resolve: ItemResolver = (id) =>
  fixtures.find((item) => item.id === id) ?? requireItem(id);

/** The encounter these fights are played out in. */
const ENCOUNTER = "enc-rustyard-ambush";

function wearing(itemId: string): CharacterState {
  const character = fixtureCharacter();
  const inventory = addItem(emptyInventory(), itemId, 1, resolve);
  return installEnhancement(character, inventory, itemId, resolve).character;
}

/** A game whose player is loud enough to surge (or quiet enough not to). */
function gameWith(itemId: string): GameState {
  return createNewGame({ character: wearing(itemId), seed: 7 });
}

/** A hand-rolled fight with the player holding a fresh surge. */
function fightWithSurge(overrides: Partial<CombatState> = {}): CombatState {
  const player = makeCombatant({
    id: PLAYER_COMBATANT_ID,
    kind: "player",
    stats: { body: 5, reflexes: 9, tech: 5, cool: 5, intelligence: 5 },
  });
  const foe = makeCombatant({ id: "foe" });
  return makeCombat([player, foe], {
    surge: { combatantId: PLAYER_COMBATANT_ID, charge: 0, armed: false, spent: false },
    ...overrides,
  });
}

const kinds = (state: CombatState): CombatEvent["type"][] =>
  state.log.map((event) => event.type);

describe("startingSurge", () => {
  it("gives a screaming loadout something to build", () => {
    const character = wearing("fix-scream");
    expect(staticReading(character, resolve).band).toBe("screaming");
    expect(startingSurge(character, PLAYER_COMBATANT_ID, resolve)).toEqual({
      combatantId: PLAYER_COMBATANT_ID,
      charge: 0,
      armed: false,
      spent: false,
    });
  });

  it("gives a quiet loadout nothing at all", () => {
    expect(
      startingSurge(wearing("fix-whisper"), PLAYER_COMBATANT_ID, resolve),
    ).toBeNull();
    expect(
      startingSurge(fixtureCharacter(), PLAYER_COMBATANT_ID, resolve),
    ).toBeNull();
  });
});

describe("openSurgeTurn", () => {
  it("banks a point a turn, silently, until it arms", () => {
    let state = fightWithSurge();
    for (let turn = 1; turn < SURGE_ARM_TURNS; turn++) {
      state = openSurgeTurn(state, PLAYER_COMBATANT_ID);
      expect(pendingSurge(state)?.charge).toBe(turn);
      expect(isSurgeArmed(state)).toBe(false);
      expect(state.log).toEqual([]);
    }
    expect(surgeTurnsToArm(state)).toBe(1);
  });

  it("arms with a full turn of warning, and says so once", () => {
    let state = fightWithSurge();
    for (let turn = 0; turn < SURGE_ARM_TURNS; turn++) {
      state = openSurgeTurn(state, PLAYER_COMBATANT_ID);
    }
    expect(isSurgeArmed(state)).toBe(true);
    expect(surgeTurnsToArm(state)).toBe(0);
    expect(kinds(state)).toEqual(["static-armed"]);
    // Nobody is stunned yet: arming is the telegraph, not the blow.
    expect(state.combatants[0]?.stunTurns).toBe(0);
  });

  it("discharges on the turn after it arms, and is then spent", () => {
    let state = fightWithSurge({
      surge: {
        combatantId: PLAYER_COMBATANT_ID,
        charge: SURGE_ARM_TURNS,
        armed: true,
        spent: false,
      },
    });
    state = openSurgeTurn(state, PLAYER_COMBATANT_ID);
    expect(kinds(state)).toEqual(["static-surge"]);
    expect(state.combatants[0]?.stunTurns).toBe(SURGE_STUN_TURNS);
    expect(state.surge?.spent).toBe(true);
    expect(pendingSurge(state)).toBeNull();

    // Once a fight: further turns do nothing whatsoever.
    const later = openSurgeTurn(state, PLAYER_COMBATANT_ID);
    expect(later).toBe(state);
  });

  it("ignores turns that belong to somebody else", () => {
    const state = fightWithSurge();
    expect(openSurgeTurn(state, "foe")).toBe(state);
  });
});

describe("closeSurgeTurn", () => {
  const armed = (): CombatState =>
    fightWithSurge({
      surge: {
        combatantId: PLAYER_COMBATANT_ID,
        charge: SURGE_ARM_TURNS,
        armed: true,
        spent: false,
      },
    });

  it("bleeds off a turn that went by without its action", () => {
    const state = closeSurgeTurn(armed(), PLAYER_COMBATANT_ID, false);
    expect(kinds(state)).toEqual(["static-vented"]);
    expect(state.surge?.spent).toBe(true);
    expect(state.combatants[0]?.stunTurns).toBe(0);
  });

  it("does nothing for a turn that spent its action", () => {
    const before = armed();
    expect(closeSurgeTurn(before, PLAYER_COMBATANT_ID, true)).toBe(before);
  });

  it("does nothing while the noise is still building", () => {
    const before = fightWithSurge();
    expect(closeSurgeTurn(before, PLAYER_COMBATANT_ID, false)).toBe(before);
  });
});

describe("the surge over a whole fight", () => {
  /** Pass turns until the player has been handed `count` of them. */
  function passTurns(state: CombatState, count: number): CombatState {
    let current = state;
    let seen = 0;
    // The opening turn is already the first one handed out.
    if (current.initiativeOrder[current.turnIndex] === PLAYER_COMBATANT_ID) {
      seen = 1;
    }
    while (seen < count) {
      current = takeAction(current, { type: "end-turn" }, resolve);
      if (current.initiativeOrder[current.turnIndex] === PLAYER_COMBATANT_ID) {
        seen += 1;
      }
    }
    return current;
  }

  it("counts the opening turn, so winning initiative buys no free quiet", () => {
    const combat = createCombat(gameWith("fix-scream"), ENCOUNTER, resolve);
    // The player leads this encounter's order; the surge banked on it.
    expect(combat.initiativeOrder[0]).toBe(PLAYER_COMBATANT_ID);
    expect(pendingSurge(combat)?.charge).toBe(1);
  });

  it("never arrives for a quiet runner", () => {
    const combat = createCombat(gameWith("fix-whisper"), ENCOUNTER, resolve);
    expect(combat.surge).toBeNull();
    expect(passTurns(combat, SURGE_ARM_TURNS + 2).surge).toBeNull();
  });

  it("takes the turn when it is ignored, through the ordinary stun path", () => {
    const opening = createCombat(gameWith("fix-scream"), ENCOUNTER, resolve);
    // Spend the action every turn: nothing is ever bled off.
    let state = opening;
    let handed = 1;
    while (handed <= SURGE_ARM_TURNS + 1) {
      if (state.initiativeOrder[state.turnIndex] === PLAYER_COMBATANT_ID) {
        state = { ...state, actionUsed: true };
      }
      state = takeAction(state, { type: "end-turn" }, resolve);
      if (state.initiativeOrder[state.turnIndex] === PLAYER_COMBATANT_ID) {
        handed += 1;
      }
      if (state.log.some((e) => e.type === "static-surge")) break;
    }
    const types = kinds(state);
    expect(types).toContain("static-armed");
    expect(types).toContain("static-surge");
    // The turn is lost the way every stunned turn is lost.
    expect(types.indexOf("stun-skipped")).toBeGreaterThan(
      types.indexOf("static-surge"),
    );
    expect(state.surge?.spent).toBe(true);
  });

  it("is bled off by a turn that never swings, and never returns", () => {
    let state = createCombat(gameWith("fix-scream"), ENCOUNTER, resolve);
    // Hold still throughout: the surge arms and then vents.
    for (let i = 0; i < 40; i++) {
      state = takeAction(state, { type: "end-turn" }, resolve);
      if (state.log.some((e) => e.type === "static-vented")) break;
    }
    const types = kinds(state);
    expect(types).toContain("static-armed");
    expect(types).toContain("static-vented");
    expect(types).not.toContain("static-surge");
    expect(state.surge?.spent).toBe(true);
    expect(state.combatants.find((c) => c.kind === "player")?.stunTurns).toBe(0);
  });

  it("is a clock, not a die: the same fight surges identically every time", () => {
    const play = (): CombatEvent["type"][] => {
      let state = createCombat(gameWith("fix-scream"), ENCOUNTER, resolve);
      for (let i = 0; i < 12; i++) {
        if (state.status !== "active") break;
        if (state.initiativeOrder[state.turnIndex] === PLAYER_COMBATANT_ID) {
          state = { ...state, actionUsed: true };
        }
        state = takeAction(state, { type: "end-turn" }, resolve);
      }
      return kinds(state).filter((type) => type.startsWith("static-"));
    };
    expect(play()).toEqual(play());
  });
});

describe("the initiative penalty", () => {
  it("docks the screaming band's places in the order, and nothing else", () => {
    const noisy = createCombat(gameWith("fix-scream"), ENCOUNTER, resolve);
    const quiet = createCombat(gameWith("fix-whisper"), ENCOUNTER, resolve);
    const player = (state: CombatState) =>
      state.combatants.find((c) => c.kind === "player")!;

    expect(player(noisy).initiativeMod).toBe(-1);
    expect(player(quiet).initiativeMod).toBeUndefined();
    // The stat itself is untouched — only where it puts you in the queue.
    expect(player(noisy).stats.reflexes).toBe(player(quiet).stats.reflexes);
    expect(initiativeScore(player(noisy))).toBe(
      initiativeScore(player(quiet)) - 1,
    );
  });

  it("moves a body down the order when it drops it past a rival", () => {
    const fast = makeCombatant({
      id: "fast",
      kind: "player",
      stats: { body: 5, reflexes: 6, tech: 5, cool: 5, intelligence: 5 },
    });
    expect(initiativeScore(fast)).toBe(6);
    expect(initiativeScore({ ...fast, initiativeMod: -1 })).toBe(5);
  });
});
