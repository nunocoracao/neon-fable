import { describe, expect, it } from "vitest";
import { characterInjury, injureCharacter } from "../character/injury";
import { requireInjury } from "../data/injuries";
import { createNewGame, type GameState } from "../state";
import {
  companionInjury,
  recruitCompanion,
  setCompanionHp,
} from "../state/party";
import { allyCombatantId } from "./ally";
import {
  BLOODIED_SHARE,
  applyCombatInjuries,
  combatInjuries,
  hasSeizableChrome,
} from "./injury";
import { PLAYER_COMBATANT_ID } from "./setup";
import { makeCombat, makeCombatant } from "./testSupport";
import { resolveCombat } from "./outcome";
import type { CombatEvent, CombatState } from "./types";

/**
 * Who limps out of a fight, and — the rule this whole feature rests on
 * — that nobody limps out of one they lost.
 */

const WINGED = "inj-winged";
const CONCUSSED = "inj-concussed";
const SERVO = "inj-servo-lock";

function fightWon(
  overrides: {
    playerHp?: number;
    log?: CombatEvent[];
    status?: CombatState["status"];
  } = {},
): CombatState {
  const player = makeCombatant({
    id: PLAYER_COMBATANT_ID,
    kind: "player",
    maxHp: 30,
    hp: overrides.playerHp ?? 30,
  });
  const foe = makeCombatant({ id: "nme-1", kind: "enemy", hp: 0 });
  return makeCombat([player, foe], {
    status: overrides.status ?? "victory",
    log: overrides.log ?? [],
  });
}

describe("who a fight hurts", () => {
  it("hands out nothing at all when the fight was lost", () => {
    const combat = fightWon({ playerHp: 1, status: "defeat" });
    expect(combatInjuries(combat)).toEqual([]);
  });

  it("hands out nothing when the player broke contact", () => {
    expect(combatInjuries(fightWon({ playerHp: 1, status: "fled" }))).toEqual(
      [],
    );
  });

  it("hands out nothing to somebody who won it comfortably", () => {
    expect(combatInjuries(fightWon({ playerHp: 30 }))).toEqual([]);
    expect(combatInjuries(fightWon({ playerHp: 20 }))).toEqual([]);
  });

  it("hurts a winner who finished on almost nothing", () => {
    const bloodied = Math.floor(30 * BLOODIED_SHARE);
    const draws = combatInjuries(fightWon({ playerHp: bloodied }));
    expect(draws).toHaveLength(1);
    expect(draws[0]?.combatantId).toBe(PLAYER_COMBATANT_ID);
    expect(draws[0]?.companionId).toBeNull();
  });

  it("hurts a winner who was caught on the way down", () => {
    const draws = combatInjuries(
      fightWon({
        playerHp: 30,
        log: [
          { type: "second-wind", combatantId: PLAYER_COMBATANT_ID, amount: 7 },
        ],
      }),
    );
    expect(draws).toHaveLength(1);
    expect(draws[0]?.combatantId).toBe(PLAYER_COMBATANT_ID);
  });

  it("never hurts the other side", () => {
    const combat = fightWon({ playerHp: 1 });
    expect(
      combatInjuries(combat).some((draw) => draw.combatantId === "nme-1"),
    ).toBe(false);
  });
});

