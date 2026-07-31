import { describe, expect, it } from "vitest";
import { combatResultFlag } from "../combat";
import {
  CRED_PER_VICTORY,
  VICTORY_FLAG_PREFIX,
  VICTORY_FLAG_VALUE,
  credDeeds,
  credMilestones,
} from "../data/advancement";
import { perks } from "../data/perks";
import { createNewGame, type GameState } from "../state";
import { createMemoryStorage, loadGame, saveGame } from "../state/save";
import { AdvancementError } from "./advancement";
import {
  choosePerk,
  credLines,
  currentMilestone,
  milestonesReached,
  nextMilestone,
  perkPicksAvailable,
  perkPicksEarned,
  perkPoolExhausted,
  streetCred,
  victoriesWon,
} from "./cred";
import { availablePerks, perkIdsOf, takenPerks } from "./perks";

function makeState(flags: Record<string, string | boolean> = {}): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 11 });
  return { ...state, flags: { ...flags } };
}

/** Flags worth exactly enough cred to owe `count` picks. */
function credFor(count: number): Record<string, string> {
  const wanted = credMilestones[count - 1]?.cred ?? 0;
  const flags: Record<string, string> = {};
  for (let i = 0; i < Math.ceil(wanted / CRED_PER_VICTORY); i++) {
    flags[combatResultFlag(`enc-test-${i}`)] = "victory";
  }
  return flags;
}

/** A state owing `count` picks, with `taken` of them already spent. */
function withPicks(count: number, taken: string[] = []): GameState {
  const state = makeState(credFor(count));
  return {
    ...state,
    player: {
      ...state.player,
      advancement: { ...state.player.advancement, perkIds: [...taken] },
    },
  };
}

function expectAdvancementError(fn: () => unknown, code: string): void {
  try {
    fn();
    expect.unreachable();
  } catch (error) {
    expect(error).toBeInstanceOf(AdvancementError);
    expect((error as AdvancementError).code).toBe(code);
  }
}

describe("street cred", () => {
  it("starts at nothing", () => {
    expect(streetCred({})).toBe(0);
    expect(credLines({})).toEqual([]);
  });

  it("counts each authored deed once, from its own flag", () => {
    for (const deed of credDeeds) {
      expect(streetCred({ [deed.flag]: true })).toBe(deed.cred);
      // Re-setting a flag (as replaying an ending would) changes nothing.
      const flags = { [deed.flag]: true };
      flags[deed.flag] = true;
      expect(streetCred(flags)).toBe(deed.cred);
    }
  });

  it("ignores a deed flag that is not set the way the deed wants", () => {
    const deed = credDeeds[0]!;
    expect(streetCred({ [deed.flag]: false })).toBe(0);
  });

  it("counts fights won, and only fights won", () => {
    const flags = {
      [combatResultFlag("enc-a")]: "victory",
      [combatResultFlag("enc-b")]: "victory",
      [combatResultFlag("enc-c")]: "fled",
      [combatResultFlag("enc-d")]: "defeat",
      "some-other-flag": "victory",
    };
    expect(victoriesWon(flags)).toBe(2);
    expect(streetCred(flags)).toBe(2 * CRED_PER_VICTORY);
  });

  it("reads the flags combat actually writes", () => {
    // The content layer names the prefix; the engine writes it. If these
    // ever part company, cred silently stops counting fights.
    const flag = combatResultFlag("enc-auric-scout");
    expect(flag.startsWith(VICTORY_FLAG_PREFIX)).toBe(true);
    expect(streetCred({ [flag]: VICTORY_FLAG_VALUE })).toBe(CRED_PER_VICTORY);
  });

  it("sums deeds and fights into one figure the screen can print", () => {
    const deed = credDeeds[0]!;
    const flags = {
      [deed.flag]: true,
      [combatResultFlag("enc-a")]: "victory",
    };
    const lines = credLines(flags);
    expect(lines.map((line) => line.label)).toEqual([deed.label, "1 fight won"]);
    expect(lines.reduce((sum, line) => sum + line.cred, 0)).toBe(
      streetCred(flags),
    );
  });
});

