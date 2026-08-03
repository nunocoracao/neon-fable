import {
  COMBAT_ACTION_KINDS,
  abilityPreviews,
  actionAvailability,
  activeCombatant,
  attackPreview,
  fleeChanceFor,
  getCombatant,
  isAlive,
  isPlayerControlled,
  itemOptions,
  manhattan,
  movePreview,
  pendingSurge,
  playerCombatant,
  resolveTelegraphTiles,
  surgeTurnsToArm,
  type AbilityPreview,
  type ActionBlockReason,
  type CombatActionKind,
  type CombatState,
  type Combatant,
  type CombatantKind,
  type OutcomePreview,
  type OutcomeStatus,
  type TelegraphHover,
  type TelegraphIntent,
  type TelegraphReason,
  type TelegraphRole,
  type TelegraphTile,
} from "../combat";
import { getAbility, getInjury, getItem } from "../data";
import {
  STATUS_MARKERS,
  statusFamilies,
  type StatusFamilyId,
  type TelegraphTileView,
  type TelegraphTintId,
} from "../iso";
import type { ActionIconId } from "../iso/art/actionIcons";
import {
  consumableOutcomeText,
  percentLabel,
  stepsLabel,
  tilesLabel,
  turnsLabel,
} from "./format";
import { plain, t, type PlainKey } from "./strings";

/**
 * The combat HUD's model layer: everything shown in the initiative rail,
 * the action bar, and the target card, derived as plain data from
 * CombatState. The view (./combatHudView.ts) only paints what it is
 * handed, so what the HUD claims is testable without a DOM.
 *
 * Every figure here comes from the engine's own preview queries
 * (src/combat/preview.ts) — the HUD never re-derives a damage number,
 * a hit chance, or a reason an action is unavailable. What this module
 * adds is wording and ordering: reason codes become sentences, previews
 * become tooltips, and initiative order becomes a queue with the turns
 * still to come counted off.
 */

/* --- Initiative rail ------------------------------------------------- */

/** One portrait chip in the initiative rail. */
export interface InitiativeChip {
  combatantId: string;
  /** Disambiguated display name (see combatantDisplayNames). */
  name: string;
  kind: CombatantKind;
  /** Enemy archetype id, for the portrait; null off the enemy side. */
  enemyId: string | null;
  /** Companion content id and the look it wears; null off the crew. */
  companionId: string | null;
  lookId: string | null;
  /**
   * Which record of the archetype's look family this body wears, so the
   * chip's face is the one on the board; null for the player.
   */
  lookIndex: number | null;
  hp: number;
  maxHp: number;
  /** HP as a fraction in [0, 1], for the bar under the chip. */
  hpFraction: number;
  alive: boolean;
  /** True for the combatant acting right now. */
  active: boolean;
  /**
   * How many turns until this combatant acts: 0 for whoever is up,
   * 1 for next, and so on, counting only the living. Null once it is
   * defeated or the fight is over — a chip with no turn coming.
   */
  turnsAway: number | null;
  /** Condition families badging the chip, in registry order. */
  statuses: readonly StatusFamilyId[];
  /**
   * The wound this body walked in with, already spelled out: its name
   * and what it is costing them. Null for anybody unhurt, which is most
   * bodies — and always null on the enemy side, which does not carry
   * injuries between fights because it does not get between fights.
   *
   * Spelled out here rather than left as an id because the rail is one
   * of the two places a player is promised they can *read* a debuff
   * (the other is the character screen), and a badge that only said
   * "injured" would be telling them the half they had already guessed.
   */
  injury: InjuryChipView | null;
}

/** A carried injury as the rail shows it. */
export interface InjuryChipView {
  /** Injury id in src/data/injuries.ts. */
  id: string;
  /** What it is called ("Winged"). */
  name: string;
  /** What it costs, one line, nothing hidden. */
  effect: string;
}

