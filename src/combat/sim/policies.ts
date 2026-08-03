import { takeAction } from "../actions";
import { weaponReach } from "../damage";
import { bodyGap } from "../footprint";
import {
  abilityOptions,
  attackOptions,
  itemOptions,
  reachableTiles,
  type AbilityOption,
} from "../legal";
import {
  activeCombatant,
  isPlayerControlled,
  livingEnemies,
} from "../state";
import { pendingSurge } from "../surge";
import type { CombatAction, Combatant, CombatState } from "../types";

/**
 * How the sweep's players play.
 *
 * A win rate only means something if somebody sensible was holding the
 * controller, so the harness ships three scripted hands rather than one:
 * a runner who walks at things and hits them, a runner who keeps their
 * distance and their hit points, and a runner who actually opens the bag.
 * Each is a pure function of CombatState — no RNG of its own, no memory
 * between turns — so a cell is reproducible from its seed alone, and the
 * only randomness in a simulated fight is the engine's own hit rolls.
 *
 * The three exist to separate two things the single-policy version of
 * this harness could not tell apart: a fight that is too hard, and a
 * fight that punishes one way of playing. When the aggressive and
 * defensive lines disagree sharply on an encounter, that is the fight
 * saying something about itself.
 *
 * Policies drive every body on the player's side — the player and any
 * companion — because the engine has both take their turn through the
 * same action path (see CombatantKind). Enemies are the engine's own AI.
 */

export type SimPolicyId = "aggressive" | "defensive" | "item-user";

export const SIM_POLICY_IDS: readonly SimPolicyId[] = [
  "aggressive",
  "defensive",
  "item-user",
];

export interface SimPolicy {
  id: SimPolicyId;
  label: string;
  /** One action, or null to end the turn. Never mutates state. */
  choose(state: CombatState, actor: Combatant): CombatAction | null;
}

/* --- Shared reads ---------------------------------------------------- */

/** Share of frame this body still has, in [0, 1]. */
function healthShare(actor: Combatant): number {
  return actor.maxHp > 0 ? Math.max(0, actor.hp) / actor.maxHp : 0;
}

