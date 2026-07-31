import { describe, expect, it } from "vitest";
import {
  PLAYER_COMBATANT_ID,
  createCombat,
  stepBudget,
  takeAction,
  threatTiles,
  type CombatState,
} from "../combat";
import { perks } from "../data/perks";
import { checkRequirement } from "../narrative";
import {
  addItem,
  armorValue,
  dialogueStats,
  equip,
  installEnhancement,
  staticLevel,
  useConsumable,
} from "../inventory";
import { createNewGame, type GameState } from "../state";
import { NO_PERKS, characterPerks, foldPerkEffects, perkModifiers } from "./perks";

/**
 * What each perk actually *does*, asserted at the one place it does it.
 *
 * Every case here is written the same way: take the same run twice,
 * give one of them the perk, and read the same derivation the game
 * reads — armorValue, dialogueStats, staticLevel, useConsumable, the
 * install rule, the fight's step budget, its threat telegraph, its one
 * damage path. If a perk ever stops being wired to its seam, exactly
 * one of these fails and it names the seam.
 */

function withPerks(state: GameState, ...perkIds: string[]): GameState {
  return {
    ...state,
    player: {
      ...state.player,
      advancement: { ...state.player.advancement, perkIds },
    },
  };
}

function makeState(): GameState {
  return createNewGame({ playerName: "Vex", seed: 5 });
}

/** The player's snapshot in a fresh fight against the same encounter. */
function playerIn(state: GameState, encounterId = "enc-auric-scout") {
  const combat = createCombat(state, encounterId);
  return combat.combatants.find((c) => c.id === PLAYER_COMBATANT_ID)!;
}

describe("perkModifiers", () => {
  it("folds nothing to nothing", () => {
    expect(perkModifiers([])).toEqual(NO_PERKS);
    expect(characterPerks(makeState().player)).toEqual(NO_PERKS);
  });

  it("ignores a perk id this build no longer has", () => {
    expect(perkModifiers(["perk-nonexistent"])).toEqual(NO_PERKS);
  });

  it("sums additive figures and takes the strongest threshold", () => {
    const folded = foldPerkEffects([
      { armorBonus: 1, secondWindBelow: 20 },
      { armorBonus: 2, secondWindBelow: 40 },
    ]);
    expect(folded.armorBonus).toBe(3);
    expect(folded.secondWindBelow).toBe(40);
  });

  it("reads every perk in the pool as a real set of figures", () => {
    for (const perk of perks) {
      expect(perkModifiers([perk.id])).not.toEqual(NO_PERKS);
    }
  });
});

describe("Pain Editor — armorValue", () => {
  it("adds its point to whatever the outfit provides", () => {
    const base = makeState();
    expect(armorValue(withPerks(base, "perk-pain-editor").player)).toBe(
      armorValue(base.player) + 1,
    );
  });

  it("reaches the fight through the armor snapshot", () => {
    const base = makeState();
    const worn = equip(
      base.player,
      addItem(base.inventory, "out-cordon-plate"),
      "out-cordon-plate",
    );
    const dressed: GameState = {
      ...base,
      player: worn.character,
      inventory: worn.inventory,
    };
    expect(playerIn(withPerks(dressed, "perk-pain-editor")).armor).toBe(
      playerIn(dressed).armor + 1,
    );
  });
});

describe("Gutter Surgeon — healedAmount", () => {
  it("restores half again out of combat", () => {
    const base = makeState();
    const hurt: GameState = {
      ...base,
      player: { ...base.player, hp: 1 },
      inventory: addItem(base.inventory, "con-trauma-patch", 2),
    };
    const plain = useConsumable(hurt.player, hurt.inventory, "con-trauma-patch");
    const perked = withPerks(hurt, "perk-gutter-surgeon");
    const healed = useConsumable(
      perked.player,
      perked.inventory,
      "con-trauma-patch",
    );
    // The item promises 10; the habit makes it 15.
    expect(plain.character.hp).toBe(11);
    expect(healed.character.hp).toBe(16);
  });

  it("is worth the same inside a fight", () => {
    const base = makeState();
    const hurt: GameState = {
      ...base,
      player: { ...base.player, hp: 1 },
      inventory: addItem(base.inventory, "con-trauma-patch", 2),
    };
    const heal = (state: GameState): number => {
      const combat = takeAction(createCombat(state, "enc-auric-scout"), {
        type: "use-item",
        itemId: "con-trauma-patch",
      });
      const healed = combat.log.find((e) => e.type === "healed");
      return healed?.type === "healed" ? healed.amount : 0;
    };
    expect(heal(hurt)).toBe(10);
    expect(heal(withPerks(hurt, "perk-gutter-surgeon"))).toBe(15);
  });
});