/**
 * The initiative rail, in fixed initiative order — the order never
 * re-sorts, because a rail that reshuffles every turn is a rail nobody
 * can read. What moves is the highlight, and `turnsAway` counts off the
 * turns still to come so the order ahead is legible without counting
 * chips by eye.
 */
export function initiativeChips(
  state: CombatState,
  names: Readonly<Record<string, string>> = {},
): InitiativeChip[] {
  const order = state.initiativeOrder;
  const active = state.status === "active";
  // Walk the wheel from whoever is up, numbering the living as they
  // come round; the dead are skipped exactly as the engine skips them.
  const queue = new Map<string, number>();
  if (active) {
    let turnsAway = 0;
    for (let i = 0; i < order.length; i++) {
      const id = order[(state.turnIndex + i) % order.length];
      if (id === undefined) continue;
      const combatant = getCombatant(state, id);
      if (!combatant || !isAlive(combatant)) continue;
      queue.set(id, turnsAway++);
    }
  }

  return order.flatMap((id) => {
    const combatant = getCombatant(state, id);
    if (!combatant) return [];
    const alive = isAlive(combatant);
    const hp = Math.max(0, combatant.hp);
    return [
      {
        combatantId: id,
        name: names[id] ?? combatant.name,
        kind: combatant.kind,
        enemyId: combatant.enemyId ?? null,
        companionId: combatant.companionId ?? null,
        lookId: combatant.lookId ?? null,
        lookIndex: combatant.lookIndex ?? null,
        hp,
        maxHp: combatant.maxHp,
        hpFraction: combatant.maxHp > 0 ? hp / combatant.maxHp : 0,
        alive,
        active: active && queue.get(id) === 0,
        turnsAway: queue.get(id) ?? null,
        statuses: combatantStatuses(combatant),
        injury: injuryChip(combatant),
      },
    ];
  });
}

/** The wound a body walked in with, as the rail shows it, or null. */
export function injuryChip(combatant: Combatant): InjuryChipView | null {
  if (combatant.injury == null) return null;
  const def = getInjury(combatant.injury);
  if (!def) return null;
  return { id: def.id, name: def.name, effect: def.effect };
}

/** The condition families true of a combatant right now. */
export function combatantStatuses(
  combatant: Combatant,
): readonly StatusFamilyId[] {
  return statusFamilies({
    stunTurns: combatant.stunTurns,
    boostStats: combatant.boosts.map((b) => b.stat),
  });
}

/** The badge label for a condition family (also its tooltip). */
export function statusLabel(family: StatusFamilyId): string {
  return STATUS_MARKERS[family].label;
}

/* --- Static surge ----------------------------------------------------- */

/**
 * The line the HUD carries about the player's cyberware noise, or null
 * when there is nothing to say — which is every fight below the
 * screaming band, and every fight after the surge has been settled.
 *
 * Two states, and both are actionable. While the noise is still
 * building the line is a countdown, so a player can spend the quiet
 * turns knowing exactly how many they have. Once it arms the line is
 * the instruction: this turn's action is the price of not losing the
 * next turn entirely. That is the whole telegraph — the engine hands
 * out no surprises, only a clock (see src/combat/surge.ts).
 */
export function staticSurgeWarning(state: CombatState): string | null {
  if (state.status !== "active") return null;
  const surge = pendingSurge(state);
  if (!surge) return null;
  if (surge.armed) {
    return t("combat.surge.armed");
  }
  const turns = surgeTurnsToArm(state);
  if (turns === null) return null;
  return t("combat.surge.building", { turns: turnsLabel(turns) });
}

/* --- Action bar ------------------------------------------------------ */

/** One action-bar button, fully resolved. */
export interface ActionButton {
  kind: CombatActionKind;
  label: string;
  /** Keyboard shortcut; also printed on the button face. */
  hotkey: string;
  iconId: ActionIconId;
  enabled: boolean;
  /**
   * Why it is off, or what it would do when it is on — the button's
   * title text either way, so a disabled button always explains itself.
   */
  tooltip: string;
}