/** The living enemy this body is closest to; null when the board is clear. */
function nearestEnemy(state: CombatState, actor: Combatant): Combatant | null {
  let best: Combatant | null = null;
  let bestGap = Infinity;
  for (const enemy of livingEnemies(state)) {
    const gap = bodyGap(actor, enemy);
    if (gap < bestGap || (gap === bestGap && best !== null && enemy.id < best.id)) {
      best = enemy;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * The attack with the best expected return: damage weighted by the odds
 * it lands, ties broken on target id so the choice is deterministic.
 */
function bestAttack(state: CombatState): CombatAction | null {
  const options = [...attackOptions(state)].sort(
    (a, b) =>
      b.damage * b.hitChance - a.damage * a.hitChance ||
      (a.targetId < b.targetId ? -1 : 1),
  );
  const best = options[0];
  return best ? { type: "attack", targetId: best.targetId } : null;
}

/** What one offensive ability is worth right now, at its best target. */
function abilityValue(option: AbilityOption): number {
  let best = 0;
  for (const target of option.targets) {
    // A turn taken off somebody is worth about as much as a solid hit;
    // three points is the rough weight of a swing in this game's numbers.
    best = Math.max(best, target.damage + target.stunTurns * 3);
  }
  return best;
}

/** The readied damage ability with the most to offer, or null. */
function bestDamageAbility(state: CombatState): CombatAction | null {
  const ready = abilityOptions(state).filter(
    (option) => option.ready && !option.selfTarget && option.targets.length > 0,
  );
  let chosen: { action: CombatAction; value: number } | null = null;
  for (const option of ready) {
    const value = abilityValue(option);
    const target = [...option.targets].sort(
      (a, b) =>
        b.damage + b.stunTurns * 3 - (a.damage + a.stunTurns * 3) ||
        (a.targetId < b.targetId ? -1 : 1),
    )[0];
    if (!target) continue;
    if (!chosen || value > chosen.value) {
      chosen = {
        value,
        action: {
          type: "use-ability",
          abilityId: option.abilityId,
          targetId: target.targetId,
        },
      };
    }
  }
  return chosen?.action ?? null;
}

/**
 * A self-boost worth taking: readied, and this body is not already
 * carrying a lift. Re-buffing over a live boost is how a scripted hand
 * quietly wastes half its turns, so the check is worth the line.
 */
function selfBoost(state: CombatState, actor: Combatant): CombatAction | null {
  if (actor.boosts.length > 0) return null;
  const option = abilityOptions(state).find(
    (candidate) => candidate.ready && candidate.selfTarget,
  );
  return option
    ? { type: "use-ability", abilityId: option.abilityId, targetId: actor.id }
    : null;
}

/**
 * The healing item to open, or null. Held until the deficit is worth
 * most of what the item gives — a patch spent to top up two points is a
 * patch that is not there when it matters, which is a real player
 * mistake the sweep should not be making on their behalf.
 */
function healItem(
  state: CombatState,
  actor: Combatant,
  belowShare: number,
): CombatAction | null {
  if (healthShare(actor) > belowShare) return null;
  const deficit = actor.maxHp - actor.hp;
  const options = itemOptions(state)
    .filter((option) => option.outcome.heal > 0)
    .sort((a, b) => a.outcome.heal - b.outcome.heal);
  // Smallest dose that is not mostly wasted; the biggest one when the
  // hole is deeper than anything in the bag.
  const fitting =
    options.find((option) => option.outcome.heal <= deficit) ??
    options[0] ??
    null;
  return fitting ? { type: "use-item", itemId: fitting.itemId } : null;
}

/**
 * The best stim in the bag, or null when the bag holds none — or when
 * the body holding it is in no state to spend a turn on a lift. A stim
 * taken at a fifth of your frame is a turn you needed for the patch,
 * and a policy that made that mistake would report stims as a trap they
 * are not.
 */
function stimItem(state: CombatState, actor: Combatant): CombatAction | null {
  if (actor.boosts.length > 0 || healthShare(actor) < 0.6) return null;
  const option = itemOptions(state)
    .filter((candidate) => candidate.outcome.boosts.length > 0)
    .sort(
      (a, b) =>
        (b.outcome.boosts[0]?.amount ?? 0) - (a.outcome.boosts[0]?.amount ?? 0),
    )[0];
  return option ? { type: "use-item", itemId: option.itemId } : null;
}

/** Something in the bag that settles the chrome, or null. */
function settleItem(state: CombatState): CombatAction | null {
  const option = itemOptions(state).find((candidate) => candidate.outcome.settles);
  return option ? { type: "use-item", itemId: option.itemId } : null;
}

/**
 * The step that most improves this body's position, scored by `want`.
 * Movement is one action per turn's whole budget rather than a step at a
 * time, so a reachable tile is any tile the budget covers — the engine's
 * own legality query answers which those are.
 */
function moveBy(
  state: CombatState,
  actor: Combatant,
  want: (gap: number) => number,
): CombatAction | null {
  const target = nearestEnemy(state, actor);
  if (!target || state.moveRemaining <= 0) return null;
  const here = want(bodyGap(actor, target));
  let best: { to: { x: number; y: number }; score: number } | null = null;
  for (const tile of reachableTiles(state)) {
    const gap = bodyGap({ position: tile, footprint: actor.footprint }, target);
    const score = want(gap);
    if (score <= here) continue;
    if (!best || score > best.score) best = { to: tile, score };
  }
  return best ? { type: "move", to: best.to } : null;
}

/** Close the distance: fewer tiles between us is better. */
function closeIn(state: CombatState, actor: Combatant): CombatAction | null {
  return moveBy(state, actor, (gap) => -gap);
}

/**
 * Back off without losing the shot: more distance is better, right up
 * to the edge of what the weapon reaches, and worthless past it.
 */
function keepRange(state: CombatState, actor: Combatant): CombatAction | null {
  const reach = weaponReach(actor.weapon);
  return moveBy(state, actor, (gap) => (gap > reach ? -gap : gap));
}

/**
 * Whether this body should spend the turn quiet: its chrome is one turn
 * from discharging, and giving up the main action bleeds it off (see
 * ../surge.ts). The cheapest counterplay in the game and the one a
 * scripted hand has to know about, or the Static bands read as a pure
 * tax the sweep would then "discover".
 */
function shouldVent(state: CombatState, actor: Combatant): boolean {
  const surge = pendingSurge(state);
  return surge !== null && surge.armed && surge.combatantId === actor.id;
}

/* --- The three hands -------------------------------------------------- */

/**
 * Walk at it and hit it. The floor every other line is measured
 * against — but not a strawman: it still opens a patch when it is about
 * to die, because a policy that lets a full bag go to the morgue would
 * report every fight as harder than it is.
 */
const AGGRESSIVE: SimPolicy = {
  id: "aggressive",
  label: "Aggressive",
  choose(state, actor) {
    if (!state.actionUsed) {
      const heal = healItem(state, actor, 0.3);
      if (heal) return heal;
      const ability = bestDamageAbility(state);
      if (ability) return ability;
      const attack = bestAttack(state);
      if (attack) return attack;
    }
    return closeIn(state, actor);
  },
};

/**
 * Keep the distance, keep the frame. Heals early, vents the chrome
 * rather than eating the stun, and gives ground to stay at the edge of
 * its own reach — which for a melee build is no ground at all, so this
 * line is deliberately worse for brawlers and better for shooters.
 */
const DEFENSIVE: SimPolicy = {
  id: "defensive",
  label: "Defensive",
  choose(state, actor) {
    if (shouldVent(state, actor)) return keepRange(state, actor);
    if (!state.actionUsed) {
      const heal = healItem(state, actor, 0.55);
      if (heal) return heal;
      const boost = selfBoost(state, actor);
      if (boost) return boost;
      const ability = bestDamageAbility(state);
      if (ability) return ability;
      const attack = bestAttack(state);
      if (attack) return attack;
    }
    return keepRange(state, actor) ?? closeIn(state, actor);
  },
};

/**
 * Opens the bag. Doses first, patches late, and settles the chrome with
 * a Wake Sugar when it has one — the line that answers "are stims worth
 * carrying", which is only a real question if somebody actually uses
 * them the way they were priced to be used.
 */
const ITEM_USER: SimPolicy = {
  id: "item-user",
  label: "Item user",
  choose(state, actor) {
    if (shouldVent(state, actor)) {
      const settle = settleItem(state);
      if (settle) return settle;
      return closeIn(state, actor);
    }
    if (!state.actionUsed) {
      const heal = healItem(state, actor, 0.5);
      if (heal) return heal;
      const stim = stimItem(state, actor);
      if (stim) return stim;
      const boost = selfBoost(state, actor);
      if (boost) return boost;
      const ability = bestDamageAbility(state);
      if (ability) return ability;
      const attack = bestAttack(state);
      if (attack) return attack;
    }
    return closeIn(state, actor);
  },
};

const POLICIES: Readonly<Record<SimPolicyId, SimPolicy>> = {
  aggressive: AGGRESSIVE,
  defensive: DEFENSIVE,
  "item-user": ITEM_USER,
};

export function simPolicy(id: SimPolicyId): SimPolicy {
  return POLICIES[id];
}

/** Turns one player-controlled body's whole turn, ending it. */
export function playTurn(state: CombatState, policy: SimPolicy): CombatState {
  let next = state;
  // Every branch above either spends the one main action or improves the
  // position it will never improve again, so the loop drains; the guard
  // is a bug tripwire, not a strategy.
  for (let guard = 0; guard < 24; guard++) {
    if (next.status !== "active") return next;
    const actor = activeCombatant(next);
    if (!isPlayerControlled(actor)) return next;
    const action = policy.choose(next, actor);
    if (!action) return takeAction(next, { type: "end-turn" });
    next = takeAction(next, action);
  }
  throw new Error(`policy "${policy.id}" did not end its turn`);
}
