/**
 * Sprite contracts for the iso renderer. Scenes ask a SpriteProvider for
 * a drawable per tile/prop/interactable/entity each frame, passing tile
 * coordinates (for deterministic texture variants and phase offsets) and
 * the animation clock. The pixel-art implementation lives in ./art.
 */
import type { AbilityFxId } from "./abilityFx";
import type { Facing } from "./animation";
import type { AttackClassId } from "./attack";
import type { EffectSpriteId } from "./impact";
import type { PopupKind } from "./popup";
import type { ReactionPose } from "./reaction";
import type { StatusFamilyId } from "./status";
import type {
  DayPhaseId,
  InteractableSpriteId,
  PropId,
  TileId,
} from "./tilemap";

/**
 * "player" for the player character; any other value identifies a
 * non-player look the provider resolves through its injected entity
 * descriptor source (combat uses enemy archetype ids). Unresolvable
 * ids render the stock fallback look rather than crashing.
 */
export type EntitySpriteId = string;

/**
 * The large ambient machinery a map can declare (see ./setpiece.ts):
 * the cars of an elevated line, a patrol drone, and the steam a vent
 * stack blows off. Unlike props these carry no map placement of their
 * own — the set-piece logic says where each one is this frame — so the
 * provider only ever needs the id and an explicit frame index.
 */
export type SetPieceSpriteId =
  | "train-head"
  | "train-car"
  | "patrol-drone"
  | "steam-burst";

/**
 * A drawable image plus its anchor: the pixel inside the image that
 * should land on the center of the tile diamond it occupies.
 */
export interface Sprite {
  image: CanvasImageSource;
  anchorX: number;
  anchorY: number;
}

/** Animation state a character sprite is selected from. */
export interface EntityPose {
  facing: Facing;
  moving: boolean;
  /** Absolute animation clock in milliseconds. */
  timeMs: number;
  /**
   * Milliseconds since this entity's attack animation started, when the
   * combat sequencer is playing one. While it is inside the attack
   * class's sequence the one-shot attack frames win over the idle and
   * walk loops; past the end (and when absent) the loops resume. See
   * ./attack.ts for the timing and selection rules.
   */
  attackElapsedMs?: number | undefined;
  /**
   * The hit reaction or death this entity is playing, when the combat
   * sequencer has one queued for it: which reaction, how far into it,
   * and which way the blow threw it. Outranks both the attack set and
   * the loops — see ./reaction.ts.
   */
  reaction?: ReactionPose | undefined;
  /**
   * True while this entity is standing in a declared wind-up (see
   * src/combat/charge.ts). Selects the held "charge" stance over the
   * loops for art that authors one; art that does not simply idles.
   */
  charging?: boolean | undefined;
  /**
   * Which of this entity's attack sets is swinging, for art with more
   * than one (a chassis's piston arm versus its shoulder battery). 0 is
   * the default swing, which is the only swing almost everything has.
   */
  attackVariant?: number | undefined;
}