describe("Chrome Whisperer — the Static fold", () => {
  it("makes a dampener quiet half again as much", () => {
    const base = makeState();
    // Loud optics (+4) under a baffle weave (-2): the noise reads 2,
    // and the perk makes the weave worth 3 rather than 2.
    const loud = installEnhancement(
      base.player,
      addItem(base.inventory, "cyb-warden-optics"),
      "cyb-warden-optics",
    );
    const quieted = installEnhancement(
      loud.character,
      addItem(loud.inventory, "cyb-baffle-weave"),
      "cyb-baffle-weave",
    );
    const state: GameState = {
      ...base,
      player: quieted.character,
      inventory: quieted.inventory,
    };
    expect(staticLevel(state.player)).toBe(2);
    expect(staticLevel(withPerks(state, "perk-chrome-whisperer").player)).toBe(1);
  });

  it("leaves noisy implants exactly as loud", () => {
    const base = makeState();
    const loud = installEnhancement(
      base.player,
      addItem(base.inventory, "cyb-optic-suite"),
      "cyb-optic-suite",
    );
    const state: GameState = {
      ...base,
      player: loud.character,
      inventory: loud.inventory,
    };
    expect(staticLevel(withPerks(state, "perk-chrome-whisperer").player)).toBe(
      staticLevel(state.player),
    );
  });
});

describe("Load Bearer — the install rule", () => {
  it("fits one more point of chrome than the stat line allows", () => {
    const base = makeState();
    const capacity = base.player.derived.neuralCapacity;
    // Fill the frame to the brim: a 3-cost implant into a 3-capacity
    // gap is refused, and allowed once the perk lends the point.
    const loaded = {
      ...base.player,
      neuralLoad: capacity - 2,
    };
    const inventory = addItem(base.inventory, "cyb-lattice-coprocessor");
    expect(() =>
      installEnhancement(loaded, inventory, "cyb-lattice-coprocessor"),
    ).toThrow(/capacity/);
    const perked = {
      ...loaded,
      advancement: { ...loaded.advancement, perkIds: ["perk-load-bearer"] },
    };
    expect(
      installEnhancement(perked, inventory, "cyb-lattice-coprocessor")
        .character.neuralLoad,
    ).toBe(capacity + 1);
  });
});

describe("Silver Tongue and Poker Face — dialogueStats", () => {
  it("adds a point of Cool to every conversation, and to no fight", () => {
    const base = makeState();
    const perked = withPerks(base, "perk-silver-tongue");
    expect(dialogueStats(perked.player).cool).toBe(
      dialogueStats(base.player).cool + 1,
    );
    // The fight's own figures are untouched — a talker is not a fighter.
    expect(playerIn(perked).stats.cool).toBe(playerIn(base).stats.cool);
  });

  it("opens a Cool gate the plain run cannot reach", () => {
    const base = makeState();
    const gate = {
      type: "stat",
      stat: "cool",
      value: dialogueStats(base.player).cool + 1,
    } as const;
    expect(checkRequirement(base, gate)).toBe(false);
    expect(checkRequirement(withPerks(base, "perk-silver-tongue"), gate)).toBe(
      true,
    );
  });

  it("refuses the noise's bill without paying a bonus for silence", () => {
    const base = makeState();
    // Quiet: poise has nothing to cancel and is worth nothing.
    expect(dialogueStats(withPerks(base, "perk-poker-face").player).cool).toBe(
      dialogueStats(base.player).cool,
    );
    // Screaming: the band's Cool penalty is what poise refuses.
    let character = base.player;
    let inventory = base.inventory;
    for (const id of ["cyb-warden-optics", "cyb-torsion-frame", "cyb-cascade-governor"]) {
      inventory = addItem(inventory, id);
      const installed = installEnhancement(
        { ...character, neuralLoad: 0, derived: { ...character.derived, neuralCapacity: 99 } },
        inventory,
        id,
      );
      character = installed.character;
      inventory = installed.inventory;
    }
    const loud: GameState = { ...base, player: character, inventory };
    const penalty =
      dialogueStats(loud.player).cool - dialogueStats(base.player).cool;
    expect(penalty).toBeLessThan(0);
    expect(dialogueStats(withPerks(loud, "perk-poker-face").player).cool).toBe(
      dialogueStats(loud.player).cool + Math.min(2, -penalty),
    );
  });
});

describe("Known Face — the faction gate", () => {
  const gate = {
    type: "reputation",
    factionId: "court",
    value: "warm",
  } as const;

  it("opens a door ten points before the ledger would", () => {
    const base = makeState();
    // Warm sits at 20; standing at 12 is short of it by less than the
    // rapport the perk lends.
    const standing: GameState = {
      ...base,
      reputation: { standing: { ...base.reputation.standing, court: 12 } },
    };
    expect(checkRequirement(standing, gate)).toBe(false);
    expect(checkRequirement(withPerks(standing, "perk-known-face"), gate)).toBe(
      true,
    );
  });

  it("does not make a disliked runner more disliked", () => {
    const base = makeState();
    const cold = {
      type: "reputation",
      factionId: "court",
      value: -20,
      mode: "at-most",
    } as const;
    const disliked: GameState = {
      ...base,
      reputation: { standing: { ...base.reputation.standing, court: -20 } },
    };
    expect(checkRequirement(disliked, cold)).toBe(true);
    expect(checkRequirement(withPerks(disliked, "perk-known-face"), cold)).toBe(
      true,
    );
  });

  it("never writes the ledger — the epilogue reads what was earned", () => {
    const base = withPerks(makeState(), "perk-known-face");
    checkRequirement(base, gate);
    expect(base.reputation.standing.court).toBe(0);
  });
});

