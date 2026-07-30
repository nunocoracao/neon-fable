/**
 * What an ability looks like when it goes off: which effect set it
 * plays, where that set is drawn, when the blow inside it lands, and —
 * when one cast reaches several combatants — the order the answers come
 * back in.
 *
 * ## Archetypes, not abilities
 *
 * Nothing here knows an ability id. Every ability in ../data/abilities
 * carries a typed `effectRef` naming one of the archetypes below, and
 * several abilities may name the same one: a shock dart and a stun
 * strike are the same arc thrown at different reaches. Adding an
 * ability is a content edit; adding a *look* is an entry in this
 * registry plus its frames in ./art/abilityEffects.
 *
 * ## Four forms
 *
 * The form decides where the frames are drawn, and it is the only thing
 * the scene branches on:
 *
 * - `beam` — a chain of segment pictures spanning caster → target, laid
 *   on alternating sides of the line so the chain crackles rather than
 *   sits (see beamPoints). Struck instantly: nothing travels.
 * - `burst` — one set of frames at the target, centered on its chest.
 * - `cloud` — the same, but the frames loop for as long as the effect
 *   hangs over the tile.
 * - `aura` — the frames play on the *caster*, which is what a self-buff
 *   is: nothing crosses the arena, so nothing is thrown.
 *
 * ## Ordering
 *
 * A cast is three beats: the wind-up, the effect, then whatever answers
 * it. The wind-up is the caster's own weapon swing (attackImpactMs, the
 * same beat a plain attack throws on) for everything that leaves the
 * body, and a short gather for an aura, which swings nothing. The
 * effect starts on that beat; the blow lands on the archetype's contact
 * frame — immediately for a bolt, a beat later for a cloud that has to
 * settle first — and every target of one cast lands on the same beat.
 * Their reactions then queue in initiative order through ./reaction, so
 * an area effect reads as one blow answered down the line rather than a
 * simultaneous twitch.
 *
 *     cast wind-up → effect (all targets at once) → reactions (in order)
 *
 * ## Reduced motion
 *
 * One frame of the archetype, held on each target long enough to be
 * seen, and everything else resolves at once — the same collapse
 * ./impact makes of a blow, for the same reason.
 *
 * Pure over an archetype id, a screen distance, and an elapsed
 * millisecond count: no wall clock, no art, no canvas. The art module
 * authors frames to these counts and a test pins the two together.
 */
import { attackImpactMs, type AttackClassId } from "./attack";
import type { ScreenPoint } from "./coords";
import { REDUCED_IMPACT_MS } from "./impact";

/** Where an archetype's frames are drawn; see the module comment. */
export type AbilityFxForm = "beam" | "burst" | "cloud" | "aura";

/**
 * Every ability effect archetype. Ids are content-facing — abilities
 * name them in `effectRef` — so they read as what they are rather than
 * as which ability first needed them.
 */
export const ABILITY_FX_IDS = [
  "shock-arc",
  "volley-streak",
  "optic-flash",
  "kinetic-slam",
  "snare-mesh",
  "nano-cloud",
  "guard-shimmer",
  "focus-ring",
] as const;

export type AbilityFxId = (typeof ABILITY_FX_IDS)[number];

/** Timing and shape of one archetype. The art is authored to these. */
export interface AbilityFxSpec {
  readonly form: AbilityFxForm;
  /** How long each authored frame holds. */
  readonly frameMs: number;
  readonly frameCount: number;
  /**
   * How many times the frame set runs. Only a cloud lingers; everything
   * else plays its frames once and is gone.
   */
  readonly loops: number;
  /**
   * The frame the blow lands on — the beat reactions and damage numbers
   * ride. A bolt connects the instant it is drawn; a cloud has to reach
   * the target before it does anything.
   */
  readonly contactFrame: number;
  /**
   * Beams only: screen pixels between the segment pictures laid along
   * the line. Close spacing (under a picture's own width) reads as one
   * unbroken rope of light; wide spacing reads as separate things
   * travelling the same line. 0 for every other form, pinned by a test.
   */
  readonly segmentSpacingPx: number;
  /**
   * Beams only: screen pixels the chain steps off the line at its
   * widest. A crackling arc wanders; aimed fire barely does.
   */
  readonly amplitudePx: number;
}

/**
 * The archetype registry. Frame counts are pinned to the authored art
 * in ./art/abilityEffects by a test, exactly as EFFECT_TIMING is.
 */
