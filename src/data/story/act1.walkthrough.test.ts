import { describe, expect, it } from "vitest";
import { baseStats, createCharacter } from "../../character";
import {
  abilityOptions,
  activeCombatant,
  attackOptions,
  createCombat,
  itemOptions,
  livingEnemies,
  manhattan,
  playerCombatant,
  reachableTiles,
  resolveCombat,
  runEnemyTurns,
  takeAction,
  type CombatAction,
  type CombatState,
} from "../../combat";
import { hasItem, installEnhancement } from "../../inventory";
import { applyChoice, getNode } from "../../narrative";
import type { StoryArc } from "../../narrative/types";
import { createNewGame, type GameState } from "../../state";
import { getBackground } from "../backgrounds";
import { act1Arc } from "./act1";
import { introArc } from "./intro";

/**
 * Scripted end-to-end walkthroughs of the three Act 1 outcome routes,
 * entirely at the state level: intro job -> chapter -> ending, with every
 * fight autoplayed through the real combat engine. Each route scans RNG
 * seeds until its fights all end in victory (only combat losses are
 * retried — a gating or graph regression fails immediately), then asserts
 * the distinguishing flags, items, and allies at chapter end.
 */

/** Thrown when a fight is lost — the signal to retry with the next seed. */
class RouteFightLost extends Error {}

/** One player action, mirroring the combat screen's default controls. */
function chooseAction(combat: CombatState): CombatAction {
  const player = playerCombatant(combat);

  const item = itemOptions(combat)[0];
  if (item && player.hp <= player.maxHp - 10) {
    return { type: "use-item", itemId: item.itemId };
  }

  const ability = abilityOptions(combat).find((o) => o.targets.length > 0);
  const abilityTarget = ability?.targets[0];
  if (ability && abilityTarget) {
    return {
      type: "use-ability",
      abilityId: ability.abilityId,
      targetId: abilityTarget.targetId,
    };
  }

  const attack = attackOptions(combat)[0];
  if (attack) return { type: "attack", targetId: attack.targetId };

  const foes = livingEnemies(combat);
  if (combat.moveRemaining > 0 && foes.length > 0) {
    const nearest = foes.reduce((a, b) =>
      manhattan(player.position, b.position) <
      manhattan(player.position, a.position)
        ? b
        : a,
    );
    const reach = reachableTiles(combat);
    for (const to of [
      { x: player.position.x + 1, y: player.position.y },
      { x: player.position.x - 1, y: player.position.y },
      { x: player.position.x, y: player.position.y + 1 },
      { x: player.position.x, y: player.position.y - 1 },
    ]) {
      if (
        manhattan(to, nearest.position) <
          manhattan(player.position, nearest.position) &&
        reach.some((t) => t.x === to.x && t.y === to.y)
      ) {
        return { type: "move", to };
      }
    }
  }

  return { type: "end-turn" };
}

/** Plays an encounter to the end; throws RouteFightLost on anything but victory. */
function autoBattle(state: GameState, encounterId: string): GameState {
  let combat = createCombat(state, encounterId);
  let guard = 0;
  while (combat.status === "active" && guard++ < 400) {
    combat =
      activeCombatant(combat).kind === "enemy"
        ? runEnemyTurns(combat)
        : takeAction(combat, chooseAction(combat));
  }
  if (combat.status !== "victory") {
    throw new RouteFightLost(`${encounterId} ended in ${combat.status}`);
  }
  return resolveCombat(state, combat);
}

type RouteStep =
  | { kind: "arc"; arc: StoryArc; entry: string; choices: string[] }
  | { kind: "do"; run(state: GameState): GameState };

interface RouteResult {
  state: GameState;
  endings: string[];
}

/**
 * Drives choice ids through the narrative engine from each segment's
 * entry node — segments model walking up to an NPC or map interactable.
 * applyChoice throws on unmet requirements, so a route doubles as proof
 * that its gates actually pass.
 */
