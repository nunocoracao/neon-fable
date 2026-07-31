import { requireAbility } from "../data/abilities";
import { abilityAreaTiles } from "./area";
import { threatenedTiles } from "./charge";
import { weaponReach } from "./damage";
import { bodyGap, bodyTiles, tileGap } from "./footprint";
import { canStand, combatantAt, inBounds, isBlocked, manhattan } from "./grid";
import { manhattanPath, reachableTiles } from "./legal";
import {
  activeCombatant,
  areOpposed,
  isAlive,
  isPlayerControlled,
} from "./state";
import { outcomesFor, type OutcomePreview, type PreviewIntent } from "./preview";
import type { Combatant, CombatState, GridPosition } from "./types";

/**
 * Grid telegraphs: which tiles an open action touches, what pointing at
 * one of them would do, and — when it would do nothing — why not.
 *
 * Everything here is a pure read over CombatState, like ./legal.ts and
 * ./preview.ts. Nothing decides presentation: a tint is a *role*, not a
 * colour, and a refusal is a code, not a sentence; the HUD turns both
 * into paint and words (see src/ui/combatHud.ts). The figures on an
 * outcome come from ./preview.ts unchanged, so the chip under the
 * cursor and the tooltip on the action bar cannot disagree.
 */

/** What the player currently has open, as the telegraph reads it. */
export type TelegraphIntent =
  | { kind: "none" }
  | { kind: "move" }
  | { kind: "attack" }
  | { kind: "ability"; abilityId: string };

/**
 * Why a tile is tinted. Roles, not colours: the palette that paints them
 * lives in src/iso/telegraphPalette.ts, and swapping it (for the
 * colourblind-safe option) changes nothing here.
 */
export const TELEGRAPH_ROLES = [
  /** Where the acting combatant is standing. */
  "origin",
  /** Ground the remaining steps cover. */
  "reach",
  /** Ground the open action can strike. */
  "range",
  /** The walk being previewed under the cursor. */
  "path",
  /** Exactly what the aimed action would touch. */
  "impact",
  /**
   * Ground somebody else has already promised: a wind-up declared and
   * not yet thrown (see ./charge.ts). Unlike every other role this one
   * does not depend on what the player has open — a charge is a fact
   * about the board, and standing on it is a decision the player has to
   * be able to make with their hands empty.
   */
  "threat",
  /** Pointed at, and refused. */
  "denied",
] as const;

export type TelegraphRole = (typeof TELEGRAPH_ROLES)[number];

export interface TelegraphTile extends GridPosition {
  role: TelegraphRole;
}

/**
 * Why a hovered tile is not a legal thing to click. Ordered from "not
 * your call at all" through "spent" to "wrong tile", so the reason a
 * refusal reports is the first thing the player would have to change —
 * the same discipline the action bar's block reasons follow.
 */
export const TELEGRAPH_REASONS = [
  /** The fight is over. */
  "combat-over",
  /** Someone else is acting. */
  "not-your-turn",
  /** This turn's main action is already spent. */
  "action-used",
  /** The ability is still cooling down. */
  "on-cooldown",
  /** Outside the arena. */
  "off-grid",
  /** The step budget is spent. */
  "no-steps",
  /** You are already standing there. */
  "same-tile",
  /** Somebody else is standing there. */
  "occupied",
  /** This ability only ever aims at its caster. */
  "self-only",
  /** Further than the steps left, or than the action reaches. */
  "out-of-range",
  /** Nothing to aim at on that tile. */
  "no-target",
] as const;

export type TelegraphReason = (typeof TELEGRAPH_REASONS)[number];

/** What pointing at one tile, with one intent, would do. */
export interface TelegraphHover {
  tile: GridPosition;
  /** True when clicking here submits a legal action. */
  valid: boolean;
  /**
   * Why not, when it is not legal. Null both when the hover is legal
   * and when there is no open intent to refuse it — a cursor drifting
   * over the arena with nothing selected is not an error.
   */
  reason: TelegraphReason | null;
  /** Move only: the steps walked, the origin excluded, the tile last. */
  path: GridPosition[];
  /** Move only: steps the walk spends, and what would remain after it. */
  cost: number | null;
  stepsLeft: number | null;
  /** Attack/ability: exactly the tiles the action would touch. */
  impact: GridPosition[];
  /** Attack/ability: what it would do, the body aimed at first. */
  outcomes: OutcomePreview[];
  /** The body aimed at, when the tile has one. */
  targetId: string | null;
}

