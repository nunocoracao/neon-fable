import { describe, expect, it } from "vitest";
import { ASSIST_DAMAGE_FLOOR, noAssists } from "../data/assists";
import {
  DIFFICULTIES,
  requireDifficulty,
  tunedCredits,
  tunedEnemyHp,
  type DifficultyId,
} from "../data/difficulty";
import { requireEncounter } from "../data/encounters";
import { requireEnemy } from "../data/enemies";
import { createNewGame, defaultRules, type GameState } from "../state";
import { nextFloat } from "../state/rng";
import { takeAction } from "./actions";
import { BLOODIED_SHARE, applyCombatInjuries } from "./injury";
import { attackOptions } from "./legal";
import { resolveCombat } from "./outcome";
import { outcomesFor } from "./preview";
import { PLAYER_COMBATANT_ID, createCombat } from "./setup";
import { makeCombat, makeCombatant } from "./testSupport";
import { NEUTRAL_TUNING, combatTuning, tunedDamage, tuningFor } from "./tuning";
import type { CombatEvent, CombatState } from "./types";

/**
 * Difficulty and the assists, at every seam they act through — and the
 * guarantee the whole design rests on: that none of them moves a die.
 */

const ENCOUNTER = "enc-auric-scout";
const PRESETS: DifficultyId[] = DIFFICULTIES.map((d) => d.id);

/** Smallest seed whose first draw lands under every clamped chance. */
function seedWhere(pred: (value: number) => boolean): number {
  for (let seed = 0; seed < 100_000; seed++) {
    if (pred(nextFloat({ seed }).value)) return seed;
  }
  throw new Error("no seed found");
}

const HIT_SEED = seedWhere((v) => v < 0.05);

function run(
  difficulty: DifficultyId,
  assists: Partial<Record<string, boolean>> = {},
): GameState {
  return createNewGame({
    seed: 1234,
    rules: {
      difficulty,
      assists: { ...noAssists(), ...assists },
      difficultyChanged: false,
    },
  });
}

/** A duel with tuning written straight onto it, no GameState involved. */
function duel(tuning: CombatState["tuning"]): CombatState {
  return makeCombat(
    [
      makeCombatant({
        id: PLAYER_COMBATANT_ID,
        kind: "player",
        position: { x: 1, y: 1 },
      }),
      makeCombatant({ id: "foe", position: { x: 2, y: 1 } }),
    ],
    { tuning },
  );
}

describe("the tuning a fight carries", () => {
  it("reads an untuned fight as the authored arithmetic", () => {
    const untuned = makeCombat([makeCombatant({ id: "foe" })]);
    expect(untuned.tuning).toBeUndefined();
    expect(combatTuning(untuned)).toEqual(NEUTRAL_TUNING);
    expect(NEUTRAL_TUNING.incomingDamagePct).toBe(100);
    expect(NEUTRAL_TUNING.playerDamageFloor).toBe(0);
  });

  it("takes the preset's incoming scale and the assist's floor off a run", () => {
    expect(tuningFor(run("blackout"))).toEqual({
      incomingDamagePct: requireDifficulty("blackout").modifiers
        .incomingDamagePct,
      playerDamageFloor: 0,
    });
    expect(tuningFor(run("drift", { "damage-floor": true }))).toEqual({
      incomingDamagePct: requireDifficulty("drift").modifiers.incomingDamagePct,
      playerDamageFloor: ASSIST_DAMAGE_FLOOR,
    });
  });

  it("is snapshotted onto the fight at setup, per preset", () => {
    for (const preset of PRESETS) {
      const state = run(preset);
      expect(createCombat(state, ENCOUNTER).tuning).toEqual(tuningFor(state));
    }
  });

  it("survives a JSON round-trip with the rest of the fight", () => {
    const combat = createCombat(run("blackout"), ENCOUNTER);
    const reloaded = JSON.parse(JSON.stringify(combat)) as CombatState;
    expect(combatTuning(reloaded)).toEqual(combatTuning(combat));
  });
});