describe("which injury a fight hands out", () => {
  it("defaults to the wound any bad fight leaves", () => {
    expect(combatInjuries(fightWon({ playerHp: 2 }))[0]?.injuryId).toBe(WINGED);
  });

  it("hands out a concussion to somebody who was put on the floor", () => {
    const draws = combatInjuries(
      fightWon({
        playerHp: 2,
        log: [{ type: "stun-skipped", combatantId: PLAYER_COMBATANT_ID }],
      }),
    );
    expect(draws[0]?.injuryId).toBe(CONCUSSED);
  });

  it("reads a stunning ability as a knock even before the turn is lost", () => {
    const draws = combatInjuries(
      fightWon({
        playerHp: 2,
        log: [
          {
            type: "ability-used",
            combatantId: "nme-1",
            abilityId: "ability-test",
            targetId: PLAYER_COMBATANT_ID,
            damage: 6,
            stunTurns: 1,
          },
        ],
      }),
    );
    expect(draws[0]?.injuryId).toBe(CONCUSSED);
  });

  it("ignores an ability that landed on somebody else", () => {
    const draws = combatInjuries(
      fightWon({
        playerHp: 2,
        log: [
          {
            type: "ability-used",
            combatantId: PLAYER_COMBATANT_ID,
            abilityId: "ability-test",
            targetId: "nme-1",
            damage: 6,
            stunTurns: 1,
          },
        ],
      }),
    );
    expect(draws[0]?.injuryId).toBe(WINGED);
  });

  it("seizes the chrome of somebody carrying chrome that could seize", () => {
    const draws = combatInjuries(fightWon({ playerHp: 2 }), {
      playerChromed: true,
    });
    expect(draws[0]?.injuryId).toBe(SERVO);
  });

  it("seizes the chrome ahead of a concussion — the narrowest read wins", () => {
    const draws = combatInjuries(
      fightWon({
        playerHp: 2,
        log: [{ type: "stun-skipped", combatantId: PLAYER_COMBATANT_ID }],
      }),
      { playerChromed: true },
    );
    expect(draws[0]?.injuryId).toBe(SERVO);
  });
});

describe("hasSeizableChrome", () => {
  it("is false for a runner with no implants", () => {
    expect(hasSeizableChrome(createNewGame({ seed: 1 }).player)).toBe(false);
  });

  it("is true only for chrome that is actually granting something", () => {
    const state = createNewGame({ seed: 1 });
    const silent: GameState = {
      ...state,
      player: {
        ...state.player,
        equipment: {
          ...state.player.equipment,
          // A dampener grants no ability; there is nothing to go offline.
          enhancements: { ...state.player.equipment.enhancements, neural: "cyb-null-collar" },
        },
      },
    };
    expect(hasSeizableChrome(silent.player)).toBe(false);

    const granting: GameState = {
      ...state,
      player: {
        ...state.player,
        equipment: {
          ...state.player.equipment,
          enhancements: { ...state.player.equipment.enhancements, arms: "cyb-myomer-arms" },
        },
      },
    };
    expect(hasSeizableChrome(granting.player)).toBe(true);
  });
});

describe("companions", () => {
  function withVesper(hp: number, log: CombatEvent[] = []) {
    const fresh = createNewGame({ playerName: "Vex", seed: 3 });
    const state: GameState = {
      ...fresh,
      party: recruitCompanion(fresh.party, "vesper"),
    };
    const allyId = allyCombatantId("vesper");
    const combat = makeCombat(
      [
        makeCombatant({ id: PLAYER_COMBATANT_ID, kind: "player", maxHp: 30, hp: 30 }),
        makeCombatant({
          id: allyId,
          kind: "ally",
          companionId: "vesper",
          maxHp: 24,
          hp,
        }),
        makeCombatant({ id: "nme-1", kind: "enemy", hp: 0 }),
      ],
      { status: "victory", log },
    );
    return { state, combat, allyId };
  }

  it("hurts a companion the fight actually dropped", () => {
    const { state, combat, allyId } = withVesper(0, [
      { type: "defeated", combatantId: allyCombatantId("vesper") },
    ]);
    const draws = combatInjuries(combat);
    expect(draws).toHaveLength(1);
    expect(draws[0]?.combatantId).toBe(allyId);
    expect(draws[0]?.companionId).toBe("vesper");

    const after = applyCombatInjuries(state, combat);
    expect(companionInjury(after.party, "vesper")?.id).toBe(WINGED);
    // And the player, who was fine, is still fine.
    expect(characterInjury(after.player)).toBeNull();
  });

  it("leaves a companion who came through it alone", () => {
    const { state, combat } = withVesper(24);
    expect(combatInjuries(combat)).toEqual([]);
    expect(applyCombatInjuries(state, combat)).toBe(state);
  });

  it("never gives a companion the chrome wound — they carry no implants", () => {
    const { state, combat } = withVesper(1);
    const after = applyCombatInjuries(state, combat, undefined);
    expect(companionInjury(after.party, "vesper")?.id).toBe(WINGED);
  });

  it("skips a companion this run never recruited", () => {
    const combat = makeCombat(
      [
        makeCombatant({ id: PLAYER_COMBATANT_ID, kind: "player", maxHp: 30, hp: 30 }),
        makeCombatant({
          id: allyCombatantId("vesper"),
          kind: "ally",
          companionId: "vesper",
          maxHp: 24,
          hp: 1,
        }),
      ],
      { status: "victory" },
    );
    const state = createNewGame({ seed: 3 });
    expect(applyCombatInjuries(state, combat)).toBe(state);
  });
});

