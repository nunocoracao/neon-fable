import {
  abilityOptions,
  activeCombatant,
  attackOptions,
  createCombat,
  itemOptions,
  livingEnemies,
  manhattan,
  reachableTiles,
  runEnemyTurns,
  takeAction,
  type CombatAction,
  type CombatState,
  type CombatStatus,
} from "../combat";
import { getAbility, getItem } from "../data";
import type { GameState } from "../state";
import { combatantDisplayNames } from "./format";
import { t } from "./strings";

/**
 * Scripted-fight support for combat UI tests (no vitest imports so it
 * type-checks in the build). scriptFight plays a battle through the
 * engine with a fixed player policy and records the exact UI gestures —
 * button labels and arrow keys — that reproduce it, so a happy-dom test
 * can replay a deterministic fight click by click. Because the combat
 * screen submits the same engine actions for those gestures, the replay
 * cannot diverge from the simulation.
 */

export type UiStep =
  | { kind: "attack"; targetName: string }
  | { kind: "ability"; abilityName: string; targetName: string | null }
  | { kind: "item"; itemName: string }
  | { kind: "arrow"; key: string }
  | { kind: "end-turn" };

export interface ScriptedFight {
  steps: UiStep[];
  kinds: Set<UiStep["kind"]>;
  status: CombatStatus;
  /**
   * The finished battle. Carried so a seed scan can accept on anything
   * the fight ended up being — how much of the player's frame was left,
   * what the log says happened — rather than on the outcome alone.
   */
  combat: CombatState;
}

const ARROWS = [
  { key: "ArrowRight", dx: 1, dy: 0 },
  { key: "ArrowLeft", dx: -1, dy: 0 },
  { key: "ArrowDown", dx: 0, dy: 1 },
  { key: "ArrowUp", dx: 0, dy: -1 },
] as const;

/**
 * Policy for one player action, mirroring the combat screen's controls:
 * heal when 10+ HP down, else first ability with a target, else first
 * attack option, else a single step toward the nearest enemy, else end
 * the turn.
 *
 * Everything is asked of the **acting** body, never of the player's own.
 * A companion's turn is played through this same bar (see
 * playerCanAct in ./combatScreen.ts), and the screen's arrow keys walk
 * whoever is active — so a policy that read the player's position while
 * a companion was up would record a gesture that moves somebody else's
 * feet, and the replay would quietly diverge from the fight it is
 * supposed to be reproducing.
 */
function choosePlayerStep(
  combat: CombatState,
  names: Record<string, string>,
): { step: UiStep; action: CombatAction } {
  const actor = activeCombatant(combat);
  const nameOf = (id: string): string => names[id] ?? id;

  // The biggest heal actually on offer, off the option's own preview —
  // the same reading the screen's item buttons show.
  const item = itemOptions(combat)
    .filter((option) => option.outcome.heal > 0)
    .sort((a, b) => b.outcome.heal - a.outcome.heal)[0];
  if (item && actor.hp <= actor.maxHp - 10) {
    return {
      step: { kind: "item", itemName: getItem(item.itemId)?.name ?? item.itemId },
      action: { type: "use-item", itemId: item.itemId },
    };
  }

  const ability = abilityOptions(combat).find((o) => o.targets.length > 0);
  const abilityTarget = ability?.targets[0];
  if (ability && abilityTarget) {
    return {
      step: {
        kind: "ability",
        abilityName: getAbility(ability.abilityId)?.name ?? ability.abilityId,
        targetName: ability.selfTarget ? null : nameOf(abilityTarget.targetId),
      },
      action: {
        type: "use-ability",
        abilityId: ability.abilityId,
        targetId: abilityTarget.targetId,
      },
    };
  }

  const attack = attackOptions(combat)[0];
  if (attack) {
    return {
      step: { kind: "attack", targetName: nameOf(attack.targetId) },
      action: { type: "attack", targetId: attack.targetId },
    };
  }

  const foes = livingEnemies(combat);
  if (combat.moveRemaining > 0 && foes.length > 0) {
    const nearest = foes.reduce((a, b) =>
      manhattan(actor.position, b.position) <
      manhattan(actor.position, a.position)
        ? b
        : a,
    );
    const reach = reachableTiles(combat);
    for (const { key, dx, dy } of ARROWS) {
      const to = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (
        manhattan(to, nearest.position) <
          manhattan(actor.position, nearest.position) &&
        reach.some((t) => t.x === to.x && t.y === to.y)
      ) {
        return { step: { kind: "arrow", key }, action: { type: "move", to } };
      }
    }
  }

  return { step: { kind: "end-turn" }, action: { type: "end-turn" } };
}

/** Plays the encounter from the given state and records the UI gestures. */
export function scriptFight(
  state: GameState,
  encounterId: string,
): ScriptedFight {
  let combat = createCombat(state, encounterId);
  const names = combatantDisplayNames(combat.combatants);
  const steps: UiStep[] = [];
  const kinds = new Set<UiStep["kind"]>();
  let guard = 0;
  while (combat.status === "active" && guard++ < 400) {
    if (activeCombatant(combat).kind === "enemy") {
      combat = runEnemyTurns(combat);
      continue;
    }
    const { step, action } = choosePlayerStep(combat, names);
    steps.push(step);
    kinds.add(step.kind);
    combat = takeAction(combat, action);
  }
  return { steps, kinds, status: combat.status, combat };
}

/**
 * Scans RNG seeds until the scripted fight satisfies `accept`. Throws if
 * none does — tests fail loudly rather than flake.
 */
export function findFightSeed(
  makeState: (seed: number) => GameState,
  encounterId: string,
  accept: (fight: ScriptedFight) => boolean,
  maxSeed = 3000,
): { seed: number; fight: ScriptedFight } {
  for (let seed = 1; seed <= maxSeed; seed++) {
    const fight = scriptFight(makeState(seed), encounterId);
    if (accept(fight)) return { seed, fight };
  }
  throw new Error(
    `No seed up to ${maxSeed} produced an accepted fight for "${encounterId}"`,
  );
}

/** Replays one recorded gesture through the DOM helpers of a UI test. */
export function replayStep(
  step: UiStep,
  ui: { click(label: string): void; pressKey(key: string): void },
): void {
  switch (step.kind) {
    case "attack":
      ui.click("Attack");
      ui.click(step.targetName);
      break;
    case "ability":
      ui.click("Ability");
      ui.click(step.abilityName);
      if (step.targetName !== null) ui.click(step.targetName);
      break;
    case "item":
      ui.click("Item");
      ui.click(step.itemName);
      break;
    case "arrow":
      ui.pressKey(step.key);
      break;
    case "end-turn":
      ui.click(t("combat.action.endTurn"));
      break;
  }
}
