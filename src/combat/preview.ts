import type { StatKey } from "../character/stats";
import { requireAbility } from "../data/abilities";
import type { RangeType } from "../inventory/items";
import { abilityImpact } from "./area";
import { abilityHit, weaponReach } from "./damage";
import {
  abilityOptions,
  attackOptions,
  fleeChanceFor,
  reachableTiles,
  type AttackOption,
} from "./legal";
import {
  activeCombatant,
  getCombatant,
  isPlayerControlled,
  livingEnemies,
} from "./state";
import { tunedDamage } from "./tuning";
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
  | "cannot-flee"
  /** The action is the player's own, and a companion is acting. */
  | "player-only";

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
  /**
   * Bodies the best aim would actually reach — 1 for a single-target
   * ability, more when its area catches a crowd. 0 with nothing in
   * range. The action bar quotes it so an area ability reads as one
   * before the player commits to aiming it.
   */
  bodies: number;
}

export interface MovePreview {
  /** Grid steps left this turn. */
  stepsLeft: number;
  /** Distinct tiles those steps can reach. */
  tiles: number;
}

/* --- Aimed outcomes -------------------------------------------------- */

/** An aimed action, as the preview layer asks about it. */
export type PreviewIntent =
  | { kind: "attack" }
  | { kind: "ability"; abilityId: string };

/** A condition an action would leave on the body it reaches. */
export type OutcomeStatus =
  | { kind: "stun"; turns: number }
  | { kind: "boost"; stat: StatKey; amount: number; turns: number };

/**
 * What one aimed action would do to one body. Damage is quoted as the
 * span it can land in rather than a single figure: the engine rolls no
 * damage variance, so the only spread is whether the blow connects —
 * a weapon that can miss reads 0 at the bottom, an ability that cannot
 * reads the same number twice.
 */
export interface OutcomePreview {
  targetId: string;
  /** True for the body actually aimed at; false for anything splashed. */
  primary: boolean;
  /** Chance in [0, 1] it lands, or null when it cannot miss at all. */
  hitChance: number | null;
  /** Least damage it can deal — 0 whenever it can miss. */
  damageMin: number;
  /** Damage it deals when it lands. */
  damageMax: number;
  /** Conditions it would apply to this body. */
  statuses: OutcomeStatus[];
}

/**
 * What an aimed action would do, body by body, with the one aimed at
 * first. Empty when the action is not legal against that target right
 * now — the caller decides how to say so.
 *
 * This is the *only* place an outcome is derived. The action bar's
 * tooltips (via attackPreview / abilityPreviews below) and the grid
 * telegraph's outcome chips both read it, so the number a chip promises
 * and the number a tooltip quotes are one number.
 */
export function outcomesFor(
  state: CombatState,
  intent: PreviewIntent,
  targetId: string,
): OutcomePreview[] {
  if (state.status !== "active") return [];
  const actor = activeCombatant(state);

  if (intent.kind === "attack") {
    const option = attackOptions(state).find((o) => o.targetId === targetId);
    if (!option) return [];
    return [
      {
        targetId,
        primary: true,
        hitChance: option.hitChance,
        // A weapon that can miss is worth nothing on the turns it does.
        damageMin: option.hitChance >= 1 ? option.damage : 0,
        damageMax: option.damage,
        statuses: [],
      },
    ];
  }

  const option = abilityOptions(state).find(
    (o) => o.abilityId === intent.abilityId,
  );
  if (!option || !option.ready) return [];
  const ability = requireAbility(intent.abilityId);

  if (ability.effect.type === "boost") {
    // A self-boost is only ever aimed at its caster.
    if (targetId !== actor.id) return [];
    const { stat, amount, turns } = ability.effect;
    return [
      {
        targetId,
        primary: true,
        hitChance: null,
        damageMin: 0,
        damageMax: 0,
        statuses: [{ kind: "boost", stat, amount, turns }],
      },
    ];
  }

  // Legality first — the option list is what the engine will accept —
  // then the shape, which decides who else goes down with them.
  const target = option.targets.some((t) => t.targetId === targetId)
    ? getCombatant(state, targetId)
    : undefined;
  if (!target) return [];
  return abilityImpact(state, actor, ability, target).map((caught) => {
    const hit = abilityHit(ability.effect, caught.armor);
    // Through the fight's own tuning, like every other quoted figure.
    const damage = tunedDamage(state, actor, caught, hit.damage);
    const { stunTurns } = hit;
    return {
      targetId: caught.id,
      primary: caught.id === targetId,
      // Abilities never roll to hit; what they promise, they deliver.
      hitChance: null,
      damageMin: damage,
      damageMax: damage,
      statuses: stunTurns > 0 ? [{ kind: "stun", turns: stunTurns }] : [],
    };
  });
}

