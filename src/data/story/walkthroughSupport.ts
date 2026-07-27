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
import {
  equip,
  hasItem,
  installEnhancement,
  useConsumable,
  type Loadout,
} from "../../inventory";
import { applyChoice, getNode } from "../../narrative";
import type { StoryArc } from "../../narrative/types";
import { createNewGame, type GameState } from "../../state";
import { getBackground } from "../backgrounds";

/**
 * Shared driver for scripted end-to-end walkthrough tests (used by the
 * per-act *.walkthrough.test.ts files): routes are segments of choice ids
 * driven through the narrative engine, fights are autoplayed through the
 * real combat engine, and RNG seeds are scanned until every fight ends in
 * victory. No vitest imports so it type-checks in the build.
 */

/** Thrown when a fight is lost — the signal to retry with the next seed. */
export class RouteFightLost extends Error {}

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

export type RouteStep =
  | { kind: "arc"; arc: StoryArc; entry: string; choices: string[] }
  | { kind: "do"; run(state: GameState): GameState };

export interface RouteResult {
  state: GameState;
  endings: string[];
}

/**
 * Drives choice ids through the narrative engine from each segment's
 * entry node — segments model walking up to an NPC or map interactable.
 * applyChoice throws on unmet requirements, so a route doubles as proof
 * that its gates actually pass.
 */
export function runRoute(state: GameState, steps: RouteStep[]): RouteResult {
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

export function findRouteSeed(
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

export function makeState(
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

function withLoadout(state: GameState, loadout: Loadout): GameState {
  return { ...state, player: loadout.character, inventory: loadout.inventory };
}

/** Installs an owned enhancement between segments (mirrors the UI flow). */
export function installStep(itemId: string): RouteStep {
  return {
    kind: "do",
    run: (state) =>
      withLoadout(state, installEnhancement(state.player, state.inventory, itemId)),
  };
}

/** Equips a carried weapon or outfit between segments. */
export function equipStep(itemId: string): RouteStep {
  return {
    kind: "do",
    run: (state) => withLoadout(state, equip(state.player, state.inventory, itemId)),
  };
}

const HEAL_ITEM_IDS = ["con-trauma-patch", "con-field-kit"];

/**
 * Uses carried healing consumables out of combat until the player is at
 * full HP or out of items — what a real player does between fights.
 */
export function healStep(): RouteStep {
  return {
    kind: "do",
    run(state) {
      let next = state;
      let used = true;
      while (used && next.player.hp < next.player.derived.maxHp) {
        used = false;
        for (const itemId of HEAL_ITEM_IDS) {
          if (next.player.hp >= next.player.derived.maxHp) break;
          if (!hasItem(next.inventory, itemId)) continue;
          next = withLoadout(
            next,
            useConsumable(next.player, next.inventory, itemId),
          );
          used = true;
        }
      }
      return next;
    },
  };
}