export const ABILITY_FX: Readonly<Record<AbilityFxId, AbilityFxSpec>> = {
  // A bolt of static laid along the line: strike, fork, gutter out.
  "shock-arc": {
    form: "beam",
    frameMs: 55,
    frameCount: 3,
    loops: 1,
    contactFrame: 0,
    segmentSpacingPx: 11,
    amplitudePx: 7,
  },
  // Three rounds downrange inside one heartbeat: the same line, three
  // times, each dash a shorter and colder version of the last.
  "volley-streak": {
    form: "beam",
    frameMs: 45,
    frameCount: 3,
    loops: 1,
    contactFrame: 0,
    segmentSpacingPx: 34,
    amplitudePx: 3,
  },
  // A glare that goes off in the target's face: flare, ring, afterimage.
  "optic-flash": {
    form: "burst",
    frameMs: 50,
    frameCount: 3,
    loops: 1,
    contactFrame: 0,
    segmentSpacingPx: 0,
    amplitudePx: 0,
  },
  // Weight arriving: the shock ring, the plate folding, the fragments.
  "kinetic-slam": {
    form: "burst",
    frameMs: 55,
    frameCount: 3,
    loops: 1,
    contactFrame: 0,
    segmentSpacingPx: 0,
    amplitudePx: 0,
  },
  // Mesh thrown open, mesh closing, mesh drawn tight.
  "snare-mesh": {
    form: "burst",
    frameMs: 60,
    frameCount: 3,
    loops: 1,
    contactFrame: 1,
    segmentSpacingPx: 0,
    amplitudePx: 0,
  },
  // A cloud has to arrive before it does anything, and it hangs about
  // afterwards: four frames of drift, run three times over.
  "nano-cloud": {
    form: "cloud",
    frameMs: 90,
    frameCount: 4,
    loops: 3,
    contactFrame: 1,
    segmentSpacingPx: 0,
    amplitudePx: 0,
  },
  // Plating coming up around the body: the lattice lights, holds, fades.
  "guard-shimmer": {
    form: "aura",
    frameMs: 90,
    frameCount: 3,
    loops: 1,
    contactFrame: 0,
    segmentSpacingPx: 0,
    amplitudePx: 0,
  },
  // The world slowing down: rings rising off the frame, one after another.
  "focus-ring": {
    form: "aura",
    frameMs: 85,
    frameCount: 3,
    loops: 1,
    contactFrame: 0,
    segmentSpacingPx: 0,
    amplitudePx: 0,
  },
};

/** A short gather before an aura lights; auras swing no weapon. */
export const AURA_CAST_MS = 120;

/** Screen pixels a beam's chain steps off the line at its widest. */
export const BEAM_AMPLITUDE_PX = 9;

/**
 * Most segments one beam is ever drawn with. A bolt fired the length of
 * an arena is still a bolt; past this the extra pictures are stacked on
 * top of each other and cost frames for nothing.
 */
export const BEAM_MAX_SEGMENTS = 24;

/**
 * How many segment pictures a beam of this length is drawn with. Two is
 * the floor — a chain needs a middle and an end to read as a chain — and
 * a form that lays no chain (every non-beam) asks for none.
 */
export function beamSegmentCount(
  distancePx: number,
  spacingPx: number,
): number {
  if (spacingPx <= 0) return 0;
  const wanted = Math.round(Math.max(0, distancePx) / spacingPx);
  return Math.min(BEAM_MAX_SEGMENTS, Math.max(2, wanted));
}

/** Whether the caster throws this with its weapon, or simply lights up. */
export function castsWithWeapon(fx: AbilityFxId): boolean {
  return ABILITY_FX[fx].form !== "aura";
}

/**
 * Ms from the cast starting to its effect firing: the caster's own swing
 * beat for anything it throws, a short gather for an aura.
 */
export function abilityCastMs(
  fx: AbilityFxId,
  attackClass: AttackClassId,
): number {
  return castsWithWeapon(fx) ? attackImpactMs(attackClass) : AURA_CAST_MS;
}

/** The effect's window on the timeline, in ms from the cast's start. */
export interface AbilityFxWindow {
  readonly startMs: number;
  readonly frameMs: number;
  readonly frameCount: number;
  readonly loops: number;
  /** Exclusive: nothing of the effect is drawn from here on. */
  readonly endMs: number;
}

/** The full timeline of one cast. Derived, never authored. */
export interface AbilityFxSequence {
  readonly fx: AbilityFxId;
  readonly form: AbilityFxForm;
  /** Ms from the cast's start to the effect firing. */
  readonly castMs: number;
  readonly effect: AbilityFxWindow;
  /**
   * Ms from the cast's start to the blow landing — the beat the hit
   * reactions and the floating numbers ride.
   */
  readonly contactMs: number;
  /** Ms the whole cast runs for, effect included. */
  readonly endMs: number;
}

export interface AbilityFxOptions {
  /** Ms of wind-up before the effect fires; see abilityCastMs. */
  readonly castMs?: number;
  /** Collapse the whole cast to one held marker per target. */
  readonly reducedMotion?: boolean;
}

/** Place the archetype's frames at `startMs`. */
function placed(spec: AbilityFxSpec, startMs: number): AbilityFxWindow {
  return {
    startMs,
    frameMs: spec.frameMs,
    frameCount: spec.frameCount,
    loops: spec.loops,
    endMs: startMs + spec.frameMs * spec.frameCount * spec.loops,
  };
}

/**
 * The timeline for one cast; pure, so callers may recompute it freely.
 * Under reduced motion the whole thing is a single held frame at time
 * zero — the same instant everything else in that mode resolves on.
 */
