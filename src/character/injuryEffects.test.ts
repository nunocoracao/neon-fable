import { describe, expect, it } from "vitest";
import {
  PLAYER_COMBATANT_ID,
  allyCombatant,
  allyStats,
  createCombat,
} from "../combat";
import { requireItem } from "../data/items";
import {
  addItem,
  dialogueStats,
  effectiveStats,
  grantedAbilityIds,
  installEnhancement,
} from "../inventory";
import { checkRequirement } from "../narrative";
import { createNewGame, type GameState } from "../state";
import {
  memberFrom,
  recruitCompanion,
  setCompanionInjury,
  type PartyMember,
} from "../state/party";
import { requireCompanion } from "../data/companions";
import { injureCharacter } from "./injury";

/**
 * What each injury actually *does*, asserted at the one place it does
 * it — the same shape as perkEffects.test.ts beside it. Take the same
 * run twice, hurt one of them, and read the derivation the game reads.
 * If an injury ever stops being wired to its seam, exactly one of these
 * fails and it names the seam.
 */

const WINGED = "inj-winged";
const CONCUSSED = "inj-concussed";
const SERVO = "inj-servo-lock";

function makeState(): GameState {
  return createNewGame({ playerName: "Vex", seed: 5 });
}

function hurt(state: GameState, injuryId: string): GameState {
  return { ...state, player: injureCharacter(state.player, injuryId) };
}

/** A run wearing chrome that grants an ability, in the arms socket. */
function chromed(state: GameState): GameState {
  const loadout = installEnhancement(
    state.player,
    addItem(state.inventory, "cyb-myomer-arms"),
    "cyb-myomer-arms",
  );
  return { ...state, player: loadout.character, inventory: loadout.inventory };
}

describe("Winged — the stat seam", () => {
  it("takes a point of Reflexes off effectiveStats", () => {
    const base = makeState();
    expect(effectiveStats(hurt(base, WINGED).player).reflexes).toBe(
      effectiveStats(base.player).reflexes - 1,
    );
  });

  it("takes it off the fight's own snapshot", () => {
    const base = makeState();
    const playerIn = (state: GameState) =>
      createCombat(state, "enc-auric-scout").combatants.find(
        (c) => c.id === PLAYER_COMBATANT_ID,
      )!;
    expect(playerIn(hurt(base, WINGED)).stats.reflexes).toBe(
      playerIn(base).stats.reflexes - 1,
    );
  });

  it("closes a dialogue gate that was open a point ago", () => {
    const base = makeState();
    const value = dialogueStats(base.player).reflexes;
    const gate = { type: "stat", stat: "reflexes", value } as const;
    expect(checkRequirement(base, gate)).toBe(true);
    expect(checkRequirement(hurt(base, WINGED), gate)).toBe(false);
  });

  it("leaves every other stat exactly where it was", () => {
    const base = makeState();
    const after = effectiveStats(hurt(base, WINGED).player);
    const before = effectiveStats(base.player);
    expect({ ...after, reflexes: before.reflexes }).toEqual(before);
  });
});

describe("Concussed — the conversation seam", () => {
  it("takes Cool off a conversation and off nothing a fight asks", () => {
    const base = makeState();
    const hurtState = hurt(base, CONCUSSED);
    expect(dialogueStats(hurtState.player).cool).toBe(
      dialogueStats(base.player).cool - 2,
    );
    expect(effectiveStats(hurtState.player).cool).toBe(
      effectiveStats(base.player).cool,
    );
  });

  it("closes a Cool gate, and leaves a Reflexes gate open", () => {
    const base = makeState();
    const hurtState = hurt(base, CONCUSSED);
    const cool = dialogueStats(base.player).cool;
    expect(
      checkRequirement(hurtState, { type: "stat", stat: "cool", value: cool }),
    ).toBe(false);
    const reflexes = dialogueStats(base.player).reflexes;
    expect(
      checkRequirement(hurtState, {
        type: "stat",
        stat: "reflexes",
        value: reflexes,
      }),
    ).toBe(true);
  });

  it("never erases a person: Cool floors at 1", () => {
    const base = makeState();
    const brittle: GameState = {
      ...base,
      player: { ...base.player, stats: { ...base.player.stats, cool: 1 } },
    };
    expect(dialogueStats(hurt(brittle, CONCUSSED).player).cool).toBe(1);
  });
});