/**
 * Every aim an ability has right now, priced through outcomesFor and
 * ordered by the aim worth taking: most bodies caught, then hardest
 * hit, then most conditions applied. Empty when it is not ready or has
 * nothing in range.
 */
function abilityAims(
  state: CombatState,
  abilityId: string,
): OutcomePreview[][] {
  const option = abilityOptions(state).find((o) => o.abilityId === abilityId);
  if (!option) return [];
  const intent: PreviewIntent = { kind: "ability", abilityId };
  return option.targets
    .map((target) => outcomesFor(state, intent, target.targetId))
    .filter((outcomes) => outcomes.length > 0)
    .sort(
      (a, b) =>
        b.length - a.length ||
        (b[0]?.damageMax ?? 0) - (a[0]?.damageMax ?? 0) ||
        (b[0]?.statuses.length ?? 0) - (a[0]?.statuses.length ?? 0),
    );
}

/**
 * The body an always-on preview points at when the player is pointing
 * at nobody: the target the tooltips already call the one worth taking.
 * Null when the open action has no legal aim at all.
 *
 * Purely a *choice of subject* — the assist that reads it (see
 * src/data/assists.ts) shows the same chip, with the same figures, that
 * hovering this body would have shown. It changes no rule and no
 * number, which is what makes "keep previews up" an accessibility
 * switch rather than a difficulty one.
 */
export function previewFocusId(
  state: CombatState,
  intent: PreviewIntent,
): string | null {
  if (state.status !== "active") return null;
  if (!isPlayerControlled(activeCombatant(state))) return null;
  if (intent.kind === "attack") return attackPreview(state).best?.targetId ?? null;
  const best = abilityAims(state, intent.abilityId)[0];
  return best?.find((outcome) => outcome.primary)?.targetId ?? null;
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
    range: weaponReach(actor.weapon),
    options,
    best: options[0] ?? null,
  };
}

/** Every ability the acting combatant carries, flattened for display. */
export function abilityPreviews(state: CombatState): AbilityPreview[] {
  return abilityOptions(state).map((option) => {
    const ability = requireAbility(option.abilityId);
    // Every aim this ability has, priced through the one outcome
    // function the telegraph's chips read — so the tooltip and the chip
    // quote the same figures for the same aim. The tooltip then reports
    // the aim worth taking: most bodies caught, then hardest hit.
    const best = abilityAims(state, option.abilityId)[0];
    const primary = best?.[0];
    return {
      abilityId: option.abilityId,
      cooldown: option.cooldown,
      ready: option.ready,
      selfTarget: option.selfTarget,
      range: ability.range,
      targetCount: option.targets.length,
      damage: primary?.damageMax ?? 0,
      stunTurns: stunTurnsOf(primary),
      bodies: best?.length ?? 0,
    };
  });
}

/** Turns of stun an outcome would apply; 0 when it applies none. */
function stunTurnsOf(outcome: OutcomePreview | undefined): number {
  const stun = outcome?.statuses.find((s) => s.kind === "stun");
  return stun?.kind === "stun" ? stun.turns : 0;
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
  if (!isPlayerControlled(actor)) return blocked("not-your-turn");

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
      // Calling the retreat ends the fight for the whole crew, so it
      // stays the player's own call rather than a companion's.
      if (actor.kind !== "player") return blocked("player-only");
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