describe("tunedDamage", () => {
  const harsh = duel({ incomingDamagePct: 150, playerDamageFloor: 0 });
  const floored = duel({ incomingDamagePct: 100, playerDamageFloor: 5 });
  const player = harsh.combatants[0]!;
  const foe = harsh.combatants[1]!;

  it("scales what the other side lands on the player's", () => {
    expect(tunedDamage(harsh, foe, player, 10)).toBe(15);
  });

  it("never scales what the player's side lands on the other one", () => {
    expect(tunedDamage(harsh, player, foe, 10)).toBe(10);
  });

  it("floors what the player's side lands, and only raises it", () => {
    expect(tunedDamage(floored, player, foe, 1)).toBe(5);
    expect(tunedDamage(floored, player, foe, 5)).toBe(5);
    expect(tunedDamage(floored, player, foe, 12)).toBe(12);
  });

  it("never floors what the other side lands on the player", () => {
    expect(tunedDamage(floored, foe, player, 1)).toBe(1);
  });

  it("leaves a miss a miss under every combination", () => {
    for (const state of [harsh, floored]) {
      expect(tunedDamage(state, foe, player, 0)).toBe(0);
      expect(tunedDamage(state, player, foe, 0)).toBe(0);
      expect(tunedDamage(state, foe, player, -3)).toBe(0);
    }
  });

  it("keeps a landed blow worth a point on the softest setting", () => {
    const soft = duel({ incomingDamagePct: 1, playerDamageFloor: 0 });
    expect(tunedDamage(soft, soft.combatants[1]!, soft.combatants[0]!, 4)).toBe(
      1,
    );
  });
});

describe("the seams, preset by preset", () => {
  it("stands enemies up with the frame the preset says", () => {
    for (const preset of PRESETS) {
      const combat = createCombat(run(preset), ENCOUNTER);
      const pct = requireDifficulty(preset).modifiers.enemyHpPct;
      for (const foe of combat.combatants.filter((c) => c.kind === "enemy")) {
        const authored = requireEnemy(foe.enemyId!).maxHp;
        expect(foe.maxHp).toBe(tunedEnemyHp(authored, pct));
        // Current and max agree, so every share read off a frame is a
        // share of the frame this fight actually has.
        expect(foe.hp).toBe(foe.maxHp);
      }
    }
  });

  it("pays a won fight what the preset says it was worth", () => {
    const { rewards } = requireEncounter(ENCOUNTER);
    for (const preset of PRESETS) {
      const state = run(preset);
      const combat: CombatState = {
        ...createCombat(state, ENCOUNTER),
        status: "victory",
      };
      const paid = resolveCombat(state, combat).credits - state.credits;
      expect(paid).toBe(
        tunedCredits(
          rewards.credits,
          requireDifficulty(preset).modifiers.creditRewardPct,
        ),
      );
    }
  });

  it("leaves the authored reward items alone at every preset", () => {
    const { rewards } = requireEncounter(ENCOUNTER);
    for (const preset of PRESETS) {
      const state = run(preset);
      const combat: CombatState = {
        ...createCombat(state, ENCOUNTER),
        status: "victory",
      };
      const after = resolveCombat(state, combat);
      for (const reward of rewards.items ?? []) {
        expect(
          after.inventory.stacks.some((s) => s.itemId === reward.itemId),
        ).toBe(true);
      }
    }
  });

  it("marks a bloodied player at the preset's own threshold", () => {
    // Finishing at a fifth of frame: the authored line exactly, so
    // Grind marks and Drift (half the share) does not.
    const at = (hp: number, state: GameState): boolean => {
      const combat = makeCombat(
        [
          makeCombatant({
            id: PLAYER_COMBATANT_ID,
            kind: "player",
            maxHp: 30,
            hp,
          }),
          makeCombatant({ id: "foe", hp: 0 }),
        ],
        { status: "victory" },
      );
      return applyCombatInjuries(state, combat).player.injury != null;
    };
    const bloodied = 30 * BLOODIED_SHARE;
    expect(at(bloodied, run("grind"))).toBe(true);
    expect(at(bloodied, run("drift"))).toBe(false);
    expect(at(bloodied, run("blackout"))).toBe(true);
    // Blackout's wider share catches somebody Grind would have let go.
    const scratched = 30 * BLOODIED_SHARE * 1.4;
    expect(at(scratched, run("grind"))).toBe(false);
    expect(at(scratched, run("blackout"))).toBe(true);
  });

  it("still marks anybody who actually went down, on every preset", () => {
    const log: CombatEvent[] = [
      { type: "defeated", combatantId: PLAYER_COMBATANT_ID },
    ];
    for (const preset of PRESETS) {
      const combat = makeCombat(
        [
          makeCombatant({
            id: PLAYER_COMBATANT_ID,
            kind: "player",
            maxHp: 30,
            hp: 30,
          }),
          makeCombatant({ id: "foe", hp: 0 }),
        ],
        { status: "victory", log },
      );
      expect(applyCombatInjuries(run(preset), combat).player.injury).not.toBe(
        null,
      );
    }
  });
});

