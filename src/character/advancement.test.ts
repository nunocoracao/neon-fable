import { describe, expect, it } from "vitest";
import { PLAYER_COMBATANT_ID, createCombat } from "../combat";
import { advancementPool } from "../data/abilities";
import { STAT_RAISE_COST, chapterGrants } from "../data/advancement";
import { effectiveStats, grantedAbilityIds } from "../inventory";
import { checkRequirement } from "../narrative";
import { createNewGame, type GameState } from "../state";
import {
  createMemoryStorage,
  loadGame,
  saveGame,
} from "../state/save";
import {
  AdvancementError,
  availablePoints,
  earnedPoints,
  raiseStat,
  unlockAbility,
} from "./advancement";
import { STAT_HARD_CAP } from "./stats";

function makeState(flags: Record<string, boolean> = {}): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 7 });
  return { ...state, flags: { ...flags } };
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

describe("earnedPoints", () => {
  it("grants nothing before any chapter completes", () => {
    expect(earnedPoints({})).toBe(0);
  });

  it("grants each chapter's points from its completion flag", () => {
    for (const grant of chapterGrants) {
      expect(earnedPoints({ [grant.flag]: true })).toBe(grant.points);
    }
  });

  it("sums every completed chapter", () => {
    const flags = Object.fromEntries(
      chapterGrants.map((grant) => [grant.flag, true]),
    );
    const total = chapterGrants.reduce((sum, g) => sum + g.points, 0);
    expect(earnedPoints(flags)).toBe(total);
  });

  it("never double-grants — the flag is a boolean, not a counter", () => {
    // Re-setting the flag (as replaying an ending would) changes nothing.
    const flags: Record<string, boolean> = { "act1-complete": true };
    const once = earnedPoints(flags);
    flags["act1-complete"] = true;
    expect(earnedPoints(flags)).toBe(once);
  });

  it("ignores falsy flag values", () => {
    expect(earnedPoints({ "act1-complete": false })).toBe(0);
  });
});

describe("availablePoints", () => {
  it("is earned minus spent, floored at zero", () => {
    const state = makeState({ "act1-complete": true });
    expect(availablePoints(state)).toBe(3);
    const spent = {
      ...state,
      player: {
        ...state.player,
        advancement: { pointsSpent: 2, abilityIds: [] },
      },
    };
    expect(availablePoints(spent)).toBe(1);
    const overspent = {
      ...state,
      player: {
        ...state.player,
        advancement: { pointsSpent: 99, abilityIds: [] },
      },
    };
    expect(availablePoints(overspent)).toBe(0);
  });
});

describe("raiseStat", () => {
  it("raises the base stat, spends the cost, and recomputes derived", () => {
    const state = makeState({ "act1-complete": true });
    const before = state.player;
    const player = raiseStat(state, "body");
    expect(player.stats.body).toBe(before.stats.body + 1);
    expect(player.advancement.pointsSpent).toBe(STAT_RAISE_COST);
    expect(availablePoints({ ...state, player })).toBe(3 - STAT_RAISE_COST);
    // Derived attributes follow the new stat line; hp grows with max HP.
    expect(player.derived.maxHp).toBe(before.derived.maxHp + 3);
    expect(player.hp).toBe(before.hp + 3);
    // The original state is untouched (pure function).
    expect(before.stats.body).toBe(state.player.stats.body);
  });

  it("flows through effective stats, gates, and combat snapshots", () => {
    const state = makeState({ "act1-complete": true });
    const gate = {
      type: "stat",
      stat: "cool",
      value: state.player.stats.cool + 1,
    } as const;
    expect(checkRequirement(state, gate)).toBe(false);
    const next = { ...state, player: raiseStat(state, "cool") };
    expect(effectiveStats(next.player).cool).toBe(
      effectiveStats(state.player).cool + 1,
    );
    expect(checkRequirement(next, gate)).toBe(true);
    const combat = createCombat(next, "enc-auric-scout");
    const snapshot = combat.combatants.find(
      (c) => c.id === PLAYER_COMBATANT_ID,
    )!;
    expect(snapshot.stats.cool).toBe(effectiveStats(next.player).cool);
  });

  it("rejects a raise with no points to spend", () => {
    expectAdvancementError(
      () => raiseStat(makeState(), "body"),
      "insufficient-points",
    );
  });

  it("rejects raising a stat already at the hard cap", () => {
    const state = makeState({ "act1-complete": true });
    state.player = {
      ...state.player,
      stats: { ...state.player.stats, body: STAT_HARD_CAP },
    };
    expectAdvancementError(() => raiseStat(state, "body"), "stat-at-cap");
  });

  it("runs dry once every earned point is spent", () => {
    let state = makeState({ "act1-complete": true });
    state = { ...state, player: raiseStat(state, "body") }; // 3 -> 1 left
    expectAdvancementError(
      () => raiseStat(state, "reflexes"),
      "insufficient-points",
    );
  });
});

