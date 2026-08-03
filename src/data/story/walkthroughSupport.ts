import { baseStats, raiseStat } from "../../character";
import type { StatKey } from "../../character/stats";
import { fixtureCharacter } from "../../character/testSupport";
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
import type { Effect, StoryArc } from "../../narrative/types";
import { createNewGame, type GameState } from "../../state";

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

  // The dose worth taking, off the same preview the combat screen's
  // item buttons quote: the biggest heal actually on offer. Reading the
  // outcome rather than the first stack keeps the policy from burning a
  // stim on a wound it does nothing for.
  const heal = itemOptions(combat)
    .filter((option) => option.outcome.heal > 0)
    .sort((a, b) => b.outcome.heal - a.outcome.heal)[0];
  if (heal && player.hp <= player.maxHp - 10) {
    return { type: "use-item", itemId: heal.itemId };
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
  | {
      kind: "do";
      /** What the step is, for a watcher's ledger; defaults to "step". */
      label?: string;
      run(state: GameState): GameState;
    };

export interface RouteResult {
  state: GameState;
  endings: string[];
}

/**
 * One credit movement a route made, and what made it.
 *
 * Routes are the only end-to-end trace of a real run this codebase has,
 * so they are also the only honest place to read the economy off. A
 * watcher gets every movement in order, attributed to the thing that
 * moved it — which choice in which arc, which fight, which between-scene
 * step. The economy harness (src/economy/sim) folds these into a ledger;
 * nothing in the shipped game watches.
 */
export interface RouteCreditEvent {
  kind: "choice" | "combat" | "step";
  /** The arc the movement happened in, or "route" for a `do` step. */
  arcId: string;
  /** The choice id, encounter id, or step label behind it. */
  detail: string;
  /**
   * The effects the choice carried, for a watcher that wants to know
   * what the credits bought rather than only that they moved. Empty for
   * fights and between-scene steps, which say what they are in `kind`.
   */
  effects: readonly Effect[];
  /** Credits in (positive) or out (negative). Never zero. */
  delta: number;
  /** The balance the movement left behind. */
  balance: number;
}

export interface RouteOptions {
  /** Called for every credit movement, in route order. */
  onCredits?(event: RouteCreditEvent): void;
}

/**
 * Drives choice ids through the narrative engine from each segment's
 * entry node — segments model walking up to an NPC or map interactable.
 * applyChoice throws on unmet requirements, so a route doubles as proof
 * that its gates actually pass.
 */
export function runRoute(
  state: GameState,
  steps: RouteStep[],
  options: RouteOptions = {},
): RouteResult {
  const endings: string[] = [];
  const watch = (
    before: GameState,
    after: GameState,
    kind: RouteCreditEvent["kind"],
    arcId: string,
    detail: string,
    effects: readonly Effect[] = [],
  ): void => {
    const delta = after.credits - before.credits;
    if (delta === 0 || !options.onCredits) return;
    options.onCredits({
      kind,
      arcId,
      detail,
      effects,
      delta,
      balance: after.credits,
    });
  };
  for (const step of steps) {
    if (step.kind === "do") {
      const before = state;
      state = step.run(state);
      watch(before, state, "step", "route", step.label ?? "step");
      continue;
    }
    let nodeId: string | null = step.entry;
    for (const choiceId of step.choices) {
      if (!nodeId) throw new Error(`route ended before choice "${choiceId}"`);
      const node = getNode(step.arc, nodeId);
      if (!node) throw new Error(`missing node "${nodeId}"`);
      const outcome = applyChoice(state, node, choiceId);
      const choice = node.choices.find((entry) => entry.id === choiceId);
      watch(
        state,
        outcome.state,
        "choice",
        step.arc.id,
        choiceId,
        choice?.effects ?? [],
      );
      state = outcome.state;
      nodeId = outcome.nextNodeId;
      if (outcome.encounterId) {
        const before = state;
        state = autoBattle(state, outcome.encounterId);
        watch(before, state, "combat", step.arc.id, outcome.encounterId);
      }
      if (outcome.ended && outcome.endingId) endings.push(outcome.endingId);
    }
  }
  return { state, endings };
}

/**
 * The first seed whose fights all go the player's way, and the run it
 * produced.
 *
 * A watcher only ever hears about the seed that finished: abandoned
 * attempts are buffered and dropped, so a ledger read off a route is the
 * ledger of one coherent playthrough rather than of every rehearsal.
 */
export function findRouteSeed(
  makeState: (seed: number) => GameState,
  steps: RouteStep[],
  maxSeed = 400,
  options: RouteOptions = {},
): RouteResult {
  for (let seed = 1; seed <= maxSeed; seed++) {
    const events: RouteCreditEvent[] = [];
    try {
      const result = runRoute(makeState(seed), steps, {
        onCredits: options.onCredits && ((event) => events.push(event)),
      });
      events.forEach((event) => options.onCredits?.(event));
      return result;
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
  const character = fixtureCharacter({ backgroundId, allocation });
  return createNewGame({ character, seed });
}

function withLoadout(state: GameState, loadout: Loadout): GameState {
  return { ...state, player: loadout.character, inventory: loadout.inventory };
}

/** Installs an owned enhancement between segments (mirrors the UI flow). */
export function installStep(itemId: string): RouteStep {
  return {
    kind: "do",
    label: `install ${itemId}`,
    run: (state) =>
      withLoadout(state, installEnhancement(state.player, state.inventory, itemId)),
  };
}

/** Equips a carried weapon or outfit between segments. */
export function equipStep(itemId: string): RouteStep {
  return {
    kind: "do",
    label: `equip ${itemId}`,
    run: (state) => withLoadout(state, equip(state.player, state.inventory, itemId)),
  };
}

/**
 * Spends earned advancement points on a +1 stat raise between segments
 * (mirrors the advancement overlay) — chapter completions fund it.
 */
export function advanceStep(stat: StatKey): RouteStep {
  return {
    kind: "do",
    label: `raise ${stat}`,
    run: (state) => ({ ...state, player: raiseStat(state, stat) }),
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
    label: "patch up",
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
