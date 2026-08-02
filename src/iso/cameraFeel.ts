/**
 * Combat camera feel: the three things that give a blow weight without
 * changing a single number the engine produced — the camera gliding to
 * whoever is acting, a few frames of frozen scene time when something
 * connects, and a small directional kick off the heaviest hits.
 *
 * ## One clock, and why the pause lives inside it
 *
 * Nothing here reads a wall clock. The combat scene runs on a *scene*
 * clock: the raw frame timestamp with every pause it has served so far
 * taken back out of it (see sceneTimeAt). A hit-pause is therefore not
 * a sleep, not a dropped frame, and not a flag every sequence has to
 * check — it is a stretch of raw time the scene clock does not advance
 * through. Everything already scheduled against that clock — swings,
 * tracers, flinches, deaths, floating figures — holds where it is and
 * resumes together, in order, with no beat lost and none doubled. Feed
 * the same pauses in and the whole fight replays identically.
 *
 * Pauses are inserted at a *future* scene time (the beat the blow lands
 * on), never at a moment already passed, so the clock is monotonic: it
 * runs, holds, and runs again, but never steps back.
 *
 * ## Weight
 *
 * How much a blow is worth is a reading of numbers the combat math
 * already produced (see isGlancingBlow / isCriticalBlow in
 * ../combat/damage) — nothing here is a mechanic and nothing branches
 * on it but the camera. A glance is worth nothing; a solid hit thrown by
 * hand is worth a few frozen frames; a heavy one adds a kick; a critical
 * pauses longest and kicks hardest. A blast is its own weight: no pause,
 * because nothing connected, but a push outward all the same.
 *
 * ## Restraint
 *
 * The shake is capped (MAX_SHAKE_PX) however many blows land at once,
 * decays to nothing inside a quarter second, and is scaled by a setting
 * the player owns. The default is meant to whisper: at ART_SCALE the
 * whole peak is a couple of art pixels. Reduced motion, and the combat
 * feel toggle, switch all three off.
 *
 * Everything here is pure over a millisecond count — no wall clock, no
 * canvas, no settings singleton — so every curve is unit-testable, and
 * the scene stays the only place that knows what time it is.
 */
import { clamp01, smoothStep01 } from "./animation";
import { cameraDistance, lerpCamera, type Camera } from "./camera";

// --- What the player has switched on -----------------------------------

/**
 * The settings fields the feel reads; Settings satisfies it. Reduced
 * motion is deliberately *not* one of them: whether motion is stilled
 * is a resolved answer rather than a stored field (the player may be
 * deferring to the device), and it is passed in so this function stays
 * unable to get it wrong. See reducedMotionActive in src/settings.
 */
export interface CombatFeelSettings {
  /** The combat-feel master toggle. */
  readonly combatFeel: boolean;
  /** Multiplier on every shake amplitude; 0 stills the shake alone. */
  readonly shakeScale: number;
}

/** Which of the three are live, and how hard the shake is allowed to hit. */
export interface CombatFeel {
  readonly focus: boolean;
  readonly hitPause: boolean;
  readonly shake: boolean;
  readonly shakeScale: number;
}

/**
 * What the camera is allowed to do right now. Reduced motion and the
 * combat-feel toggle each switch off all three on their own; the shake
 * scale then stills the shake by itself without touching the other two.
 */
export function resolveCombatFeel(
  settings: CombatFeelSettings,
  reducedMotion: boolean,
): CombatFeel {
  const on = settings.combatFeel === true && reducedMotion !== true;
  const scale = on ? Math.max(0, settings.shakeScale) : 0;
  return {
    focus: on,
    hitPause: on,
    shake: on && scale > 0,
    shakeScale: scale,
  };
}

// --- Turn focus --------------------------------------------------------

/** Whose turn the camera is framing; the AI's is glided through faster. */
export type TurnPace = "player" | "ai";

/**
 * How long the camera takes to reframe. The player's own turn opens at
 * a readable pace; the AI's is quicker — its turn is something to watch
 * happen, not something to settle into.
 */
export const FOCUS_GLIDE_MS: Readonly<Record<TurnPace, number>> = {
  player: 420,
  ai: 300,
};

/**
 * Screen pixels of travel under which reframing is not worth animating:
 * the camera is already where it is being asked to go (an arena that
 * fits the viewport clamps every target to the same point), so it snaps
 * and no glide is planned at all.
 */
export const FOCUS_SETTLE_PX = 1;

/** A reframing in flight: where from, where to, and over what span. */
export interface CameraGlide {
  readonly from: Camera;
  readonly to: Camera;
  /** Scene-clock ms it started on. */
  readonly startMs: number;
  readonly durationMs: number;
}

/**
 * Plan a reframing from wherever the camera is now — including mid-glide,
 * which is what keeps a second turn starting during the first from
 * cutting. Null when there is nothing to travel.
 */
