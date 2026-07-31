import type { StatKey, Stats } from "../character/stats";
import type { WeaponProfile } from "../inventory/mods";
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

/**
 * Snapshot of whatever the combatant fights with (item or enemy data).
 *
 * This is the item layer's `WeaponProfile` — the figures a weapon has
 * *with its fitted parts already folded in*, derived once at setup (see
 * equippedWeaponProfile). The engine therefore never learns that mods
 * exist: it reads a weapon's numbers, and a modded weapon simply has
 * different ones. Enemy weapons are the same shape with every optional
 * figure absent, which is exactly the unmodded reading.
 */
export type CombatWeapon = WeaponProfile;

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
 * The noise a screaming Static band builds over a fight, and the one
 * discharge it is allowed (see ./surge.ts). Plain data like everything
 * else on CombatState, and absent entirely on a runner quiet enough
 * that nothing can build — which is every fight the feature is not
 * about.
 */
export interface StaticSurge {
  /** Whose chrome this is; the player's, always. */
  combatantId: string;
  /** Turns of noise banked so far; it arms at SURGE_ARM_TURNS. */
  charge: number;
  /** Armed: it takes the owner's next turn unless they bleed it off. */
  armed: boolean;
  /** Gone off, or vented. Either way it never comes back this fight. */
  spent: boolean;
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
  /**
   * A fixed shift applied to this body's place in the initiative order,
   * and to nothing else. Absent on almost everything; the player picks
   * one up from a screaming Static band (see src/data/static.ts), which
   * is the whole of that band's effect on the fight's *ordering* — the
   * stat itself is untouched, so steps per turn and every roll that
   * reads Reflexes stay exactly where they were. Chance-free by
   * construction: the same loadout always falls the same distance.
   */
  initiativeMod?: number;
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
  | {
      /**
       * The chrome has banked as much noise as it can hold. One turn of
       * warning: this is the turn the player has to bleed it off.
       */
      type: "static-armed";
      combatantId: string;
    }
  | {
      /** Bled off by holding still — the noise goes, the turn is kept. */
      type: "static-vented";
      combatantId: string;
    }
  | {
      /**
       * It went off. The stun follows as the ordinary `stun-skipped`
       * entry the turn loop already writes, so a surge costs a turn in
       * exactly the way every other stun does.
       */
      type: "static-surge";
      combatantId: string;
      stunTurns: number;
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
  /**
   * The player's cyberware noise building toward its one discharge, or
   * absent when their Static band is quiet enough that nothing builds.
   * Optional so a fight saved before Static existed loads as exactly
   * what it was: a fight where nothing was going to go off.
   */
  surge?: StaticSurge | null;
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