/** Button faces, in bar order. The hotkey is the button's 1-based slot. */
const ACTION_LABELS: Readonly<Record<CombatActionKind, PlainKey>> = {
  attack: "combat.action.attack",
  ability: "combat.action.ability",
  item: "combat.action.item",
  move: "combat.action.move",
  flee: "combat.action.flee",
  "end-turn": "combat.action.endTurn",
};

/** The hotkey digit for an action, or null when it has none. */
export function actionHotkey(kind: CombatActionKind): string {
  return String(COMBAT_ACTION_KINDS.indexOf(kind) + 1);
}

/** The action a pressed key selects, or null for keys the bar ignores. */
export function actionForHotkey(key: string): CombatActionKind | null {
  const index = Number(key) - 1;
  return COMBAT_ACTION_KINDS[index] ?? null;
}

/** Why an action is unavailable, in words for a disabled button's title. */
export function blockReasonText(reason: ActionBlockReason): string {
  switch (reason) {
    case "combat-over":
      return t("combat.blocked.over");
    case "not-your-turn":
      return t("combat.blocked.notYourTurn");
    case "action-used":
      return t("combat.blocked.actionUsed");
    case "no-targets":
      return t("combat.blocked.noTargets");
    case "out-of-range":
      return t("combat.blocked.outOfRange");
    case "no-abilities":
      return t("combat.blocked.noAbilities");
    case "on-cooldown":
      return t("combat.blocked.allCooling");
    case "no-items":
      return t("combat.blocked.noItems");
    case "no-steps":
      return t("combat.blocked.noSteps");
    case "no-room":
      return t("combat.blocked.noRoom");
    case "cannot-flee":
      return t("combat.blocked.cannotFlee");
    case "player-only":
      return t("combat.blocked.playerOnly");
  }
}

/**
 * The line under the status row while no action is open — the one
 * sentence a player who is not hovering anything will read.
 *
 * "Choose an action" is true and useless on the turn that matters most:
 * the first turn of the first fight opens with Attack, Ability and Item
 * all greyed out, and the only explanation is in a tooltip that a
 * keyboard player never sees. So when the primary action is blocked for
 * a reason the player can *do* something about, the line names it and
 * names the way out. Anything else falls back to the neutral prompt.
 */
export function idleHintText(state: CombatState): string {
  const attack = actionAvailability(state, "attack");
  if (attack.available) return t("combat.idle.choose");
  switch (attack.reason) {
    case "out-of-range":
      return t("combat.idle.outOfRange");
    case "action-used":
      return t("combat.idle.actionUsed");
    case "no-targets":
      return t("combat.idle.noTargets");
    default:
      return t("combat.idle.choose");
  }
}

/**
 * What an available action would do, in the engine's own figures. Kept
 * short — this is a hover, not a manual — and always concrete: a number
 * the player can compare against the target card beside it.
 */
function availableTooltip(state: CombatState, kind: CombatActionKind): string {
  switch (kind) {
    case "attack": {
      const preview = attackPreview(state);
      const best = preview.best;
      if (!best) return preview.weaponName;
      return t("combat.tip.attack", {
        weapon: preview.weaponName,
        damage: best.damage,
        chance: percentLabel(best.hitChance),
        targets: preview.options.length,
      });
    }
    case "ability": {
      const lines = abilityPreviews(state)
        .map(abilityTooltipLine)
        .filter((line) => line.length > 0);
      return lines.length > 0
        ? lines.join("\n")
        : t("combat.blocked.noAbilities");
    }
    case "item": {
      // The figures a dose would actually land, off the same derivation
      // the button in the selection rail quotes.
      const lines = itemOptions(state).map(({ itemId, quantity, outcome }) =>
        t("combat.tip.item", {
          name: getItem(itemId)?.name ?? itemId,
          quantity,
          outcome: consumableOutcomeText(outcome),
        }),
      );
      return lines.length > 0 ? lines.join("\n") : t("combat.blocked.noItems");
    }
    case "move": {
      const { stepsLeft, tiles } = movePreview(state);
      return t("combat.tip.move", {
        steps: stepsLabel(stepsLeft),
        tiles: tilesLabel(tiles),
      });
    }
    case "flee": {
      const chance = fleeChanceFor(state);
      return chance === null
        ? t("combat.blocked.cannotFlee")
        : t("combat.tip.flee", { chance: percentLabel(chance) });
    }
    case "end-turn":
      return t("combat.tip.endTurn");
  }
}

