/**
 * What a thing on the board is made of, as far as the renderer cares.
 *
 * Most of what fights is a person: a composed stack of appearance layers
 * (./layers). Some of it never was — the combat drone is an authored
 * chassis with a rotor ring and no face (./drone). Rather than teach the
 * sprite provider, the combat scene, and the gallery about each kind,
 * everything downstream takes an `EntityArt`: a discriminated union with
 * one function per question the renderer asks — which frame, which cache
 * key, which attack animation, where the shot leaves from.
 *
 * That is the whole point of the `kind` tag. Adding a second
 * non-humanoid (a turret, a multi-tile boss) means a new variant and new
 * cases *here*; no scene, screen, or provider code changes, because none
 * of them ever asks what kind of thing they are drawing.
 *
 * Both kinds share the 32×48 frame and the (16, 44) anchor, so a
 * silhouette, a status marker, and a camera focus land identically on a
 * drone and on a person. Everything here is pure over grids — canvas
 * baking stays in ./provider.
 */
import type { Facing, MotionState } from "../animation";
import type { AttackClassId } from "../attack";
import type { ReactionVariant } from "../reaction";
import { DRONE_ART, type DroneArtId, type DroneSetId } from "./drone";
import {
  attackClassFor,
  composedCharacterGrid,
  composedFrameKey,
  type ComposedCharacter,
} from "./layers";
import { BODY_FRAME, bodyViewForFacing } from "./layers/body";
import { muzzlePoint } from "./layers/attack";
import { reactionFrameGrid } from "./layers/hit";
import { mirrored, type PixelGrid } from "./pixel";

/** The sprite kinds the renderer knows how to draw. */
export const ENTITY_ART_KINDS = ["character", "drone"] as const;

export type EntityArtKind = (typeof ENTITY_ART_KINDS)[number];

/** A person: the layered appearance system's composed descriptor. */
export interface CharacterEntityArt {
  readonly kind: "character";
  readonly character: ComposedCharacter;
}

/** A machine: one of the authored chassis sets in ./drone. */
export interface DroneEntityArt {
  readonly kind: "drone";
  readonly drone: DroneArtId;
}

export type EntityArt = CharacterEntityArt | DroneEntityArt;

/** Wrap a composed character as entity art. */
export function characterArt(character: ComposedCharacter): CharacterEntityArt {
  return { kind: "character", character };
}

/** Name an authored drone chassis as entity art. */
export function droneArt(drone: DroneArtId): DroneEntityArt {
  return { kind: "drone", drone };
}

/**
 * Which attack animation this art swings — the class of the weapon a
 * character holds, the class an authored chassis is built to. Drives
 * both the frame selection and the combat scene's beat timing.
 */
export function entityAttackClass(art: EntityArt): AttackClassId {
  return art.kind === "character"
    ? attackClassFor(art.character)
    : DRONE_ART[art.drone].attackClass;
}

/**
 * Bake-cache key for one frame. Kinds are namespaced, so a drone and a
 * character can never collide on a key however the ids are spelled.
 */
export function entityFrameKey(
  art: EntityArt,
  facing: Facing,
  state: MotionState,
  frame: number,
  variant?: ReactionVariant,
): string {
  if (art.kind === "character") {
    return `character|${composedFrameKey(art.character, facing, state, frame, variant)}`;
  }
  const suffix = variant ? `:${variant.kind}:${variant.awayX}` : "";
  return `drone|${art.drone}:${facing}:${state}:${frame}${suffix}`;
}

/** The loop sets an authored chassis has; anything else is derived. */
function droneSetFor(state: MotionState): DroneSetId | null {
  return state === "idle" || state === "walk" || state === "attack"
    ? state
    : null;
}

/**
 * One frame of a drone: the authored set for the facing's view,
 * mirrored for the south and west facings. A reaction has no authored
 * frames — it folds the resting grid through the shared transforms in
 * ./layers/hit, after the mirror, exactly like a body does, which is
 * how a chassis keeps the spark-out death the fight already knew.
 */
function droneGrid(
  id: DroneArtId,
  facing: Facing,
  state: MotionState,
  frame: number,
  variant?: ReactionVariant,
): PixelGrid {
  const art = DRONE_ART[id];
  const { view, flip } = bodyViewForFacing(facing);
  if (state === "react") {
    if (!variant) throw new Error("a react frame needs a reaction variant");
    const resting = art.neutral[view];
    return reactionFrameGrid(
      flip ? mirrored(resting) : resting,
      variant.kind,
      frame,
      variant.awayX,
    );
  }
  const set = droneSetFor(state);
  if (set === null) throw new Error(`drone has no "${state}" set`);
  const frames = art.frames[view][set];
  const grid = frames[frame];
  if (!grid) {
    throw new Error(`no drone ${set} frame ${frame} (have ${frames.length})`);
  }
  return flip ? mirrored(grid) : grid;
}

/**
 * The 32×48 grid this art draws for a pose. Pure and deterministic; the
 * provider only calls it on a bake-cache miss.
 */
export function entityGrid(
  art: EntityArt,
  facing: Facing,
  state: MotionState,
  frame: number,
  variant?: ReactionVariant,
): PixelGrid {
  return art.kind === "character"
    ? composedCharacterGrid(art.character, facing, state, frame, variant)
    : droneGrid(art.drone, facing, state, frame, variant);
}

/**
 * Where a blow leaves this art, in 1x art pixels of the composed frame.
 * A character's is its weapon class's muzzle on the firing frame; a
 * drone's is its authored stinger emitter. South and west mirror the
 * whole figure, so the point mirrors with it.
 */
export function entityMuzzlePoint(
  art: EntityArt,
  facing: Facing,
): { x: number; y: number } {
  if (art.kind === "character") {
    return muzzlePoint(
      attackClassFor(art.character),
      art.character.build,
      facing,
    );
  }
  const { x, y } = DRONE_ART[art.drone].muzzle;
  const { flip } = bodyViewForFacing(facing);
  return { x: flip ? BODY_FRAME.width - 1 - x : x, y };
}