export function planCameraGlide(
  from: Camera,
  to: Camera,
  startMs: number,
  pace: TurnPace,
): CameraGlide | null {
  if (cameraDistance(from, to) < FOCUS_SETTLE_PX) return null;
  return { from, to, startMs, durationMs: FOCUS_GLIDE_MS[pace] };
}

/**
 * Where the camera is `sceneMs` into a glide: eased at both ends, so it
 * leaves and arrives without a lurch. Clamped, so reading past the end
 * simply gives the destination.
 */
export function glideCameraAt(glide: CameraGlide, sceneMs: number): Camera {
  if (glide.durationMs <= 0) return glide.to;
  const t = clamp01((sceneMs - glide.startMs) / glide.durationMs);
  return lerpCamera(glide.from, glide.to, smoothStep01(t));
}

/** Whether a glide has arrived and can be dropped. */
export function glideDone(glide: CameraGlide, sceneMs: number): boolean {
  return sceneMs - glide.startMs >= glide.durationMs;
}

// --- What a blow is worth ----------------------------------------------

/**
 * How much a landed blow weighs, as the screen reads it. `explosion` is
 * not a blow at all but a blast going off, which shakes without pausing:
 * nothing connected, so there is no contact to hold on.
 */
export const IMPACT_WEIGHTS = [
  "glancing",
  "solid",
  "heavy",
  "critical",
  "explosion",
] as const;

export type ImpactWeight = (typeof IMPACT_WEIGHTS)[number];

/** What one weight is worth in frozen time and in screen travel. */
export interface ImpactFeelSpec {
  /** Ms of scene time to hold on the contact frame. */
  readonly pauseMs: number;
  /** Peak shake travel in screen pixels, before the player's scale. */
  readonly shakePx: number;
  /** Ms the shake decays over; 0 where there is no shake. */
  readonly shakeMs: number;
}

/**
 * Per-weight tuning. The pauses are counted in frames at 60Hz — three
 * for a solid hit, four for a heavy one, seven for a critical — long
 * enough to land as weight, short enough that nobody waits on it. Only
 * the top two weights move the camera at all.
 */
export const IMPACT_FEEL: Readonly<Record<ImpactWeight, ImpactFeelSpec>> = {
  // Armor ate it: the flinch is already shallower, and the camera agrees.
  glancing: { pauseMs: 0, shakePx: 0, shakeMs: 0 },
  // Connected: a held breath, no travel.
  solid: { pauseMs: 50, shakePx: 0, shakeMs: 0 },
  heavy: { pauseMs: 70, shakePx: 2.5, shakeMs: 200 },
  critical: { pauseMs: 110, shakePx: 3.5, shakeMs: 240 },
  // A blast pushes outward and keeps rolling a little longer.
  explosion: { pauseMs: 0, shakePx: 3, shakeMs: 260 },
};

/**
 * Ms of scene time a blow of this weight freezes for. Melee blows pause
 * on contact; a fired round only does when the figure it left was a
 * critical one — a pistol shot connecting at range has nothing to throw
 * its weight into, and pausing on every one of them stutters the fight.
 */
export function hitPauseMs(weight: ImpactWeight, melee: boolean): number {
  const { pauseMs } = IMPACT_FEEL[weight];
  if (weight === "critical") return pauseMs;
  return melee ? pauseMs : 0;
}

/** Peak shake for a weight at the player's scale, capped. */
export function shakeAmplitudePx(weight: ImpactWeight, scale: number): number {
  const amplitude = IMPACT_FEEL[weight].shakePx * Math.max(0, scale);
  return Math.min(MAX_SHAKE_PX, amplitude);
}

// --- Hit-pause ---------------------------------------------------------

/** Longest single freeze, however heavy the blow claims to be. */
export const MAX_PAUSE_MS = 140;

/** One scheduled freeze: a scene time to hold at, and for how long. */
export interface ScenePause {
  /** Scene-clock ms the clock holds at. */
  readonly atMs: number;
  /** Raw ms it holds there for. */
  readonly durationMs: number;
}

/**
 * Every pause the scene clock still has to serve, plus the raw time it
 * has already absorbed. Pauses fully served fold into `settledMs` and
 * drop out of `pending`, so a long fight never walks a growing list.
 */
export interface PauseTimeline {
  readonly settledMs: number;
  /** Ascending by atMs. */
  readonly pending: readonly ScenePause[];
}

/** A clock with nothing owed: scene time is raw time. */
export const NO_PAUSES: PauseTimeline = { settledMs: 0, pending: [] };

/**
 * Schedule a freeze on the beat a blow lands on. Never earlier than the
 * present (`nowMs`), so the clock cannot be asked to step back, and
 * capped at MAX_PAUSE_MS. Two blows landing on the same beat freeze the
 * scene once, for the longer of the two — a volley must read as weight,
 * never as a stall.
 */