function runRoute(state: GameState, steps: RouteStep[]): RouteResult {
  const endings: string[] = [];
  for (const step of steps) {
    if (step.kind === "do") {
      state = step.run(state);
      continue;
    }
    let nodeId: string | null = step.entry;
    for (const choiceId of step.choices) {
      if (!nodeId) throw new Error(`route ended before choice "${choiceId}"`);
      const node = getNode(step.arc, nodeId);
      if (!node) throw new Error(`missing node "${nodeId}"`);
      const outcome = applyChoice(state, node, choiceId);
      state = outcome.state;
      nodeId = outcome.nextNodeId;
      if (outcome.encounterId) state = autoBattle(state, outcome.encounterId);
      if (outcome.ended && outcome.endingId) endings.push(outcome.endingId);
    }
  }
  return { state, endings };
}

function findRouteSeed(
  makeState: (seed: number) => GameState,
  steps: RouteStep[],
  maxSeed = 400,
): RouteResult {
  for (let seed = 1; seed <= maxSeed; seed++) {
    try {
      return runRoute(makeState(seed), steps);
    } catch (error) {
      if (error instanceof RouteFightLost) continue;
      throw error;
    }
  }
  throw new Error(`no seed up to ${maxSeed} completed the route`);
}

function makeState(
  backgroundId: string,
  bump: (allocation: ReturnType<typeof baseStats>) => void,
  seed: number,
): GameState {
  const allocation = baseStats();
  bump(allocation);
  const character = createCharacter({
    name: "Vex",
    background: getBackground(backgroundId)!,
    allocation,
  });
  return createNewGame({ character, seed });
}

/** Intro played to a delivered spike (fighting the scout). */
const introDeliveredFighting: RouteStep = {
  kind: "arc",
  arc: introArc,
  entry: "start",
  choices: [
    "agree-terms",
    "walk-on",
    "street-nod",
    "sit-agreed",
    "take-advance",
    "take-job",
    "jump-scout",
    "back-to-bar",
    "hand-over",
  ],
};

