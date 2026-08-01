/**
 * The adaptive part of the score: what should be playing, and when the
 * change is allowed to happen. Every function here is pure — a scene
 * (where you are, what you are doing, what hour it is) in, an
 * arrangement and a crossfade plan out — so the whole of the music's
 * behaviour is testable and the bus is left with nothing but bookkeeping.
 *
 * Two rules do most of the work:
 *
 * 1. The district's `base` layer is in every arrangement, exploration
 *    and combat alike. Fights do not switch tracks; they add and remove
 *    stems over a district you never stop hearing.
 * 2. A change only ever starts on a bar line of the grid that is already
 *    playing. `nextBarTime` is that arithmetic and nothing else.
 */
import {
  DAY_PHASE_MUSIC,
  MUSIC_THEMES,
  themeLayer,
  type MusicLayerRole,
  type MusicPhaseParams,
  type MusicTheme,
} from "../data/music";
import {
  DEFAULT_DAY_PHASE,
  DEFAULT_MUSIC_THEME,
  type DayPhaseId,
  type IsoMap,
  type MusicThemeId,
} from "../iso/tilemap";
import { voiceSpec, type VoiceSpec } from "./music";

/** What the score is being asked to underscore. */
export type MusicMode = "explore" | "combat" | "boss";

export const MUSIC_MODES: readonly MusicMode[] = ["explore", "combat", "boss"];

/** Where the player is, what they are doing, and at what hour. */
export interface MusicScene {
  themeId: MusicThemeId;
  mode: MusicMode;
  dayPhase: DayPhaseId;
}

export function musicScene(
  themeId: MusicThemeId,
  mode: MusicMode = "explore",
  dayPhase: DayPhaseId = DEFAULT_DAY_PHASE,
): MusicScene {
  return { themeId, mode, dayPhase };
}

export function sceneEquals(
  a: MusicScene | null,
  b: MusicScene | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.themeId === b.themeId && a.mode === b.mode && a.dayPhase === b.dayPhase
  );
}

/** The theme a map plays; every map in ./data/maps.ts declares one. */
export function themeForMap(map: IsoMap | null | undefined): MusicThemeId {
  return map?.music ?? DEFAULT_MUSIC_THEME;
}

export function getTheme(themeId: MusicThemeId): MusicTheme {
  return MUSIC_THEMES[themeId];
}

export function phaseParams(dayPhase: DayPhaseId): MusicPhaseParams {
  return DAY_PHASE_MUSIC[dayPhase] ?? DAY_PHASE_MUSIC[DEFAULT_DAY_PHASE];
}

// --- Layer selection ---------------------------------------------------

/**
 * Which stems each mode mixes. `base` leads every row on purpose: it is
 * the district, and the district does not stop for a fight. Combat swaps
 * the melody for the theme's own tension writing and lays the shared
 * drive over it; a boss adds one more layer on top of that rather than
 * replacing anything, so the escalation reads as weight arriving.
 */
export const MODE_LAYERS: Record<MusicMode, readonly MusicLayerRole[]> = {
  explore: ["base", "melodic"],
  combat: ["base", "tension", "rhythm"],
  boss: ["base", "tension", "rhythm", "boss"],
};

export function selectLayers(mode: MusicMode): readonly MusicLayerRole[] {
  return MODE_LAYERS[mode] ?? MODE_LAYERS.explore;
}

/** The set of stems, in mix order, that a scene should have running. */
export interface Arrangement {
  themeId: MusicThemeId;
  dayPhase: DayPhaseId;
  mode: MusicMode;
  roles: readonly MusicLayerRole[];
}

export function arrangementFor(scene: MusicScene): Arrangement {
  return {
    themeId: scene.themeId,
    dayPhase: scene.dayPhase,
    mode: scene.mode,
    roles: selectLayers(scene.mode),
  };
}

/**
 * The adapter channel a stem plays on. Theme and hour are in the key
 * because both change the notes: two arrangements that share a key for
 * a role share the running voice, which is exactly when a stem should
 * carry through a transition untouched instead of being refaded.
 */