describe("applyCombatInjuries", () => {
  it("applies the worst-replaces rule to what is already carried", () => {
    const state = createNewGame({ seed: 7 });
    const hurt: GameState = {
      ...state,
      player: injureCharacter(state.player, SERVO),
    };
    // A fight that would otherwise hand out the lesser wound.
    const after = applyCombatInjuries(hurt, fightWon({ playerHp: 2 }));
    expect(characterInjury(after.player)?.id).toBe(SERVO);
  });

  it("leaves the state identical when nothing was drawn", () => {
    const state = createNewGame({ seed: 7 });
    expect(applyCombatInjuries(state, fightWon({ playerHp: 30 }))).toBe(state);
  });
});

describe("resolveCombat", () => {
  function encounterFight(status: CombatState["status"], playerHp: number) {
    return makeCombat(
      [
        makeCombatant({
          id: PLAYER_COMBATANT_ID,
          kind: "player",
          maxHp: 30,
          hp: playerHp,
        }),
        makeCombatant({ id: "nme-1", kind: "enemy", hp: 0 }),
      ],
      { status, encounterId: "enc-auric-scout" },
    );
  }

  it("marks a runner who won a fight that nearly finished them", () => {
    const state = createNewGame({ playerName: "Vex", seed: 11 });
    const after = resolveCombat(state, encounterFight("victory", 2));
    expect(characterInjury(after.player)?.id).toBe(WINGED);
    expect(characterInjury(after.player)?.scenesLeft).toBe(
      requireInjury(WINGED).scenes,
    );
  });

  it("leaves a defeat exactly as it always was — no second punishment", () => {
    const state = createNewGame({ playerName: "Vex", seed: 11 });
    const after = resolveCombat(state, encounterFight("defeat", 0));
    expect(characterInjury(after.player)).toBeNull();
    // The defeat flow itself is untouched: staggered at 1 hp, flag written.
    expect(after.player.hp).toBe(1);
    expect(after.flags["combat:enc-auric-scout"]).toBe("defeat");
  });

  it("does not touch a companion's hp write-back", () => {
    const fresh = createNewGame({ playerName: "Vex", seed: 11 });
    const state: GameState = {
      ...fresh,
      party: setCompanionHp(
        recruitCompanion(fresh.party, "vesper"),
        "vesper",
        20,
      ),
    };
    const combat = makeCombat(
      [
        makeCombatant({ id: PLAYER_COMBATANT_ID, kind: "player", maxHp: 30, hp: 30 }),
        makeCombatant({
          id: allyCombatantId("vesper"),
          kind: "ally",
          companionId: "vesper",
          maxHp: 24,
          hp: 0,
        }),
        makeCombatant({ id: "nme-1", kind: "enemy", hp: 0 }),
      ],
      { status: "victory", encounterId: "enc-auric-scout" },
    );
    const after = resolveCombat(state, combat);
    // Benched for that fight only — and now carrying the reason why.
    expect(after.party.members[0]?.hp).toBe(1);
    expect(companionInjury(after.party, "vesper")?.id).toBe(WINGED);
  });
});