describe("milestones", () => {
  it("are ordered, positive, and distinct", () => {
    const thresholds = credMilestones.map((m) => m.cred);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(new Set(thresholds).size).toBe(thresholds.length);
    expect(thresholds[0]).toBeGreaterThan(0);
  });

  it("never offers more picks than the pool can fill", () => {
    expect(credMilestones.length).toBeLessThanOrEqual(perks.length);
  });

  it("triggers the moment the cred clears the threshold, and stays", () => {
    const first = credMilestones[0]!;
    expect(milestonesReached(first.cred - 1)).toEqual([]);
    expect(milestonesReached(first.cred)).toEqual([first]);
    expect(milestonesReached(first.cred + 1)).toEqual([first]);
    expect(currentMilestone(first.cred)).toBe(first);
    expect(currentMilestone(first.cred - 1)).toBeNull();
  });

  it("names the next one until the street runs out of names", () => {
    expect(nextMilestone(0)).toBe(credMilestones[0]);
    expect(nextMilestone(credMilestones[0]!.cred)).toBe(credMilestones[1]);
    const last = credMilestones[credMilestones.length - 1]!;
    expect(nextMilestone(last.cred)).toBeNull();
  });

  it("earns one pick per milestone the run's cred has passed", () => {
    expect(perkPicksEarned({})).toBe(0);
    for (const [index, milestone] of credMilestones.entries()) {
      const flags = { [combatResultFlag("enc-x")]: "victory" };
      // Cred exactly at this milestone's threshold.
      const state = makeState(credFor(index + 1));
      expect(streetCred(state.flags)).toBeGreaterThanOrEqual(milestone.cred);
      expect(perkPicksEarned(state.flags)).toBe(index + 1);
      expect(perkPicksEarned(flags)).toBeLessThanOrEqual(1);
    }
  });

  it("counts picks available as earned less taken, never negative", () => {
    const state = withPicks(2);
    expect(perkPicksAvailable(state)).toBe(2);
    const spent = withPicks(2, [perks[0]!.id]);
    expect(perkPicksAvailable(spent)).toBe(1);
    const overspent = withPicks(1, [perks[0]!.id, perks[1]!.id]);
    expect(perkPicksAvailable(overspent)).toBe(0);
  });
});

describe("choosePerk", () => {
  it("takes a perk and spends exactly one pick", () => {
    const state = withPicks(2);
    const player = choosePerk(state, "perk-cold-read");
    expect(perkIdsOf(player)).toEqual(["perk-cold-read"]);
    expect(perkPicksAvailable({ ...state, player })).toBe(1);
    // Pure: the state it was asked about is untouched.
    expect(perkIdsOf(state.player)).toEqual([]);
  });

  it("is permanent — nothing gives a pick back or takes a perk away", () => {
    let state = withPicks(1);
    state = { ...state, player: choosePerk(state, "perk-pain-editor") };
    expect(perkPicksAvailable(state)).toBe(0);
    expectAdvancementError(
      () => choosePerk(state, "perk-ghost-step"),
      "no-perk-pick",
    );
    // Earning the next milestone does not un-take the first perk.
    const later = { ...state, flags: withPicks(2).flags };
    expect(perkIdsOf(later.player)).toEqual(["perk-pain-editor"]);
    expect(perkPicksAvailable(later)).toBe(1);
  });

  it("depletes the pool: what is taken is never offered again", () => {
    let state = withPicks(2);
    const first = availablePerks(state.player)[0]!;
    state = { ...state, player: choosePerk(state, first.id) };
    expect(availablePerks(state.player)).not.toContain(first);
    expect(availablePerks(state.player).length).toBe(perks.length - 1);
    expect(takenPerks(state.player)).toEqual([first]);
    expectAdvancementError(() => choosePerk(state, first.id), "perk-taken");
  });

  it("leaves everything unchosen on offer at the next milestone", () => {
    let state = withPicks(1);
    const skipped = availablePerks(state.player)[1]!;
    state = {
      ...state,
      player: choosePerk(state, availablePerks(state.player)[0]!.id),
    };
    const later = { ...state, flags: withPicks(2).flags };
    expect(availablePerks(later.player)).toContain(skipped);
    expect(perkIdsOf(choosePerk(later, skipped.id))).toContain(skipped.id);
  });

  it("refuses a perk this build does not have", () => {
    expectAdvancementError(
      () => choosePerk(withPicks(1), "perk-nonexistent"),
      "unknown-perk",
    );
  });

  it("refuses a pick no milestone owes", () => {
    expectAdvancementError(
      () => choosePerk(makeState(), "perk-cold-read"),
      "no-perk-pick",
    );
  });

  it("reports an emptied pool", () => {
    const state = withPicks(1, perks.map((perk) => perk.id));
    expect(perkPoolExhausted(state.player)).toBe(true);
    expect(perkPoolExhausted(makeState().player)).toBe(false);
  });
});

describe("persistence", () => {
  it("keeps taken perks — and the cred behind them — through a round-trip", () => {
    let state = withPicks(2);
    state = { ...state, player: choosePerk(state, "perk-silver-tongue") };
    state = { ...state, player: choosePerk(state, "perk-gutter-surgeon") };

    const storage = createMemoryStorage();
    saveGame(state, "slot1", storage, 1);
    const loaded = loadGame("slot1", storage);

    expect(perkIdsOf(loaded.player)).toEqual([
      "perk-silver-tongue",
      "perk-gutter-surgeon",
    ]);
    expect(streetCred(loaded.flags)).toBe(streetCred(state.flags));
    expect(perkPicksAvailable(loaded)).toBe(perkPicksAvailable(state));
    expect(availablePerks(loaded.player).length).toBe(perks.length - 2);
  });
});