/** One ability's line in the Ability button's tooltip. */
export function abilityTooltipLine(preview: AbilityPreview): string {
  const ability = getAbility(preview.abilityId);
  const name = ability?.name ?? preview.abilityId;
  if (preview.cooldown > 0) {
    return t("combat.tip.ability.cooling", { name, turns: preview.cooldown });
  }
  const effect = ability?.effect;
  if (effect?.type === "boost") {
    return t("combat.tip.ability.boost", {
      name,
      amount: effect.amount,
      stat: effect.stat,
      turns: effect.turns,
    });
  }
  if (preview.targetCount === 0) {
    return t("combat.tip.ability.noTarget", { name, range: preview.range });
  }
  const stun =
    preview.stunTurns > 0
      ? t("combat.tip.ability.stun", { turns: preview.stunTurns })
      : "";
  // An area ability says how many bodies its best aim catches, so the
  // reason to line enemies up is legible before you go aiming it.
  const bodies =
    preview.bodies > 1
      ? t("combat.tip.ability.bodies", { bodies: preview.bodies })
      : "";
  return t("combat.tip.ability", {
    name,
    damage: preview.damage,
    stun,
    bodies,
  });
}

/** Conditions the HUD applies on top of the engine's own availability. */
export interface ActionBarContext {
  /** True while enemy turns are playing out; every button locks. */
  busy?: boolean;
}

/**
 * The action bar: one button per action kind, in bar order, each with
 * its hotkey, its icon, and a tooltip that either quotes the engine's
 * figures or names the thing standing in the way.
 */
export function actionButtons(
  state: CombatState,
  context: ActionBarContext = {},
): ActionButton[] {
  return COMBAT_ACTION_KINDS.map((kind) => {
    const availability = actionAvailability(state, kind);
    // An enemy acting is the same fact as it not being your turn, so it
    // reads as the same sentence rather than a second kind of greyed.
    const busy = context.busy === true && state.status === "active";
    const enabled = availability.available && !busy;
    const reason: ActionBlockReason | null = busy
      ? "not-your-turn"
      : availability.reason;
    return {
      kind,
      label: kind === "flee" ? fleeLabel(state) : plain(ACTION_LABELS[kind]),
      hotkey: actionHotkey(kind),
      iconId: kind,
      enabled,
      tooltip:
        reason !== null
          ? blockReasonText(reason)
          : availableTooltip(state, kind),
    };
  });
}

/** Flee carries its odds on its face; they change every turn. */
function fleeLabel(state: CombatState): string {
  const chance = fleeChanceFor(state);
  return chance === null
    ? t("combat.action.flee")
    : t("combat.action.flee.odds", { chance: percentLabel(chance) });
}

/* --- Target card ----------------------------------------------------- */

/** The hovered or selected target, as the info card shows it. */
export interface TargetCard {
  combatantId: string;
  name: string;
  kind: CombatantKind;
  enemyId: string | null;
  companionId: string | null;
  lookId: string | null;
  /** The archetype look this body wears; null for the player. */
  lookIndex: number | null;
  hp: number;
  maxHp: number;
  hpFraction: number;
  armor: number;
  weaponName: string;
  statuses: readonly StatusFamilyId[];
  /** Manhattan distance from the player; 0 when the target is the player. */
  distance: number;
  /**
   * What the player's current weapon would do to it, when it is a legal
   * attack right now; null when it is out of reach, already spent, or
   * not an enemy.
   */
  attack: { damage: number; hitChance: number } | null;
}