export interface SpriteProvider {
  /**
   * `wet` swaps in the tile's rain variant (a pooled puddle) where the
   * ground kind has one; ground without rain art ignores it.
   */
  tile(id: TileId, x: number, y: number, timeMs: number, wet?: boolean): Sprite;
  prop(id: PropId, x: number, y: number, timeMs: number): Sprite;
  /**
   * `open` (0..1) swaps the idle loop for the kind's way-opening art —
   * a door's leaves parting, an exit's iris flooding with light. Kinds
   * with no opening art ignore it, as does the resting value 0.
   */
  interactable(
    id: InteractableSpriteId,
    x: number,
    y: number,
    timeMs: number,
    open?: number,
  ): Sprite;
  /**
   * Solid-color silhouette of the same frame an `interactable` call
   * would return, for the focus outline. Idle loops recolor pixels but
   * never move one in or out of the shape, so one bake per kind covers
   * every frame of its loop.
   */
  interactableSilhouette(
    id: InteractableSpriteId,
    x: number,
    y: number,
    timeMs: number,
    color: string,
  ): Sprite;
  entity(id: EntitySpriteId, pose: EntityPose): Sprite;
  /** Solid-color silhouette of the same frame, for hit flashes. */
  entitySilhouette(id: EntitySpriteId, pose: EntityPose): Sprite;
  /**
   * Which attack animation this entity's current look swings — the
   * class of the weapon it holds, or "unarmed". `attackVariant` picks
   * between the sets of art that swings more than one way; everything
   * with a single set ignores it. The combat scene asks so it can time
   * the sequence's beats; providers that resolve no descriptors may
   * omit it and callers fall back to bare hands.
   */
  attackClass?(id: EntitySpriteId, attackVariant?: number): AttackClassId;
  /**
   * Where this entity's sprite anchor sits inside its own frame, in
   * screen pixels — how tall the thing is, in effect. The scene hangs
   * health bars, condition marks, and the height a blow lands at off
   * it, so a 96×112 chassis wears them over its own shoulders rather
   * than at a person's height. Providers that resolve no descriptors
   * may omit it; callers then assume a body-sized frame.
   */
  entityAnchor?(id: EntitySpriteId): { x: number; y: number };
  /**
   * Screen-pixel offset from this entity's sprite anchor to the point
   * its blow leaves from — the weapon muzzle on the class's firing
   * frame, or the fist for everything that throws no round (see
   * muzzlePoint in ./art/layers/attack). Per facing, because the away
   * facings mirror the whole figure, and per attack variant, because a
   * chassis's piston and its shoulder battery are not the same port.
   * Providers that resolve no descriptors may omit it; callers then
   * fire from the chest.
   */
  muzzleOffset?(
    id: EntitySpriteId,
    facing: Facing,
    attackVariant?: number,
  ): { x: number; y: number };
  /**
   * A combat effect's baked frame — muzzle flash, tracer, arc smear,
   * spark burst, wall chip (see ./impact.ts). Frames are authored art
   * cached like every other bake; nothing here is drawn procedurally.
   * Optional, so providers with no effect art simply show none.
   */
  effect?(id: EffectSpriteId, frame: number): Sprite;
  /**
   * An ability effect archetype's baked frame — the arc, the glare, the
   * slam, the mesh, the cloud, the auras (see ./abilityFx.ts). Abilities
   * name an archetype rather than carrying art of their own, so one
   * baked set serves every ability that shares the look. Optional, so
   * providers with no ability art simply show none.
   */
  abilityEffect?(id: AbilityFxId, frame: number): Sprite;
  /**
   * A status family's marker glyph (see ./status.ts), baked per frame of
   * its slow loop. Optional, like the effects above.
   */
  statusMarker?(id: StatusFamilyId, frame: number): Sprite;
  /**
   * One floating readout — a damage figure, "MISS", a status label —
   * composed from the pixel font and baked in the kind's own ink (see
   * ./popup.ts). Anchored on the bottom center of the text, so the
   * scene positions it by the point it hangs over. Optional, like the
   * effects above.
   */
  popupText?(text: string, kind: PopupKind): Sprite;
  /**
   * Pre-baked radial glow in a palette color for the additive neon
   * pass; radius is in 1x art pixels, anchored at the glow center.
   */
  glow(color: string, radius: number): Sprite;
  /** Pre-baked rain streak for a parallax layer, anchored at its tail. */
  rainStreak(layer: number): Sprite;
  /** Pre-baked splash micro-frame, anchored on the tile diamond center. */
  splash(frame: number): Sprite;
  /**
   * A set piece's frame, by explicit index — the scheduling logic has
   * already decided which one is showing, so nothing about the clock
   * reaches the provider here.
   */
  setPiece(id: SetPieceSpriteId, frame: number): Sprite;
  /**
   * Move the clock: subsequent bakes go through the hour's tinted
   * palette (see ./dayPhase.ts). Optional — a provider that does not
   * tint simply ignores the hour.
   */
  setDayPhase?(phase: DayPhaseId): void;
}