export function abilityFxSequence(
  fx: AbilityFxId,
  options: AbilityFxOptions = {},
): AbilityFxSequence {
  const spec = ABILITY_FX[fx];
  if (options.reducedMotion === true) {
    const only: AbilityFxWindow = {
      startMs: 0,
      frameMs: REDUCED_IMPACT_MS,
      frameCount: 1,
      loops: 1,
      endMs: REDUCED_IMPACT_MS,
    };
    return {
      fx,
      form: spec.form,
      castMs: 0,
      effect: only,
      contactMs: 0,
      endMs: only.endMs,
    };
  }
  const castMs = Math.max(0, options.castMs ?? 0);
  const effect = placed(spec, castMs);
  return {
    fx,
    form: spec.form,
    castMs,
    effect,
    contactMs: castMs + spec.contactFrame * spec.frameMs,
    endMs: effect.endMs,
  };
}

/**
 * Which authored frame is showing `elapsedMs` into the cast, or null
 * before the effect fires and once it is over. A looping cloud wraps
 * back to its first frame; nothing here persists past its window.
 */
export function abilityFxFrameAt(
  effect: AbilityFxWindow,
  elapsedMs: number,
): number | null {
  if (elapsedMs < effect.startMs || elapsedMs >= effect.endMs) return null;
  if (effect.frameMs <= 0 || effect.frameCount <= 1) return 0;
  const step = Math.floor((elapsedMs - effect.startMs) / effect.frameMs);
  return step % effect.frameCount;
}

/** A combatant one cast reaches, and its place in the initiative order. */
export interface AbilityFxTarget {
  readonly entityId: string;
  /** Initiative index; reactions to one cast answer in it, earliest first. */
  readonly order: number;
}

/** One target's copy of the effect, on the shared timeline. */
export interface AbilityFxPlay {
  readonly entityId: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** A reaction one cast asks for, on the beat the blow landed. */
export interface AbilityFxReaction {
  readonly entityId: string;
  readonly order: number;
  readonly beatMs: number;
}

/** One cast, fully placed: the timeline, its effects, and its answers. */
export interface AbilityCastPlan {
  readonly sequence: AbilityFxSequence;
  /**
   * Every target's effect. All of them start together — an area effect
   * goes off once, not once per body it catches.
   */
  readonly plays: readonly AbilityFxPlay[];
  /**
   * The reactions the cast asks for, in initiative order. Handing these
   * to scheduleReaction in this order is what staggers a multi-target
   * cast down the initiative line (see ./reaction).
   */
  readonly reactions: readonly AbilityFxReaction[];
}

/** Total order over one cast's targets: initiative, then id. */
function byInitiative(a: AbilityFxTarget, b: AbilityFxTarget): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0;
}

/**
 * Place one cast over its targets. Duplicated targets collapse — a body
 * caught twice by one cast is still hit once — and the order the caller
 * listed them in never reaches the output, so the same cast plans the
 * same way however its targets arrived.
 */
export function planAbilityCast(
  fx: AbilityFxId,
  targets: readonly AbilityFxTarget[],
  options: AbilityFxOptions = {},
): AbilityCastPlan {
  const sequence = abilityFxSequence(fx, options);
  const seen = new Set<string>();
  const unique: AbilityFxTarget[] = [];
  for (const target of targets) {
    if (seen.has(target.entityId)) continue;
    seen.add(target.entityId);
    unique.push(target);
  }
  unique.sort(byInitiative);
  return {
    sequence,
    plays: unique.map((target) => ({
      entityId: target.entityId,
      startMs: sequence.effect.startMs,
      endMs: sequence.effect.endMs,
    })),
    reactions: unique.map((target) => ({
      entityId: target.entityId,
      order: target.order,
      beatMs: sequence.contactMs,
    })),
  };
}

/**
 * Where a beam's segment pictures go: `count` points stepping from the
 * caster to the target, each pushed off the line to alternating sides
 * so the chain reads as a bolt rather than a dotted rule. The push
 * tapers to nothing at both ends — the arc leaves the weapon and
 * arrives at the body on the line it was aimed along — and flips with
 * the frame, which is the whole of the crackle.
 *
 * Pure geometry: the same line and frame always give the same points.
 */
export function beamPoints(
  from: ScreenPoint,
  to: ScreenPoint,
  count: number,
  frame: number,
  amplitudePx: number = BEAM_AMPLITUDE_PX,
): ScreenPoint[] {
  if (count <= 0) return [];
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const length = Math.hypot(dx, dy);
  // Nothing to lay a chain along: every segment lands on the target.
  if (length === 0) {
    return Array.from({ length: count }, () => ({ sx: to.sx, sy: to.sy }));
  }
  const perpX = -dy / length;
  const perpY = dx / length;
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 1) / count;
    const side = (i + frame) % 2 === 0 ? 1 : -1;
    const push = amplitudePx * side * Math.sin(Math.PI * t);
    return {
      sx: from.sx + dx * t + perpX * push,
      sy: from.sy + dy * t + perpY * push,
    };
  });
}