describe("act1 walkthroughs", () => {
  it("court route: street kid dives the culvert and stops the Undertow", () => {
    const { state, endings } = findRouteSeed(
      (seed) =>
        makeState(
          "gutter-courier",
          (a) => {
            a.body += 5;
            a.reflexes += 3;
            a.tech += 3;
            a.intelligence += 4;
          },
          seed,
        ),
      [
        introDeliveredFighting,
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-start",
          choices: [
            "follow",
            "about-spike",
            "on-to-business",
            "descend",
            "to-den",
            "knock", // street-exclusive scene: culvert + relay knowledge
            "back",
            "browse",
            "buy-gills", // credits-gated enhancement purchase
            "done",
            "leave",
          ],
        },
        {
          kind: "do",
          run(state) {
            const loadout = installEnhancement(
              state.player,
              state.inventory,
              "cyb-silt-gills",
            );
            return {
              ...state,
              player: loadout.character,
              inventory: loadout.inventory,
            };
          },
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-ferrow",
          choices: [
            "oath", // commit: act1-side open -> court
            "to-gate",
            "culvert", // enhancement + flag gate skips the gate fight
            "take-key",
            "mark",
            "back",
            "court",
            "inner-key", // key item varies the climax battle
            "face-custodian",
            "light-it",
            "rest",
          ],
        },
      ],
    );

    expect(endings).toEqual(["job-done", "act1-court"]);
    expect(state.flags["act1-outcome"]).toBe("court");
    expect(state.flags["act1-complete"]).toBe(true);
    expect(state.flags["ally-cistern-court"]).toBe(true);
    expect(state.flags["court-oath"]).toBe(true);
    expect(state.flags["act1-side"]).toBe("court");
    expect(state.flags["undertow-stopped"]).toBe(true);
    expect(state.flags["gate-route"]).toBe("culvert");
    // The gate fight never happened; the climax was the inner-route battle.
    expect(state.flags["combat:enc-pump-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-pumpworks-inner"]).toBe("victory");
    expect(hasItem(state.inventory, "msc-override-key")).toBe(true);
    expect(state.flags["betrayed-court"]).toBeUndefined();
    expect(state.location).toBe("greywater-steps");
  });

  it("voss route: corp analyst bluffs, badges through, and sells the ledger", () => {
    const { state, endings } = findRouteSeed(
      (seed) =>
        makeState(
          "tower-analyst",
          (a) => {
            a.body += 4;
            a.reflexes += 4; // ranged build: the compact pistol carries the fight
            a.cool += 4;
            a.intelligence += 3;
          },
          seed,
        ),
      [
        {
          kind: "arc",
          arc: introArc,
          entry: "start",
          choices: [
            "agree-terms",
            "walk-on",
            "corp-talk",
            "sit-agreed",
            "take-advance",
            "take-job",
            "bluff-scout", // cool 8 gate: the scout fight never happens
            "back-to-bar",
            "hand-over",
          ],
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-start",
          choices: [
            "follow",
            "about-spike",
            "on-to-business",
            "glasshouse",
            "audit-cadence", // corp-exclusive scene: the duty pass
            "walk-up",
            "take-deal", // commit: act1-side open -> voss
            "descend",
            "to-gate",
            "pass", // item gate skips the gate fight
            "siphon-deal",
            "back",
            "voss",
            "proceed",
            "fight", // climax varies: Court defenders, not Auric
            "burn-sable",
            "sign",
          ],
        },
      ],
    );

    expect(endings).toEqual(["job-done", "act1-voss"]);
    expect(state.flags["act1-outcome"]).toBe("voss");
    expect(state.flags["act1-complete"]).toBe(true);
    expect(state.flags["ally-voss"]).toBe(true);
    expect(state.flags["act1-side"]).toBe("voss");
    expect(state.flags["sable-burned"]).toBe(true);
    expect(state.flags["undertow-delayed"]).toBe(true);
    // Mutually exclusive ally: committing to Voss locked the Court oath out.
    expect(state.flags["court-oath"]).toBeUndefined();
    expect(state.flags["ally-cistern-court"]).toBeUndefined();
    // Both the intro scout fight and the gate fight were avoided.
    expect(state.flags["scout-outcome"]).toBe("bluffed");
    expect(state.flags["combat:enc-auric-scout"]).toBeUndefined();
    expect(state.flags["gate-route"]).toBe("pass");
    expect(state.flags["combat:enc-pump-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-pumpworks-voss"]).toBe("victory");
    expect(hasItem(state.inventory, "msc-auric-writ")).toBe(true);
    expect(state.credits).toBeGreaterThanOrEqual(300);
  });

  it("broadcast route: grid diver keeps the spike and lights every screen", () => {
    const { state, endings } = findRouteSeed(
      (seed) =>
        makeState(
          "grid-diver",
          (a) => {
            a.body += 5;
            a.reflexes += 5;
            a.intelligence += 5;
          },
          seed,
        ),
      [
        {
          kind: "arc",
          arc: introArc,
          entry: "start",
          choices: [
            "go-cold",
            "walk-on",
            "pay-cover",
            "sit-cold",
            "hear-out",
            "take-job",
            "jump-scout",
            "back-to-bar",
            "keep-spike", // the cracked spike stays in the jacket
          ],
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-start",
          choices: [
            "follow",
            "show-spike", // item gate: confess the only copy
            "on-to-business",
            "descend",
            "to-shrine",
            "jack-in", // net-exclusive scene: Hex, Voss's byline, the Crown
            "ask-crown",
            "surface",
          ],
        },
        {
          kind: "arc",
          arc: act1Arc,
          entry: "a1-pumpgate",
          choices: [
            "hex", // tech-ally gate skips the gate fight
            "scout",
            "back",
            "crown-open", // lone route: commits to neither faction
            "own-copy",
            "fight",
            "name-author",
            "vanish",
          ],
        },
      ],
    );

    expect(endings).toEqual(["kept-it", "act1-broadcast"]);
    expect(state.flags["act1-outcome"]).toBe("broadcast");
    expect(state.flags["act1-complete"]).toBe(true);
    expect(state.flags["wanted-by-auric"]).toBe(true);
    expect(state.flags["voss-exposed"]).toBe(true);
    expect(state.flags["only-copy"]).toBe(true);
    // Committed to nobody; both faction flags stayed unset.
    expect(state.flags["act1-side"]).toBe("open");
    expect(state.flags["ally-cistern-court"]).toBeUndefined();
    expect(state.flags["ally-voss"]).toBeUndefined();
    expect(state.flags["gate-route"]).toBe("hex");
    expect(state.flags["combat:enc-pump-gate"]).toBeUndefined();
    expect(state.flags["combat:enc-relay-crown"]).toBe("victory");
    // The broadcast consumed the spike, and travel ended the chapter topside.
    expect(hasItem(state.inventory, "msc-cracked-spike")).toBe(false);
    expect(state.location).toBe("cinder-plaza");
  });
});