/**
 * The info card for one combatant. Null for unknown or defeated ids —
 * a body on the floor is not a target, and the card goes away with it.
 */
export function targetCard(
  state: CombatState,
  combatantId: string | null,
  names: Readonly<Record<string, string>> = {},
): TargetCard | null {
  if (combatantId === null) return null;
  const combatant = getCombatant(state, combatantId);
  if (!combatant || !isAlive(combatant)) return null;
  const player = playerCombatant(state);
  // The attack line is the *player's* shot at this body, so it only
  // exists on the player's own turn — the legal-option queries answer
  // for whoever is acting, and mid-enemy-turn that is not the player.
  const option =
    state.status === "active" && isPlayerControlled(activeCombatant(state))
      ? attackPreview(state).options.find((o) => o.targetId === combatantId)
      : undefined;
  const hp = Math.max(0, combatant.hp);
  return {
    combatantId,
    name: names[combatantId] ?? combatant.name,
    kind: combatant.kind,
    enemyId: combatant.enemyId ?? null,
    companionId: combatant.companionId ?? null,
    lookId: combatant.lookId ?? null,
    lookIndex: combatant.lookIndex ?? null,
    hp,
    maxHp: combatant.maxHp,
    hpFraction: combatant.maxHp > 0 ? hp / combatant.maxHp : 0,
    armor: combatant.armor,
    weaponName: combatant.weapon.name,
    statuses: combatantStatuses(combatant),
    distance: manhattan(player.position, combatant.position),
    attack: option
      ? { damage: option.damage, hitChance: option.hitChance }
      : null,
  };
}

/** "HP 12/18" — the same reading on a chip, a card, and the status row. */
export function hpLabel(hp: number, maxHp: number): string {
  return `HP ${Math.max(0, hp)}/${maxHp}`;
}

/* --- Grid telegraph -------------------------------------------------- */

/**
 * Engine tile roles to the tints the scene paints. Two vocabularies
 * meet here on purpose: the combat layer names *why* a tile is lit and
 * the iso layer names *how* it looks, and neither imports the other.
 * The table is exhaustive both ways, and a test pins that.
 */
export const TELEGRAPH_TINT_BY_ROLE: Readonly<
  Record<TelegraphRole, TelegraphTintId>
> = {
  origin: "origin",
  reach: "reach",
  range: "range",
  path: "path",
  impact: "impact",
  threat: "threat",
  denied: "denied",
};

/** Engine-tinted tiles as the scene wants them, overlaps already settled. */
export function telegraphTileViews(
  tiles: readonly TelegraphTile[],
): TelegraphTileView[] {
  return resolveTelegraphTiles(tiles).map((tile) => ({
    x: tile.x,
    y: tile.y,
    tint: TELEGRAPH_TINT_BY_ROLE[tile.role],
  }));
}

/** Why a hovered tile was refused, in words. */
export function telegraphReasonText(reason: TelegraphReason): string {
  switch (reason) {
    case "combat-over":
      return t("combat.blocked.over");
    case "not-your-turn":
      return t("combat.blocked.notYourTurn");
    case "action-used":
      return t("combat.blocked.actionUsed");
    case "off-grid":
      return t("combat.tile.offGrid");
    case "no-steps":
      return t("combat.blocked.noSteps");
    case "same-tile":
      return t("combat.tile.sameTile");
    case "occupied":
      return t("combat.tile.occupied");
    case "out-of-range":
      return t("combat.tile.outOfRange");
    case "no-target":
      return t("combat.tile.noTarget");
    case "on-cooldown":
      return t("combat.tile.cooling");
    case "self-only":
      return t("combat.tile.selfOnly");
  }
}

