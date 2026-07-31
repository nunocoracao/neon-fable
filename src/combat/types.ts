import type { StatKey, Stats } from "../character/stats";
import type { RangeType } from "../inventory/items";
import type { RngState } from "../state/rng";

/**
 * Combat data model. CombatState is plain serializable data — the whole
 * fight (participants, grid, initiative, RNG state, event log) survives a
 * JSON round-trip, so a battle can be saved mid-turn or replayed in tests.
 */

export interface GridPosition {
  x: number;
  y: number;
}

export interface GridSize {
  width: number;
  height: number;
}

/** Snapshot of whatever the combatant fights with (item or enemy data). */
export interface CombatWeapon {
  name: string;
  damage: number;
  rangeType: RangeType;
}

/** A temporary stat modifier from a consumable or ability. */
export interface ActiveBoost {
  stat: StatKey;
  amount: number;
  /** Owner's turns remaining, including the current one. */
  turnsLeft: number;
}

export interface CombatConsumable {
  itemId: string;
  quantity: number;
}

/**
 * An attack a combatant has declared but not yet thrown: the wind-up
 * that makes a big hit answerable. The shape is resolved and frozen the
 * moment it is declared, so the ground the telegraph shows is the exact
 * ground the blow lands on a turn later — walking out of it is what
 * beats it, and the caster turning to follow you is not a thing that
 * happens (see ./charge.ts).
 */
export interface ChargedAction {
  abilityId: string;
  /** The body it was aimed at; kept for the log and the AI's read. */
  targetId: string;
  /** Exactly the tiles it will land on, frozen at declaration. */
  tiles: GridPosition[];
  /** Caster turns still to burn; 1 means it fires on its next turn. */
  turnsLeft: number;
}

/**
 * A participant. Player stats/gear are snapshotted from GameState at setup
 * (via effectiveStats and equipment selectors) so combat math never reaches
 * back into inventory; enemies come from src/data/enemies.ts.
 */
/**
 * Which side of the fight a body is on, and who drives it. "player" and
 * "ally" are one side and both are played by the player (an ally takes
 * its turn through the same action UI); "enemy" is the other side and
 * is driven by the AI. Friend-or-foe is asked through `areOpposed` in
 * ./state.ts rather than by comparing kinds, so an ally and the player
 * can never end up targeting each other.
 */
export type CombatantKind = "player" | "ally" | "enemy";

export interface Combatant {
  id: string;
  kind: CombatantKind;
  name: string;
  /** Content id in src/data/companions.ts; only on allies. */
  companionId?: string;
  /** Which authored look an ally wears, for its sprite and portrait. */
  lookId?: string;
  /** Content id in src/data/enemies.ts; absent for the player. */
  enemyId?: string;
  /**
   * Which record of the archetype's look family this spawn wears,
   * resolved once at setup (see spawnLookIndex in src/data/encounters)
   * and carried on the combatant so the fight, its saves, and its
   * replays all draw the same faces. Absent for the player and for
   * archetypes with a single authored look.
   */
  lookIndex?: number;
  stats: Stats;
  maxHp: number;
  hp: number;
  weapon: CombatWeapon;
  armor: number;
  abilityIds: string[];
  /** The block's minimum-x, minimum-y tile (see ./footprint.ts). */
  position: GridPosition;
  /**
   * Tiles this combatant stands on, anchored at `position`. Absent is
   * the single tile everything on the board used to be; a security
   * chassis is 2×2. Movement, occupancy, reach, and every telegraph
   * read the block rather than the anchor.
   */
  footprint?: GridSize;
  boosts: ActiveBoost[];
  /** Turns this combatant skips before acting again. */
  stunTurns: number;
  /** The attack this combatant is winding up, when it is winding one up. */
  charge?: ChargedAction | null;
  /** Ability id -> turns until usable again. */
  cooldowns: Record<string, number>;
  /** Consumables usable in combat (player only; empty for enemies). */
  consumables: CombatConsumable[];
}

export type CombatStatus = "active" | "victory" | "defeat" | "fled";

export type CombatAction =
  | { type: "move"; to: GridPosition }
  | { type: "attack"; targetId: string }
  | { type: "use-item"; itemId: string }
  | { type: "use-ability"; abilityId: string; targetId: string }
  | { type: "flee" }
  | { type: "end-turn" };

/** Typed log entries the combat UI renders; appended, never rewritten. */
export type CombatEvent =
  | { type: "combat-started"; encounterId: string }
  | { type: "round-started"; round: number }
  | { type: "turn-started"; combatantId: string }
  | { type: "stun-skipped"; combatantId: string }
  | {
      type: "moved";
      combatantId: string;
      from: GridPosition;
      to: GridPosition;
    }
  | {
      type: "attacked";
      attackerId: string;
      targetId: string;
      hit: boolean;
      damage: number;
    }
  | {
      type: "ability-used";
      combatantId: string;
      abilityId: string;
      targetId: string;
      damage: number;
      stunTurns: number;
    }
  | {
      /** A wind-up declared: the ground is marked, the blow is a turn away. */
      type: "charge-started";
      combatantId: string;
      abilityId: string;
      targetId: string;
      /** Caster turns until it fires. */
      turns: number;
    }
  | {
      /**
       * The wind-up going off. Whatever it caught follows as ordinary
       * `ability-used` entries, so a released charge reads — in the log,
       * in the effects, and in the floating figures — exactly like the
       * ability it always was.
       */
      type: "charge-released";
      combatantId: string;
      abilityId: string;
      /** Bodies the frozen shape actually caught; 0 is a clean dodge. */
      bodies: number;
    }
  | { type: "item-used"; combatantId: string; itemId: string }
  | { type: "healed"; combatantId: string; amount: number }
  | {
      type: "boosted";
      combatantId: string;
      stat: StatKey;
      amount: number;
      turns: number;
    }
  | { type: "flee-attempted"; combatantId: string; success: boolean }
  | { type: "defeated"; combatantId: string }
  | { type: "combat-ended"; result: Exclude<CombatStatus, "active"> };

export interface CombatState {
  encounterId: string;
  grid: GridSize;
  combatants: Combatant[];
  /** Combatant ids in initiative order; fixed for the whole fight. */
  initiativeOrder: string[];
  round: number;
  /** Index into initiativeOrder of the combatant whose turn it is. */
  turnIndex: number;
  /** Grid steps left this turn. */
  moveRemaining: number;
  /** True once this turn's main action (attack/item/ability/flee) is spent. */
  actionUsed: boolean;
  rng: RngState;
  status: CombatStatus;
  fleeable: boolean;
  /** Consumables spent, removed from the inventory when combat resolves. */
  itemsConsumed: CombatConsumable[];
  log: CombatEvent[];
}

export type CombatErrorCode =
  | "combat-over"
  | "combat-active"
  | "unknown-combatant"
  | "action-used"
  | "invalid-move"
  | "invalid-target"
  | "out-of-range"
  | "no-item"
  | "unknown-ability"
  | "ability-on-cooldown"
  | "cannot-flee"
  | "player-only"
  | "enemy-only";

export class CombatError extends Error {
  constructor(
    readonly code: CombatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CombatError";
  }
}