describe("what the engine lands is what the UI quoted", () => {
  /** The player, in reach, with the fight tuned however asked. */
  function pointBlank(state: GameState): CombatState {
    const combat = createCombat(state, ENCOUNTER);
    const foe = combat.combatants.find((c) => c.kind === "enemy")!;
    return {
      ...combat,
      rng: { seed: HIT_SEED },
      turnIndex: combat.initiativeOrder.indexOf(PLAYER_COMBATANT_ID),
      combatants: combat.combatants.map((c) =>
        c.id === PLAYER_COMBATANT_ID
          ? { ...c, position: { x: foe.position.x - 1, y: foe.position.y } }
          : c,
      ),
      actionUsed: false,
    };
  }

  it("quotes and lands the same figure, at every preset and either floor", () => {
    for (const preset of PRESETS) {
      for (const floor of [false, true]) {
        const combat = pointBlank(run(preset, { "damage-floor": floor }));
        const option = attackOptions(combat)[0];
        expect(option).toBeDefined();
        const chip = outcomesFor(combat, { kind: "attack" }, option!.targetId);
        expect(chip[0]?.damageMax).toBe(option!.damage);

        const after = takeAction(combat, {
          type: "attack",
          targetId: option!.targetId,
        });
        const blow = after.log.find((e) => e.type === "attacked");
        expect(blow).toMatchObject({ hit: true, damage: option!.damage });
      }
    }
  });

  it("floors the quoted figure too, not only the resolved one", () => {
    const bare = pointBlank(run("grind"));
    const assisted = pointBlank(run("grind", { "damage-floor": true }));
    const raw = attackOptions(bare)[0]!.damage;
    const floored = attackOptions(assisted)[0]!.damage;
    expect(floored).toBe(Math.max(raw, ASSIST_DAMAGE_FLOOR));
  });
});

describe("determinism", () => {
  /**
   * Plays the same scripted fight and reports which draws came back:
   * every hit/miss the log records, in order. Damage is deliberately
   * excluded — that is the figure a preset is *allowed* to move.
   */
  function rolls(state: GameState): boolean[] {
    let combat = createCombat(state, ENCOUNTER);
    const foe = combat.combatants.find((c) => c.kind === "enemy")!;
    combat = {
      ...combat,
      turnIndex: combat.initiativeOrder.indexOf(PLAYER_COMBATANT_ID),
      actionUsed: false,
      combatants: combat.combatants.map((c) =>
        c.id === PLAYER_COMBATANT_ID
          ? { ...c, position: { x: foe.position.x - 1, y: foe.position.y } }
          : c,
      ),
    };
    for (let i = 0; i < 6 && combat.status === "active"; i++) {
      try {
        combat = takeAction(combat, { type: "attack", targetId: foe.id });
      } catch {
        // Whoever is acting cannot reach; pass the turn and carry on.
      }
      if (combat.status !== "active") break;
      combat = takeAction(combat, { type: "end-turn" });
    }
    return combat.log
      .filter((e) => e.type === "attacked")
      .map((e) => (e as { hit: boolean }).hit);
  }

  it("draws identically at every preset with every assist combination", () => {
    const baseline = rolls(run("grind"));
    expect(baseline.length).toBeGreaterThan(0);
    for (const preset of PRESETS) {
      for (const floor of [false, true]) {
        for (const preview of [false, true]) {
          expect(
            rolls(
              run(preset, {
                "damage-floor": floor,
                "always-preview": preview,
                "bold-telegraphs": preview,
                "breach-rescue": floor,
              }),
            ),
          ).toEqual(baseline);
        }
      }
    }
  });

  it("advances the RNG the same number of times whatever the preset", () => {
    const seeds = PRESETS.map((preset) => {
      const state = run(preset);
      let combat = createCombat(state, ENCOUNTER);
      combat = takeAction(combat, { type: "end-turn" });
      return combat.rng.seed;
    });
    expect(new Set(seeds).size).toBe(1);
  });

  it("replays one fight to one result, given its own tuning", () => {
    const state = run("blackout", { "damage-floor": true });
    const once = createCombat(state, ENCOUNTER);
    const again = createCombat(state, ENCOUNTER);
    expect(again).toEqual(once);
    expect(takeAction(again, { type: "end-turn" })).toEqual(
      takeAction(once, { type: "end-turn" }),
    );
  });

  it("resolves a saved fight on its own snapshot, not on the run's rules", () => {
    // The fight was started on Blackout; the player has since switched
    // the run to Drift. A blow in the saved fight still weighs what
    // Blackout said it weighed.
    const started = run("blackout");
    const combat = createCombat(started, ENCOUNTER);
    const switched: GameState = { ...started, rules: defaultRules() };
    const foe = combat.combatants.find((c) => c.kind === "enemy")!;
    const player = combat.combatants.find((c) => c.kind === "player")!;
    expect(tunedDamage(combat, foe, player, 10)).toBe(
      tunedDamage(createCombat(started, ENCOUNTER), foe, player, 10),
    );
    expect(tuningFor(switched)).toEqual(NEUTRAL_TUNING);
    expect(combatTuning(combat)).not.toEqual(NEUTRAL_TUNING);
  });
});