describe("Servo-Lock — the ability seam", () => {
  it("takes the chrome's ability offline and leaves everything else on", () => {
    const wired = chromed(makeState());
    const granted = grantedAbilityIds(wired.player);
    expect(granted).toContain("ability-crush");

    const seized = grantedAbilityIds(hurt(wired, SERVO).player);
    expect(seized).not.toContain("ability-crush");
    // Whatever the weapon in hand grants is untouched.
    for (const id of granted.filter((a) => a !== "ability-crush")) {
      expect(seized).toContain(id);
    }
  });

  it("leaves an ability learned by advancement alone", () => {
    const wired = chromed(makeState());
    const learned: GameState = {
      ...wired,
      player: {
        ...wired.player,
        advancement: {
          ...wired.player.advancement,
          abilityIds: ["ability-stun-strike"],
        },
      },
    };
    expect(grantedAbilityIds(hurt(learned, SERVO).player)).toContain(
      "ability-stun-strike",
    );
  });

  it("leaves the implant installed, and still costing capacity", () => {
    const wired = chromed(makeState());
    const seized = hurt(wired, SERVO);
    expect(seized.player.equipment.enhancements.arms).toBe("cyb-myomer-arms");
    expect(seized.player.neuralLoad).toBe(wired.player.neuralLoad);
    // And still paying out its stat mods: it is sulking, not removed.
    expect(effectiveStats(seized.player).body).toBe(
      effectiveStats(wired.player).body,
    );
  });

  it("takes the ability out of the fight's snapshot too", () => {
    const wired = chromed(makeState());
    const playerIn = (state: GameState) =>
      createCombat(state, "enc-auric-scout").combatants.find(
        (c) => c.id === PLAYER_COMBATANT_ID,
      )!;
    expect(playerIn(wired).abilityIds).toContain("ability-crush");
    expect(playerIn(hurt(wired, SERVO)).abilityIds).not.toContain(
      "ability-crush",
    );
  });
});

describe("companions carry it the same way", () => {
  function member(injuryId: string | null): PartyMember {
    const base = memberFrom(requireCompanion("vesper"));
    return injuryId === null
      ? base
      : { ...base, injury: { id: injuryId, scenesLeft: 2 } };
  }

  it("folds a wound into allyStats exactly as gear is folded", () => {
    expect(allyStats(member(WINGED), requireItem).reflexes).toBe(
      allyStats(member(null), requireItem).reflexes - 1,
    );
  });

  it("carries the wound onto the body on the board", () => {
    const combatant = allyCombatant(member(WINGED), { x: 0, y: 0 });
    expect(combatant.injury).toBe(WINGED);
    expect(allyCombatant(member(null), { x: 0, y: 0 }).injury).toBeUndefined();
  });

  it("shows on the ally the fight actually builds", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      party: setCompanionInjury(recruitCompanion(base.party, "vesper"), "vesper", {
        id: WINGED,
        scenesLeft: 2,
      }),
    };
    const combat = createCombat(state, "enc-auric-scout");
    const ally = combat.combatants.find((c) => c.kind === "ally")!;
    expect(ally.injury).toBe(WINGED);
  });
});

describe("the player's body on the board", () => {
  it("carries the wound for the rail to badge", () => {
    const base = makeState();
    const clean = createCombat(base, "enc-auric-scout").combatants.find(
      (c) => c.id === PLAYER_COMBATANT_ID,
    )!;
    expect(clean.injury).toBeUndefined();
    const marked = createCombat(
      hurt(base, CONCUSSED),
      "enc-auric-scout",
    ).combatants.find((c) => c.id === PLAYER_COMBATANT_ID)!;
    expect(marked.injury).toBe(CONCUSSED);
  });
});
