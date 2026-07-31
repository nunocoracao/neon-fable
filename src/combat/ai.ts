import { requireAbility } from "../data/abilities";
import { requireItem } from "../data/items";
import type { ItemResolver } from "../inventory/items";
import { takeAction } from "./actions";
import { weaponRange } from "./damage";
import { bodyGap } from "./footprint";
import { canStand } from "./grid";
import { activeCombatant, livingCrew } from "./state";
import {
  CombatError,
  type CombatAction,
  type Combatant,
  type CombatState,
  type GridPosition,
} from "./types";

/**
 * Enemy AI. chooseEnemyAction is a pure function of CombatState: prefer a
 * ready ability, then a weapon attack, then a step toward its quarry,
 * then end the turn. All randomness lives in the action layer's seeded
 * rolls, so enemy turns are deterministic given state + seed.
 */

/**
 * The single step (4-neighborhood, no diagonals) that brings the actor
 * closer to the target, or null when every closing step is blocked. The
 * axis with the larger gap moves first; x breaks ties, so the choice is
 * deterministic.
 */
function stepToward(
  state: CombatState,
  actor: Combatant,
  target: GridPosition,
): GridPosition | null {
  const dx = target.x - actor.position.x;
  const dy = target.y - actor.position.y;
  const steps: GridPosition[] = [];
  if (dx !== 0) {
    steps.push({ x: actor.position.x + Math.sign(dx), y: actor.position.y });
  }
  if (dy !== 0) {
    steps.push({ x: actor.position.x, y: actor.position.y + Math.sign(dy) });
  }
  if (Math.abs(dy) > Math.abs(dx)) steps.reverse();
  for (const step of steps) {
    // The whole block has to fit where the step puts it; a chassis that
    // cannot turn a corner simply takes the other axis, or stands still.
    if (canStand(state.grid, state.combatants, step, actor.footprint, actor.id)) {
      return step;
    }
  }
  return null;
}

/**
 * Who this enemy is working on: the nearest body on the player's side,
 * ties broken by combatant order so the choice is deterministic. With
 * no companions in the fight that is always the player, exactly as it
 * was; with a companion in it, an enemy goes for whoever is closest
 * rather than walking past them to reach the player.
 */
function nearestQuarry(
  state: CombatState,
  actor: Combatant,
): Combatant | null {
  let best: Combatant | null = null;
  let bestGap = Infinity;
  for (const body of livingCrew(state)) {
    const gap = bodyGap(actor, body);
    if (gap < bestGap) {
      best = body;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Picks the active enemy's next action: a ready damage ability in range
 * of its quarry, else a self-boost while still closing in, else a
 * weapon attack in range, else one grid step toward it, else end-turn.
 */
export function chooseEnemyAction(state: CombatState): CombatAction {
  const actor = activeCombatant(state);
  if (actor.kind !== "enemy") {
    throw new CombatError(
      "enemy-only",
      `chooseEnemyAction called on "${actor.id}", the player's turn`,
    );
  }
  const quarry = nearestQuarry(state, actor);
  if (!quarry) return { type: "end-turn" };

  // Block to block, so a chassis reads its own reach from whichever of
  // its tiles is nearest — not from the corner it is anchored on.
  const distance = bodyGap(actor, quarry);
  const range = weaponRange(actor.weapon.rangeType);

  if (!state.actionUsed) {
    for (const abilityId of actor.abilityIds) {
      if ((actor.cooldowns[abilityId] ?? 0) > 0) continue;
      const ability = requireAbility(abilityId);
      if (ability.effect.type === "damage" && distance <= ability.range) {
        return { type: "use-ability", abilityId, targetId: quarry.id };
      }
      if (
        ability.effect.type === "boost" &&
        actor.boosts.length === 0 &&
        distance > range
      ) {
        return { type: "use-ability", abilityId, targetId: actor.id };
      }
    }
    if (distance <= range) {
      return { type: "attack", targetId: quarry.id };
    }
  }

  if (distance > range && state.moveRemaining > 0) {
    const step = stepToward(state, actor, quarry.position);
    if (step) return { type: "move", to: step };
  }
  return { type: "end-turn" };
}

/**
 * Plays out consecutive enemy turns until it is the player's turn again or
 * combat has ended. Terminates because every enemy turn spends its one
 * action or its finite move budget before ending the turn.
 */
export function runEnemyTurns(
  state: CombatState,
  resolve: ItemResolver = requireItem,
): CombatState {
  let next = state;
  while (next.status === "active" && activeCombatant(next).kind === "enemy") {
    next = takeAction(next, chooseEnemyAction(next), resolve);
  }
  return next;
}