function emptyHover(
  tile: GridPosition,
  reason: TelegraphReason | null,
): TelegraphHover {
  return {
    tile: { ...tile },
    valid: false,
    reason,
    path: [],
    cost: null,
    stepsLeft: null,
    impact: [],
    outcomes: [],
    targetId: null,
  };
}

/**
 * Whoever the telegraph answers for: the acting combatant, but only
 * while that is the player. Telegraphs are the player's own read of the
 * board; mid-enemy-turn there is nothing to show and one reason why.
 */
function telegraphActor(
  state: CombatState,
): { actor: Combatant } | { reason: TelegraphReason } {
  if (state.status !== "active") return { reason: "combat-over" };
  const actor = activeCombatant(state);
  if (!isPlayerControlled(actor)) return { reason: "not-your-turn" };
  return { actor };
}

/**
 * Every tile within `range` of a body that is actually on the grid, the
 * tiles it is standing on excluded — reach is measured from whichever of
 * its tiles is nearest, so a chassis reaches around itself rather than
 * out of one corner.
 */
function tilesWithin(
  state: CombatState,
  actor: Combatant,
  range: number,
): GridPosition[] {
  const tiles: GridPosition[] = [];
  for (let y = 0; y < state.grid.height; y++) {
    for (let x = 0; x < state.grid.width; x++) {
      const tile = { x, y };
      const gap = tileGap(actor, tile);
      if (gap > 0 && gap <= range) tiles.push(tile);
    }
  }
  return tiles;
}

/** The living body standing on a tile, or undefined. */
function bodyAt(
  state: CombatState,
  tile: GridPosition,
): Combatant | undefined {
  return combatantAt(state.combatants, tile);
}

/** Every tile the acting combatant is standing on, as its own role. */
function originTiles(actor: Combatant): TelegraphTile[] {
  return bodyTiles(actor).map((tile) => ({ ...tile, role: "origin" as const }));
}

/**
 * Ground an action reaches: every tile inside its range, plus every
 * tile of every body it can actually strike.
 *
 * The second half only matters once a body is bigger than the tile it
 * is anchored on. Reach is measured block to block, so a chassis can be
 * in range while its far corner is not — and that corner is still a
 * legal place to click, because clicking any of a body's tiles aims at
 * the body. Tinting it keeps the field and the hover saying the same
 * thing, which is the whole contract between them.
 */
function reachField(
  state: CombatState,
  actor: Combatant,
  range: number,
): TelegraphTile[] {
  const tiles: TelegraphTile[] = tilesWithin(state, actor, range).map(
    (tile) => ({ ...tile, role: "range" as const }),
  );
  for (const body of state.combatants) {
    if (!areOpposed(body, actor) || !isAlive(body)) continue;
    if (bodyGap(actor, body) > range) continue;
    for (const tile of bodyTiles(body)) {
      tiles.push({ ...tile, role: "range" });
    }
  }
  return tiles;
}

/**
 * The standing tint under an open intent, before the cursor says
 * anything: the ground the steps cover, or the ground the action can
 * strike, always with the actor's own tile marked. Empty when there is
 * no intent open, or when the action could not be taken anyway — a
 * telegraph never promises reach the engine would refuse.
 */
export function telegraphField(
  state: CombatState,
  intent: TelegraphIntent,
): TelegraphTile[] {
  if (intent.kind === "none") return [];
  const resolved = telegraphActor(state);
  if (!("actor" in resolved)) return [];
  const { actor } = resolved;
  const origin = originTiles(actor);

  if (intent.kind === "move") {
    if (state.moveRemaining <= 0) return [];
    return [
      ...origin,
      ...reachableTiles(state).map(
        (tile): TelegraphTile => ({ ...tile, role: "reach" }),
      ),
    ];
  }

  if (state.actionUsed) return [];

  if (intent.kind === "attack") {
    return [...origin, ...reachField(state, actor, weaponReach(actor.weapon))];
  }

  if (!actor.abilityIds.includes(intent.abilityId)) return [];
  if ((actor.cooldowns[intent.abilityId] ?? 0) > 0) return [];
  const ability = requireAbility(intent.abilityId);
  // A self-boost reaches nowhere; the caster's own tiles are the whole
  // telegraph, which is exactly the truth about it.
  if (ability.effect.type === "boost") return origin;
  return [...origin, ...reachField(state, actor, ability.range)];
}

