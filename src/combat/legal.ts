import { requireAbility } from "../data/abilities";
import {
  abilityHit,
  attackDamage,
  attackStatKey,
  fleeChance,
  hitChance,
  weaponRange,
} from "./damage";
import { bodyGap } from "./footprint";
import { canStand, manhattan } from "./grid";
import {
  activeCombatant,
  areOpposed,
  combatStat,
  isAlive,
  livingEnemies,
} from "./state";
import type { CombatState, GridPosition } from "./types";

/**
 * Legal-option queries for the combat UI. The UI never re-derives combat
 * rules: it asks these functions what the active combatant may do (and
 * with what odds) and submits the chosen action back through takeAction.
 * All pure reads over CombatState.
 */

/** A living opponent the active combatant can attack right now. */
export interface AttackOption {
  targetId: string;
  /** Chance in [0, 1] the attack lands. */
  hitChance: number;
  /** Damage dealt if it lands (deterministic given stats and armor). */
  damage: number;
  distance: number;
}

export interface AbilityTargetOption {
  targetId: string;
  damage: number;
  stunTurns: number;
}

/** One of the active combatant's abilities and who it could hit now. */
export interface AbilityOption {
  abilityId: string;
  /** Turns until usable again; 0 when off cooldown. */
  cooldown: number;
  /** Off cooldown and the main action is still available. */
  ready: boolean;
  /** True for self-boost abilities, which target only the caster. */
  selfTarget: boolean;
  /** Legal targets right now; empty while not ready or out of range. */
  targets: AbilityTargetOption[];
}

export interface ItemOption {
  itemId: string;
  quantity: number;
}

function mainActionAvailable(state: CombatState): boolean {
  return state.status === "active" && !state.actionUsed;
}

/**
 * Anchor tiles the active combatant may move to with its remaining
 * budget. For anything a tile wide these are the tiles it can stand on;
 * for a bigger body they are the corners its whole block fits into, so a
 * 2×2 chassis is never offered a step that would put it half off the
 * arena or half inside somebody else.
 */
export function reachableTiles(state: CombatState): GridPosition[] {
  if (state.status !== "active" || state.moveRemaining <= 0) return [];
  const actor = activeCombatant(state);
  const tiles: GridPosition[] = [];
  for (let y = 0; y < state.grid.height; y++) {
    for (let x = 0; x < state.grid.width; x++) {
      const tile = { x, y };
      const cost = manhattan(actor.position, tile);
      if (
        cost > 0 &&
        cost <= state.moveRemaining &&
        canStand(state.grid, state.combatants, tile, actor.footprint, actor.id)
      ) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

/** Weapon attacks the active combatant may make, with odds and damage. */
export function attackOptions(state: CombatState): AttackOption[] {
  if (!mainActionAvailable(state)) return [];
  const actor = activeCombatant(state);
  const range = weaponRange(actor.weapon.rangeType);
  const attackStat = combatStat(actor, attackStatKey(actor.weapon.rangeType));
  return state.combatants
    .filter((c) => areOpposed(c, actor) && isAlive(c))
    .map((target) => ({
      targetId: target.id,
      // Block to block: pressed against a chassis anywhere along it is
      // melee reach, whichever of its four tiles you are beside.
      distance: bodyGap(actor, target),
      hitChance: hitChance(attackStat, combatStat(target, "reflexes")),
      damage: attackDamage(actor.weapon, attackStat, target.armor),
    }))
    .filter((option) => option.distance <= range);
}

/** Every ability the active combatant carries, with its current targets. */
export function abilityOptions(state: CombatState): AbilityOption[] {
  if (state.status !== "active") return [];
  const actor = activeCombatant(state);
  return actor.abilityIds.map((abilityId) => {
    const ability = requireAbility(abilityId);
    const cooldown = actor.cooldowns[abilityId] ?? 0;
    const ready = cooldown === 0 && !state.actionUsed;
    if (ability.effect.type === "boost") {
      return {
        abilityId,
        cooldown,
        ready,
        selfTarget: true,
        targets: ready
          ? [{ targetId: actor.id, damage: 0, stunTurns: 0 }]
          : [],
      };
    }
    const targets = ready
      ? state.combatants
          .filter(
            (c) =>
              areOpposed(c, actor) &&
              isAlive(c) &&
              bodyGap(actor, c) <= ability.range,
          )
          .map((target) => ({
            targetId: target.id,
            ...abilityHit(ability.effect, target.armor),
          }))
      : [];
    return { abilityId, cooldown, ready, selfTarget: false, targets };
  });
}

/**
 * Consumables the active combatant may use. The player's own kit, and
 * only theirs: a companion fights with what they brought, not out of
 * your pockets.
 */
export function itemOptions(state: CombatState): ItemOption[] {
  if (!mainActionAvailable(state)) return [];
  const actor = activeCombatant(state);
  if (actor.kind !== "player") return [];
  return actor.consumables
    .filter((stack) => stack.quantity > 0)
    .map(({ itemId, quantity }) => ({ itemId, quantity }));
}

/**
 * Chance in [0, 1] a flee attempt succeeds now, or null when illegal.
 * Calling the retreat is the player's own call — an ally's turn cannot
 * end the fight for the whole crew.
 */
export function fleeChanceFor(state: CombatState): number | null {
  if (!mainActionAvailable(state)) return null;
  const actor = activeCombatant(state);
  if (actor.kind !== "player" || !state.fleeable) return null;
  return fleeChance(
    combatStat(actor, "reflexes"),
    livingEnemies(state).map((e) => combatStat(e, "reflexes")),
  );
}

/**
 * The tiles stepped through going from `from` to `to` one axis at a time
 * (dominant axis first, matching enemy pathing), excluding `from` and
 * including `to`. Used to preview a move and to walk entities along it.
 */
export function manhattanPath(
  from: GridPosition,
  to: GridPosition,
): GridPosition[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps: GridPosition[] = [];
  let { x, y } = from;
  const stepX = (): void => {
    for (let i = 0; i < Math.abs(dx); i++) {
      x += Math.sign(dx);
      steps.push({ x, y });
    }
  };
  const stepY = (): void => {
    for (let i = 0; i < Math.abs(dy); i++) {
      y += Math.sign(dy);
      steps.push({ x, y });
    }
  };
  if (Math.abs(dy) > Math.abs(dx)) {
    stepY();
    stepX();
  } else {
    stepX();
    stepY();
  }
  return steps;
}