export function layerKey(
  themeId: MusicThemeId,
  dayPhase: DayPhaseId,
  role: MusicLayerRole,
): string {
  return `${themeId}:${dayPhase}:${role}`;
}

/** The running voice for one stem of an arrangement. */
export function arrangementVoice(
  arrangement: Arrangement,
  role: MusicLayerRole,
): VoiceSpec {
  const theme = getTheme(arrangement.themeId);
  return voiceSpec(
    layerKey(arrangement.themeId, arrangement.dayPhase, role),
    themeLayer(theme, role),
    theme.secondsPerBar,
    phaseParams(arrangement.dayPhase),
  );
}

// --- Bar arithmetic ----------------------------------------------------

/** Seconds per bar of an arrangement, after the hour's tempo scale. */
export function barSeconds(arrangement: Arrangement): number {
  const theme = getTheme(arrangement.themeId);
  return theme.secondsPerBar * phaseParams(arrangement.dayPhase).tempoScale;
}

/**
 * The first bar line at or after `at`, on the grid that started at
 * `origin`. Times before the origin land on the origin itself — the grid
 * has not begun, so its first bar line is where it begins.
 */
export function nextBarTime(
  origin: number,
  barLength: number,
  at: number,
): number {
  if (!(barLength > 0) || !Number.isFinite(barLength)) return at;
  if (at <= origin) return origin;
  const bars = Math.ceil((at - origin) / barLength);
  const time = origin + bars * barLength;
  // Guard the floating-point case where `at` is a hair past a bar line
  // and ceil rounds it up a whole bar anyway.
  const previous = origin + (bars - 1) * barLength;
  return previous >= at - 1e-9 ? previous : time;
}

// --- Transitions -------------------------------------------------------

/**
 * What changes, and when. `hold` is the point of the whole system: when
 * only the mode moved, the district's stems keep their voices and their
 * place in the bar, and only the stems that actually differ fade.
 */
export interface CrossfadePlan {
  /** Absolute time the fades start — always a bar line while music runs. */
  at: number;
  fadeSeconds: number;
  /** Stems already running that stay, untouched. */
  hold: readonly MusicLayerRole[];
  /** Stems to bring up from silence, starting at `at`. */
  fadeIn: readonly MusicLayerRole[];
  /** Stems to take down, from the outgoing arrangement. */
  fadeOut: readonly MusicLayerRole[];
  /**
   * Bar-grid origin the incoming arrangement runs on: the old one when
   * anything was held (the grid never moved), otherwise `at`.
   */
  origin: number;
}

/**
 * Plans the move from one arrangement to another.
 *
 * `now + lead` is the earliest the fade may start — the scheduler has
 * already committed notes that far ahead — and the fade then waits for
 * the next bar line of the *outgoing* grid. With nothing playing there
 * is no grid to wait for and the music starts at `now + lead`.
 */
export function planCrossfade(options: {
  from: Arrangement | null;
  to: Arrangement | null;
  /** Bar-grid origin the outgoing arrangement is running on. */
  origin: number;
  now: number;
  fadeSeconds: number;
  /** Seconds of already-committed schedule the fade must clear. */
  lead: number;
}): CrossfadePlan {
  const { from, to, origin, now, fadeSeconds, lead } = options;
  const earliest = now + lead;
  const at =
    from === null
      ? earliest
      : nextBarTime(origin, barSeconds(from), earliest);

  const fromRoles = from?.roles ?? [];
  const toRoles = to?.roles ?? [];
  // Voices only carry over when their notes are unchanged: same theme,
  // same hour. A different district — or the same one at a different
  // hour — is different music, and crosses in full.
  const sameVoices =
    from !== null &&
    to !== null &&
    from.themeId === to.themeId &&
    from.dayPhase === to.dayPhase;

  const hold = sameVoices ? toRoles.filter((r) => fromRoles.includes(r)) : [];
  const fadeIn = toRoles.filter((r) => !hold.includes(r));
  const fadeOut = fromRoles.filter((r) => !hold.includes(r));

  return {
    at,
    fadeSeconds,
    hold,
    fadeIn,
    fadeOut,
    origin: hold.length > 0 ? origin : at,
  };
}