describe("unlockAbility", () => {
  const cheapest = [...advancementPool].sort((a, b) => a.cost - b.cost)[0]!;

  it("unlocks a pool ability and surfaces it via grantedAbilityIds", () => {
    const state = makeState({ "act1-complete": true });
    const player = unlockAbility(state, cheapest.abilityId);
    expect(player.advancement.abilityIds).toContain(cheapest.abilityId);
    expect(player.advancement.pointsSpent).toBe(cheapest.cost);
    expect(grantedAbilityIds(player)).toContain(cheapest.abilityId);
    const combat = createCombat(
      { ...state, player },
      "enc-auric-scout",
    );
    const snapshot = combat.combatants.find(
      (c) => c.id === PLAYER_COMBATANT_ID,
    )!;
    expect(snapshot.abilityIds).toContain(cheapest.abilityId);
  });

  it("rejects abilities outside the advancement pool", () => {
    // A real ability, but not purchasable — enemy/gear content stays out.
    const state = makeState({ "act1-complete": true });
    expectAdvancementError(
      () => unlockAbility(state, "ability-riot-net"),
      "unknown-ability",
    );
    expectAdvancementError(
      () => unlockAbility(state, "no-such-ability"),
      "unknown-ability",
    );
  });

  it("rejects unlocking the same ability twice", () => {
    const state = makeState({
      "act1-complete": true,
      "act2-complete": true,
    });
    const next = { ...state, player: unlockAbility(state, cheapest.abilityId) };
    expectAdvancementError(
      () => unlockAbility(next, cheapest.abilityId),
      "already-unlocked",
    );
  });

  it("rejects unlocks the remaining points cannot cover", () => {
    const priciest = [...advancementPool].sort((a, b) => b.cost - a.cost)[0]!;
    let state = makeState({ "act1-complete": true }); // 3 points
    state = { ...state, player: raiseStat(state, "body") }; // 1 left
    expect(priciest.cost).toBeGreaterThan(availablePoints(state));
    expectAdvancementError(
      () => unlockAbility(state, priciest.abilityId),
      "insufficient-points",
    );
  });

  it("references only real abilities from the pool", () => {
    for (const entry of advancementPool) {
      expect(entry.cost).toBeGreaterThan(0);
      const state = makeState({
        "act1-complete": true,
        "act2-complete": true,
      });
      expect(
        unlockAbility(state, entry.abilityId).advancement.abilityIds,
      ).toContain(entry.abilityId);
    }
  });
});

describe("persistence", () => {
  it("keeps spends and unlocks through a save/load round-trip", () => {
    let state = makeState({ "act1-complete": true, "act2-complete": true });
    state = { ...state, player: raiseStat(state, "tech") };
    state = { ...state, player: unlockAbility(state, "ability-combat-focus") };

    const storage = createMemoryStorage();
    saveGame(state, "slot1", storage, 1);
    const loaded = loadGame("slot1", storage);

    expect(loaded.player.advancement).toEqual(state.player.advancement);
    expect(availablePoints(loaded)).toBe(availablePoints(state));
    expect(grantedAbilityIds(loaded.player)).toContain("ability-combat-focus");
    expect(loaded.player.stats.tech).toBe(state.player.stats.tech);
  });
});