/**
 * Ground a hostile could reach *from where it is standing*, marked
 * before it acts rather than after — the whole of what a Cold Read buys
 * (see PerkModifiers.enemyIntent).
 *
 * Read off the player's own snapshot, so a run without the perk gets
 * exactly the board it always got: an empty list, and no way to tell
 * the feature exists. Measured from current positions and current
 * weapons only — this is a read of what they can do, not a prophecy of
 * where they will walk, and promising the latter would be a telegraph
 * the engine could not honour.
 */
export function intentTiles(state: CombatState): TelegraphTile[] {
  if (state.status !== "active") return [];
  const player = state.combatants.find((c) => c.kind === "player");
  if (!player || (player.perks?.enemyIntent ?? 0) <= 0) return [];
  const tiles: TelegraphTile[] = [];
  for (const body of state.combatants) {
    if (!isAlive(body) || !areOpposed(body, player)) continue;
    for (const tile of tilesWithin(state, body, weaponReach(body.weapon))) {
      tiles.push({ ...tile, role: "threat" });
    }
  }
  return tiles;
}

/**
 * The ground already promised by every wind-up in flight, plus — for a
 * runner who reads shoulders — the ground the living hostiles could
 * take somebody on right now. Both tint as the same threat, because to
 * the player they are the same fact: do not be standing there.
 *
 * Independent of what the player has open — see the "threat" role above.
 */
export function threatTiles(state: CombatState): TelegraphTile[] {
  if (state.status !== "active") return [];
  return [
    ...threatenedTiles(state).map(
      (tile): TelegraphTile => ({ ...tile, role: "threat" }),
    ),
    ...intentTiles(state),
  ];
}

/** The move telegraph for one hovered tile. */
function moveHover(
  state: CombatState,
  actor: Combatant,
  tile: GridPosition,
): TelegraphHover {
  if (state.moveRemaining <= 0) return emptyHover(tile, "no-steps");
  const cost = manhattan(actor.position, tile);
  if (cost === 0) return emptyHover(tile, "same-tile");
  // Asked of the block, not the corner: a body that would end up half
  // off the arena is refused for being off the grid, and one that would
  // end up inside somebody for being occupied.
  if (isBlocked(state.combatants, tile, actor.footprint, actor.id)) {
    return emptyHover(tile, "occupied");
  }
  if (!canStand(state.grid, state.combatants, tile, actor.footprint, actor.id)) {
    return emptyHover(tile, "off-grid");
  }
  if (cost > state.moveRemaining) return emptyHover(tile, "out-of-range");
  const path = manhattanPath(actor.position, tile);
  return {
    tile: { ...tile },
    valid: true,
    reason: null,
    path,
    cost,
    stepsLeft: state.moveRemaining - cost,
    impact: [],
    outcomes: [],
    targetId: null,
  };
}