export function insertPause(
  timeline: PauseTimeline,
  atMs: number,
  durationMs: number,
  nowMs: number,
): PauseTimeline {
  const ms = Math.min(MAX_PAUSE_MS, durationMs);
  if (!(ms > 0)) return timeline;
  const at = Math.max(nowMs, atMs);
  const pending = [...timeline.pending];
  const index = pending.findIndex((pause) => pause.atMs >= at);
  const existing = index < 0 ? undefined : pending[index];
  if (existing && existing.atMs === at) {
    if (existing.durationMs >= ms) return timeline;
    pending[index] = { atMs: at, durationMs: ms };
    return { settledMs: timeline.settledMs, pending };
  }
  pending.splice(index < 0 ? pending.length : index, 0, {
    atMs: at,
    durationMs: ms,
  });
  return { settledMs: timeline.settledMs, pending };
}

/**
 * The scene time a raw timestamp maps to, and the timeline with
 * everything already served folded away. Scene time runs with raw time,
 * holds at each pause's beat for that pause's duration, and runs on —
 * monotonic and continuous, so no sequence reading it can skip or
 * repeat a frame.
 */
export function advancePauses(
  timeline: PauseTimeline,
  rawMs: number,
): { sceneMs: number; timeline: PauseTimeline } {
  let sceneMs = rawMs - timeline.settledMs;
  let settledMs = timeline.settledMs;
  let served = 0;
  for (const pause of timeline.pending) {
    // Not reached yet — and nothing behind it can be, they are sorted.
    if (sceneMs <= pause.atMs) break;
    const after = sceneMs - pause.durationMs;
    if (after < pause.atMs) {
      // Still holding on this beat.
      sceneMs = pause.atMs;
      break;
    }
    sceneMs = after;
    settledMs += pause.durationMs;
    served++;
  }
  return {
    sceneMs,
    timeline:
      served === 0
        ? timeline
        : { settledMs, pending: timeline.pending.slice(served) },
  };
}

/** The scene time a raw timestamp maps to; the read-only half of the above. */
export function sceneTimeAt(timeline: PauseTimeline, rawMs: number): number {
  return advancePauses(timeline, rawMs).sceneMs;
}

// --- Screen shake ------------------------------------------------------

/**
 * The hardest the camera may ever be thrown, whatever lands at once.
 * Six world-screen pixels is three art pixels at ART_SCALE — enough to
 * feel, far too little to read as unstable.
 */
export const MAX_SHAKE_PX = 6;

/** Full oscillations a shake completes before it has decayed away. */
export const SHAKE_CYCLES = 3;

/** One kick in flight: when it started, how hard, and which way. */
export interface ShakeSource {
  /** Scene-clock ms it starts on — the beat the blow lands. */
  readonly startMs: number;
  readonly durationMs: number;
  readonly amplitudePx: number;
  /** Unit direction it throws the camera along, in screen space. */
  readonly dirX: number;
  readonly dirY: number;
}

export interface ShakeOffset {
  readonly x: number;
  readonly y: number;
}

const NO_SHAKE: ShakeOffset = { x: 0, y: 0 };

/**
 * The direction a blow throws the camera: the attacker's own line,
 * normalized. A blow with no line to read (a self-cast, an aura) pushes
 * along the screen's horizontal, which is the axis the eye forgives.
 */
export function shakeDirection(dx: number, dy: number): ShakeOffset {
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

/**
 * Where one kick has the camera `sceneMs` into the fight: a decaying
 * oscillation along its own direction, zero before it starts and once
 * it is spent. Screen y is compressed 2:1 as everything in iso space
 * is, so the push follows the ground rather than cutting across it.
 * Pure — the same scene time always gives the same offset.
 */
export function shakeOffsetAt(
  source: ShakeSource,
  sceneMs: number,
): ShakeOffset {
  if (source.durationMs <= 0 || source.amplitudePx <= 0) return NO_SHAKE;
  const t = (sceneMs - source.startMs) / source.durationMs;
  if (!(t >= 0) || t >= 1) return NO_SHAKE;
  const decay = (1 - t) * (1 - t);
  const swing = Math.sin(2 * Math.PI * SHAKE_CYCLES * t);
  const px = source.amplitudePx * decay * swing;
  return { x: source.dirX * px, y: (source.dirY * px) / 2 };
}

/**
 * Every kick in flight, summed and then capped: two blows landing
 * together push harder than one, but never past MAX_SHAKE_PX.
 */
export function combinedShakeAt(
  sources: readonly ShakeSource[],
  sceneMs: number,
): ShakeOffset {
  let x = 0;
  let y = 0;
  for (const source of sources) {
    const offset = shakeOffsetAt(source, sceneMs);
    x += offset.x;
    y += offset.y;
  }
  const magnitude = Math.hypot(x, y);
  if (magnitude <= MAX_SHAKE_PX) return { x, y };
  const k = MAX_SHAKE_PX / magnitude;
  return { x: x * k, y: y * k };
}

/** Whether a kick is spent and can be dropped. */
export function shakeFinished(source: ShakeSource, sceneMs: number): boolean {
  return sceneMs - source.startMs >= source.durationMs;
}
