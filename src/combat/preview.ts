import { requireAbility } from "../data/abilities";
import type { RangeType } from "../inventory/items";
import { weaponRange } from "./damage";
import {
  abilityOptions,
  attackOptions,
  fleeChanceFor,
  reachableTiles,
  type AttackOption,
} from "./legal";
import { activeCombatant, livingEnemies } from "./state";
import type { CombatState } from "./types";

/**
 * What each action would do right now, and — when it would do nothing —
 * why. The combat HUD shows damage figures, odds, and greyed-out buttons
 * with reasons; every one of those numbers has to be the number the
 * engine will actually resolve, so they are derived here, beside the
 * legal-option queries, rather than re-computed in the UI.
 *
 * Pure reads over CombatState, like ./legal.ts. Nothing here decides
 * presentation: a reason is a code, not a sentence, and the UI turns it
 * into words (see src/ui/combatHud.ts).
 */

/** The action categories the player's action bar offers, in bar order. */
export const COMBAT_ACTION_KINDS = [
  "attack",
  "ability",
  "item",
  "move",
  "flee",
  "end-turn",
] as const;

export type CombatActionKind = (typeof COMBAT_ACTION_KINDS)[number];

/**
 * Why an action is unavailable. Ordered from "not your call at all"
 * through "spent" to "nothing in reach", so the reason a button reports
 * is the first thing the player would have to change to use it.
 */
export type ActionBlockReason =
  /** The fight is over. */
  | "combat-over"
  /** Someone else is acting. */
  | "not-your-turn"
  /** This turn's main action is already spent. */
  | "action-used"
  /** Nothing left standing to aim at. */
  | "no-targets"
  /** Targets exist, but none within reach. */
  | "out-of-range"
  /** This combatant has no abilities at all. */
  | "no-abilities"
  /** Every ability it does have is still cooling down. */
  | "on-cooldown"
  /** No usable consumables carried. */
  | "no-items"
  /** The step budget is spent. */
  | "no-steps"
  /** Steps remain but every tile in reach is taken. */
  | "no-room"
  /** This encounter cannot be walked away from. */
  | "cannot-flee";

export interface ActionAvailability {
  kind: CombatActionKind;
  available: boolean;
  /** Null exactly when available. */
  reason: ActionBlockReason | null;
}

/** Everything the attack button needs, in the engine's own figures. */
export interface AttackPreview {
  weaponName: string;
  rangeType: RangeType;
  /** Maximum Manhattan distance the weapon reaches. */
  range: number;
  /** Every legal target now, with the odds and damage each would take. */
  options: AttackOption[];
  /**
   * The option a player skimming the tooltip cares about: hardest hit
   * first, then likeliest to land, then nearest. Null when none is legal.
   */
  best: AttackOption | null;
}

/** One ability, flattened to the figures a tooltip shows. */
export interface AbilityPreview {
  abilityId: string;
  /** Turns until usable again; 0 when off cooldown. */
  cooldown: number;
  /** Off cooldown and the main action is still available. */
  ready: boolean;
  selfTarget: boolean;
  /** Maximum Manhattan distance to a target. */
  range: number;
  /** Legal targets right now. */
  targetCount: number;
  /** Damage against the best target; 0 for self-boosts and no targets. */
  damage: number;
  /** Turns the best target would lose; 0 when the ability never stuns. */
  stunTurns: number;
}

export interface MovePreview {
  /** Grid steps left this turn. */
  stepsLeft: number;
  /** Distinct tiles those steps can reach. */
  tiles: number;
}

/** Hardest hit first, then likeliest, then nearest. Total and stable. */
function betterAttack(a: AttackOption, b: AttackOption): number {
  return (
    b.damage - a.damage ||
    b.hitChance - a.hitChance ||
    a.distance - b.distance ||
    a.targetId.localeCompare(b.targetId)
  );
}

/** The weapon attack figures for whoever is acting. */
export function attackPreview(state: CombatState): AttackPreview {
  const actor = activeCombatant(state);
  const options = [...attackOptions(state)].sort(betterAttack);
  return {
    weaponName: actor.weapon.name,
    rangeType: actor.weapon.rangeType,
    range: weaponRange(actor.weapon.rangeType),
    options,
    best: options[0] ?? null,
  };
}

/** Every ability the acting combatant carries, flattened for display. */
export function abilityPreviews(state: CombatState): AbilityPreview[] {
  return abilityOptions(state).map((option) => {
    const ability = requireAbility(option.abilityId);
    // The engine already applied the target's armor per target; the
    // tooltip quotes the hardest of them, matching the attack preview.
    const best = [...option.targets].sort(
      (a, b) => b.damage - a.damage || b.stunTurns - a.stunTurns,
    )[0];
    return {
      abilityId: option.abilityId,
      cooldown: option.cooldown,
      ready: option.ready,
      selfTarget: option.selfTarget,
      range: ability.range,
      targetCount: option.targets.length,
      damage: best?.damage ?? 0,
      stunTurns: best?.stunTurns ?? 0,
    };
  });
}

/** Steps left and how much ground they cover. */
export function movePreview(state: CombatState): MovePreview {
  return {
    stepsLeft: state.status === "active" ? state.moveRemaining : 0,
    tiles: reachableTiles(state).length,
  };
}

/**
 * Whether the player may take this kind of action right now, and the
 * first thing standing in the way when they may not. Answers only for
 * the player: while an enemy is acting every kind reports
 * "not-your-turn", which is exactly what the action bar should say.
 */
export function actionAvailability(
  state: CombatState,
  kind: CombatActionKind,
): ActionAvailability {
  const blocked = (reason: ActionBlockReason): ActionAvailability => ({
    kind,
    available: false,
    reason,
  });
  const open: ActionAvailability = { kind, available: true, reason: null };

  if (state.status !== "active") return blocked("combat-over");
  const actor = activeCombatant(state);
  if (actor.kind !== "player") return blocked("not-your-turn");

  switch (kind) {
    case "end-turn":
      return open;

    case "move": {
      if (state.moveRemaining <= 0) return blocked("no-steps");
      return reachableTiles(state).length > 0 ? open : blocked("no-room");
    }

    case "attack": {
      if (state.actionUsed) return blocked("action-used");
      if (livingEnemies(state).length === 0) return blocked("no-targets");
      return attackOptions(state).length > 0 ? open : blocked("out-of-range");
    }

    case "ability": {
      const options = abilityOptions(state);
      if (options.length === 0) return blocked("no-abilities");
      if (state.actionUsed) return blocked("action-used");
      if (options.every((o) => o.cooldown > 0)) return blocked("on-cooldown");
      if (livingEnemies(state).length === 0) {
        // Self-buffs still fire with the arena cleared; nothing else can.
        return options.some((o) => o.selfTarget && o.ready)
          ? open
          : blocked("no-targets");
      }
      return options.some((o) => o.targets.length > 0)
        ? open
        : blocked("out-of-range");
    }

    case "item": {
      if (actor.consumables.every((stack) => stack.quantity <= 0)) {
        return blocked("no-items");
      }
      return state.actionUsed ? blocked("action-used") : open;
    }

    case "flee": {
      if (!state.fleeable) return blocked("cannot-flee");
      if (state.actionUsed) return blocked("action-used");
      return fleeChanceFor(state) === null ? blocked("cannot-flee") : open;
    }
  }
}

/** Every action kind's availability, in action-bar order. */
export function actionAvailabilities(
  state: CombatState,
): ActionAvailability[] {
  return COMBAT_ACTION_KINDS.map((kind) => actionAvailability(state, kind));
}
