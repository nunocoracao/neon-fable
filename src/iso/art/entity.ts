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
 * That is the whole point of the `kind` tag. The multi-tile boss the
 * comment used to name as a hypothetical is now the third variant: a
 * new case *here*, and no scene, screen, or provider code changed for
 * it, because none of them ever asks what kind of thing they are
 * drawing.
 *
 * ## Frames are per kind, and that is the only thing that varies
 *
 * A person and a drone share the 32×48 frame at anchor (16, 44); a
 * security chassis is 96×112 at (48, 104), drawn over the middle of the
 * 2×2 block it stands on. Everything downstream reads `entityFrame`
 * rather than assuming the body frame, so silhouettes, status markers,
 * muzzle offsets, and camera focus land correctly on all three with no
 * cases anywhere else. Everything here is pure over grids — canvas
 * baking stays in ./provider.
 */
import type { Facing, MotionState } from "../animation";
import type { AttackClassId } from "../attack";
import type { ReactionVariant } from "../reaction";
import { DRONE_ART, type DroneArtId, type DroneSetId } from "./drone";
import {
  MECH_ART,
  MECH_FRAME,
  mechAttackClass,
  mechAttackVariant,
  mechGrid,
  mechMuzzlePoint,
  type MechArtId,
} from "./mech";
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
export const ENTITY_ART_KINDS = ["character", "drone", "mech"] as const;

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

/** A machine too big for one tile: one of the chassis sets in ./mech. */
export interface MechEntityArt {
  readonly kind: "mech";
  readonly mech: MechArtId;
}

export type EntityArt = CharacterEntityArt | DroneEntityArt | MechEntityArt;

/** Wrap a composed character as entity art. */
export function characterArt(character: ComposedCharacter): CharacterEntityArt {
  return { kind: "character", character };
}

/** Name an authored drone chassis as entity art. */
export function droneArt(drone: DroneArtId): DroneEntityArt {
  return { kind: "drone", drone };
}

/** Name an authored multi-tile chassis as entity art. */
export function mechArt(mech: MechArtId): MechEntityArt {
  return { kind: "mech", mech };
}

/**
 * The grid frame this art is drawn in: how big its grids are, and which
 * pixel of them lands on the point the scene positions it by. A person
 * and a drone share the body frame; a chassis has its own, and the
 * anchor is what puts it over the middle of its block rather than over
 * one corner of it.
 */
export interface EntityFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export function entityFrame(art: EntityArt): EntityFrame {
  return art.kind === "mech" ? MECH_FRAME : BODY_FRAME;
}

/**
 * Which attack animation this art swings — the class of the weapon a
 * character holds, the class an authored chassis is built to. Drives
 * both the frame selection and the combat scene's beat timing.
 *
 * `variant` picks between the sets of art that swings more than one way
 * (a chassis smashes with a piston and fires with a shoulder battery);
 * everything with a single set ignores it, which is everything else.
 */
export function entityAttackClass(art: EntityArt, variant = 0): AttackClassId {
  if (art.kind === "character") return attackClassFor(art.character);
  if (art.kind === "drone") return DRONE_ART[art.drone].attackClass;
  return mechAttackClass(art.mech, variant);
}

/** How many attack sets this art has; 1 for everything with one swing. */
export function entityAttackVariants(art: EntityArt): number {
  return art.kind === "mech" ? MECH_ART[art.mech].attackClasses.length : 1;
}

/**
 * Bake-cache key for one frame. Kinds are namespaced, so two kinds can
 * never collide on a key however the ids are spelled.
 */
export function entityFrameKey(
  art: EntityArt,
  facing: Facing,
  state: MotionState,
  frame: number,
  variant?: ReactionVariant,
  attackVariant = 0,
): string {
  if (art.kind === "character") {
    return `character|${composedFrameKey(art.character, facing, state, frame, variant)}`;
  }
  const suffix = variant ? `:${variant.kind}:${variant.awayX}` : "";
  if (art.kind === "drone") {
    return `drone|${art.drone}:${facing}:${state}:${frame}${suffix}`;
  }
  // The swing is part of the key: a piston frame and a battery frame
  // are different pictures at the same index.
  const swing =
    state === "attack" ? `:v${mechAttackVariant(art.mech, attackVariant)}` : "";
  return `mech|${art.mech}:${facing}:${state}:${frame}${swing}${suffix}`;
}

/**
 * The loop sets an authored chassis has; anything else is derived. A
 * drone authors no wind-up stance, so a charging drone simply idles —
 * the "charge" state is a hint, never a requirement.
 */
function droneSetFor(state: MotionState): DroneSetId | null {
  if (state === "charge") return "idle";
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
 * The grid this art draws for a pose, in its own frame (see
 * `entityFrame`). Pure and deterministic; the provider only calls it on
 * a bake-cache miss.
 */
export function entityGrid(
  art: EntityArt,
  facing: Facing,
  state: MotionState,
  frame: number,
  variant?: ReactionVariant,
  attackVariant = 0,
): PixelGrid {
  if (art.kind === "character") {
    return composedCharacterGrid(art.character, facing, state, frame, variant);
  }
  if (art.kind === "drone") {
    return droneGrid(art.drone, facing, state, frame, variant);
  }
  return mechGrid(art.mech, facing, state, frame, {
    attackVariant,
    ...(variant ? { reaction: variant } : {}),
  });
}

/**
 * Where a blow leaves this art, in 1x art pixels of its own frame. A
 * character's is its weapon class's muzzle on the firing frame; a
 * drone's is its authored stinger emitter; a chassis has one per swing.
 * South and west mirror the whole figure, so the point mirrors with it.
 */
export function entityMuzzlePoint(
  art: EntityArt,
  facing: Facing,
  attackVariant = 0,
): { x: number; y: number } {
  if (art.kind === "character") {
    return muzzlePoint(
      attackClassFor(art.character),
      art.character.build,
      facing,
    );
  }
  if (art.kind === "mech") {
    return mechMuzzlePoint(art.mech, facing, attackVariant);
  }
  const { x, y } = DRONE_ART[art.drone].muzzle;
  const { flip } = bodyViewForFacing(facing);
  return { x: flip ? BODY_FRAME.width - 1 - x : x, y };
}