/** The attack or ability telegraph for one hovered tile. */
function aimHover(
  state: CombatState,
  actor: Combatant,
  intent: { kind: "attack" } | { kind: "ability"; abilityId: string },
  tile: GridPosition,
): TelegraphHover {
  if (state.actionUsed) return emptyHover(tile, "action-used");

  const ability =
    intent.kind === "ability" ? requireAbility(intent.abilityId) : null;
  if (intent.kind === "ability") {
    if (!actor.abilityIds.includes(intent.abilityId)) {
      return emptyHover(tile, "no-target");
    }
    if ((actor.cooldowns[intent.abilityId] ?? 0) > 0) {
      return emptyHover(tile, "on-cooldown");
    }
  }

  const previewIntent: PreviewIntent =
    intent.kind === "attack"
      ? { kind: "attack" }
      : { kind: "ability", abilityId: intent.abilityId };

  // A self-boost is aimed at nobody: its only legal tiles are the ones
  // the caster is standing on.
  if (ability?.effect.type === "boost") {
    if (tileGap(actor, tile) > 0) {
      return emptyHover(tile, "self-only");
    }
    const outcomes = outcomesFor(state, previewIntent, actor.id);
    if (outcomes.length === 0) return emptyHover(tile, "self-only");
    return {
      tile: { ...tile },
      valid: true,
      reason: null,
      path: [],
      cost: null,
      stepsLeft: null,
      impact: bodyTiles(actor),
      outcomes,
      targetId: actor.id,
    };
  }

  const body = bodyAt(state, tile);
  if (!body || !areOpposed(body, actor)) return emptyHover(tile, "no-target");
  const reach = ability
    ? ability.range
    : weaponReach(actor.weapon);
  if (bodyGap(actor, body) > reach) {
    return emptyHover(tile, "out-of-range");
  }
  const outcomes = outcomesFor(state, previewIntent, body.id);
  if (outcomes.length === 0) return emptyHover(tile, "no-target");
  return {
    tile: { ...tile },
    valid: true,
    reason: null,
    path: [],
    cost: null,
    stepsLeft: null,
    // The tiles the shape covers, not merely the bodies on them: an
    // area that catches one body still shows the ground it swept, and a
    // single blow on a chassis marks the whole chassis.
    impact: ability
      ? abilityAreaTiles(state, actor, ability, body.position)
      : bodyTiles(body),
    outcomes,
    targetId: body.id,
  };
}

/**
 * What pointing at a tile would do under the open intent. Always
 * answers — an illegal hover comes back with `valid: false` and the
 * first thing standing in the way, which is what the negative tint and
 * its chip are drawn from.
 */
export function telegraphHover(
  state: CombatState,
  intent: TelegraphIntent,
  tile: GridPosition,
): TelegraphHover {
  // Nothing open: the cursor is just a cursor, and refusing it would be
  // an error message about a decision the player has not made yet.
  if (intent.kind === "none") return emptyHover(tile, null);
  const resolved = telegraphActor(state);
  if (!("actor" in resolved)) return emptyHover(tile, resolved.reason);
  const { actor } = resolved;
  if (!inBounds(state.grid, tile)) return emptyHover(tile, "off-grid");
  return intent.kind === "move"
    ? moveHover(state, actor, tile)
    : aimHover(state, actor, intent, tile);
}

/**
 * Every tinted tile right now: the standing field, the ground already
 * promised by a wind-up, then whatever the cursor adds on top of both.
 * Later entries win, so a previewed path overwrites the reach it runs
 * through, a refusal overwrites whatever it was refused on, and a threat
 * survives the context tints it sits inside — but not the hot ones,
 * because a player aiming has already been told about the threat.
 */
export function telegraphTiles(
  state: CombatState,
  intent: TelegraphIntent,
  hover: TelegraphHover | null,
): TelegraphTile[] {
  const tiles = [...telegraphField(state, intent), ...threatTiles(state)];
  if (!hover) return tiles;
  if (hover.valid) {
    for (const tile of hover.path) tiles.push({ ...tile, role: "path" });
    for (const tile of hover.impact) tiles.push({ ...tile, role: "impact" });
  } else if (hover.reason !== null) {
    tiles.push({ ...hover.tile, role: "denied" });
  }
  return tiles;
}

/**
 * The tint each tile ends up with once overlap is settled: last role
 * wins, in the order telegraphTiles built them. Painting reads this so
 * one tile is filled exactly once, however many roles claimed it.
 */
export function resolveTelegraphTiles(
  tiles: readonly TelegraphTile[],
): TelegraphTile[] {
  const byTile = new Map<string, TelegraphTile>();
  for (const tile of tiles) byTile.set(`${tile.x},${tile.y}`, { ...tile });
  return [...byTile.values()];
}

/** The body a hovered tile is about, when the arena has one there. */
export function telegraphTargetAt(
  state: CombatState,
  tile: GridPosition | null,
): string | null {
  if (!tile) return null;
  return bodyAt(state, tile)?.id ?? null;
}