describe("Ghost Step — the step budget", () => {
  it("adds a step to the opening turn and to every turn after it", () => {
    const base = makeState();
    const plain = createCombat(base, "enc-auric-scout");
    const perked = createCombat(withPerks(base, "perk-ghost-step"), "enc-auric-scout");
    expect(stepBudget(playerIn(withPerks(base, "perk-ghost-step")))).toBe(
      stepBudget(playerIn(base)) + 1,
    );
    // The opening turn belongs to whoever won initiative; compare the
    // player's own budget on a turn that is theirs.
    const playerTurn = (state: CombatState): number => {
      let next = state;
      for (let i = 0; i < 8; i++) {
        if (next.initiativeOrder[next.turnIndex] === PLAYER_COMBATANT_ID) {
          return next.moveRemaining;
        }
        next = takeAction(next, { type: "end-turn" });
      }
      throw new Error("player never got a turn");
    };
    expect(playerTurn(perked)).toBe(playerTurn(plain) + 1);
  });
});

describe("Cold Read — the threat telegraph", () => {
  it("marks hostile reach that a plain run never sees", () => {
    const base = makeState();
    const plain = createCombat(base, "enc-auric-scout");
    const perked = createCombat(
      withPerks(base, "perk-cold-read"),
      "enc-auric-scout",
    );
    // Nothing is winding up on turn one, so the plain board is clean.
    expect(threatTiles(plain)).toEqual([]);
    const marked = threatTiles(perked);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((tile) => tile.role === "threat")).toBe(true);
    // Every marked tile is ground some living hostile could actually
    // strike from where it stands.
    const foes = perked.combatants.filter((c) => c.kind === "enemy");
    for (const tile of marked) {
      const reachable = foes.some(
        (foe) =>
          Math.abs(foe.position.x - tile.x) + Math.abs(foe.position.y - tile.y) <=
          5,
      );
      expect(reachable).toBe(true);
    }
  });

  it("shows nothing once the fight is over", () => {
    const base = withPerks(makeState(), "perk-cold-read");
    const combat = createCombat(base, "enc-auric-scout");
    expect(threatTiles({ ...combat, status: "victory" })).toEqual([]);
  });
});

describe("Second Wind — the damage path", () => {
  /** Hits the player with one heavy ability until the log settles. */
  function batter(state: GameState): CombatState {
    let combat = createCombat(state, "enc-auric-scout");
    // A clean, deterministic blow: drive the player's hp down by hand
    // through the engine's own path, one enemy swing at a time.
    for (let i = 0; i < 40 && combat.status === "active"; i++) {
      const actor = combat.combatants.find(
        (c) => c.id === combat.initiativeOrder[combat.turnIndex],
      )!;
      if (actor.kind === "enemy") {
        try {
          combat = takeAction(combat, {
            type: "attack",
            targetId: PLAYER_COMBATANT_ID,
          });
        } catch {
          // Out of reach: walk in and try again next turn.
          combat = takeAction(combat, {
            type: "move",
            to: {
              x: Math.max(0, actor.position.x - 1),
              y: actor.position.y,
            },
          });
        }
      }
      if (combat.status !== "active") break;
      combat = takeAction(combat, { type: "end-turn" });
    }
    return combat;
  }

  it("answers the blow that drops the player under a third of their frame", () => {
    const perked = withPerks(makeState(), "perk-second-wind");
    const combat = batter(perked);
    const wind = combat.log.find((e) => e.type === "second-wind");
    expect(wind, "the wind never fired").toBeDefined();
    if (wind?.type !== "second-wind") return;
    const player = combat.combatants.find((c) => c.id === PLAYER_COMBATANT_ID)!;
    // A quarter of the frame, and reported after the blow that caused it.
    expect(wind.amount).toBe(Math.round(player.maxHp * 0.25));
    expect(player.secondWindSpent).toBe(true);
    const windIndex = combat.log.indexOf(wind);
    expect(combat.log[windIndex - 1]?.type).toBe("attacked");
  });

  it("fires once a fight, and never for a runner without it", () => {
    const plain = batter(makeState());
    expect(plain.log.some((e) => e.type === "second-wind")).toBe(false);
    const perked = batter(withPerks(makeState(), "perk-second-wind"));
    expect(perked.log.filter((e) => e.type === "second-wind").length).toBe(1);
  });

  it("does not soften the blow that triggered it", () => {
    const perked = batter(withPerks(makeState(), "perk-second-wind"));
    const windIndex = perked.log.findIndex((e) => e.type === "second-wind");
    const blow = perked.log[windIndex - 1];
    expect(blow?.type === "attacked" && blow.damage > 0).toBe(true);
  });
});