/** Damage as the span it can land in: one figure when nothing can miss. */
export function damageRangeLabel(min: number, max: number): string {
  return min === max
    ? t("combat.damage", { damage: max })
    : t("combat.damage.range", { min, max });
}

/** One condition an outcome would apply, in words. */
export function outcomeStatusLabel(status: OutcomeStatus): string {
  return status.kind === "stun"
    ? t("combat.status.stun", { turns: status.turns })
    : t("combat.status.boost", {
        amount: status.amount,
        stat: status.stat,
        turns: status.turns,
      });
}

/** One body's line on the outcome chip. */
export interface TelegraphOutcomeLine {
  combatantId: string;
  name: string;
  /** True for the body actually aimed at; the rest are caught by area. */
  primary: boolean;
  /** "62% to hit · 0–5 dmg · stuns 1" — the engine's own figures. */
  text: string;
}

/**
 * The chip that hangs off the cursor: what the hovered tile would cost
 * or do, or the reason it would do nothing. Null when there is nothing
 * to say — no intent open, or the pointer is off the arena entirely.
 */
export interface TelegraphChip {
  /** "Move", the weapon's name, or the ability's. */
  title: string;
  /** The move's cost line; empty for aimed actions. */
  cost: string | null;
  /** One line per body the action would reach; empty for a refusal. */
  outcomes: TelegraphOutcomeLine[];
  /** Why it was refused, or null when the hover is legal. */
  denial: string | null;
}

/**
 * The outcome chip for one hover. Every figure on it comes from
 * outcomesFor — the same function the action bar's tooltips are built
 * from — so the chip under the cursor and the tooltip on the button
 * quote one set of numbers, never two.
 */
export function telegraphChip(
  state: CombatState,
  intent: TelegraphIntent,
  hover: TelegraphHover | null,
  names: Readonly<Record<string, string>> = {},
): TelegraphChip | null {
  if (!hover || intent.kind === "none") return null;
  const title = telegraphTitle(state, intent);
  if (!hover.valid) {
    if (hover.reason === null) return null;
    return {
      title,
      cost: null,
      outcomes: [],
      denial: telegraphReasonText(hover.reason),
    };
  }
  if (intent.kind === "move") {
    const steps = hover.cost ?? 0;
    const left = hover.stepsLeft ?? 0;
    return {
      title,
      cost:
        `${steps} step${steps === 1 ? "" : "s"} · ` +
        `${left} left after`,
      outcomes: [],
      denial: null,
    };
  }
  return {
    title,
    cost: null,
    outcomes: hover.outcomes.map((outcome) => ({
      combatantId: outcome.targetId,
      name:
        names[outcome.targetId] ??
        getCombatant(state, outcome.targetId)?.name ??
        outcome.targetId,
      primary: outcome.primary,
      text: outcomeText(outcome),
    })),
    denial: null,
  };
}

/** What the chip is about: the action, named as the player selected it. */
function telegraphTitle(state: CombatState, intent: TelegraphIntent): string {
  switch (intent.kind) {
    case "none":
      return "";
    case "move":
      return "Move";
    case "attack":
      return activeCombatant(state).weapon.name;
    case "ability":
      return getAbility(intent.abilityId)?.name ?? intent.abilityId;
  }
}

/** One outcome's figures, in the order a player reads them. */
function outcomeText(outcome: OutcomePreview): string {
  const parts: string[] = [];
  if (outcome.hitChance !== null) {
    parts.push(t("combat.hitChance", { chance: percentLabel(outcome.hitChance) }));
  }
  if (outcome.damageMax > 0) {
    parts.push(damageRangeLabel(outcome.damageMin, outcome.damageMax));
  }
  parts.push(...outcome.statuses.map(outcomeStatusLabel));
  return parts.length > 0 ? parts.join(" · ") : t("combat.noEffect");
}
