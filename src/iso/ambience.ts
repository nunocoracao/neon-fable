/**
 * What the street says out loud: which world one-shots fire, read off
 * the set pieces the scene is already drawing.
 *
 * Nothing here decides that a train exists or where it is — ./setpiece.ts
 * does, from map content, and this only *listens* to it. A rake that was
 * not on the map last frame and is now has arrived; a vent showing its
 * first burst frame has just let go; a headline that is not the one that
 * was scrolling has turned over. Each of those is an edge, and an edge
 * is a sound.
 *
 * Two things follow from doing it this way. The scene never has to
 * remember to announce anything — it hands over a sample of what it is
 * drawing and gets back a list. And the whole of it is pure over two
 * samples, so every rule below is testable without a canvas, a clock, or
 * an AudioContext.
 *
 * The rain is the exception, and deliberately: it has no edges of its
 * own once it has started, so it is a bed retriggered on a period and
 * splash ticks on a slower one. Both come off the sample's own clock,
 * which means they are as deterministic as the edges are.
 */
import type { SoundEventId } from "../data/sfx";

/** What the scene is drawing this frame, as the ambience reads it. */
export interface AmbienceSample {
  /** The scene's clock, ms. Frozen under reduced motion, which stills it. */
  readonly timeMs: number;
  /** A rake is on the elevated track. */
  readonly train: boolean;
  /** A patrol drone is over the map and within earshot of the player. */
  readonly drone: boolean;
  /** A vent is mid-burst. */
  readonly steam: boolean;
  readonly rain: boolean;
  /**
   * The headline showing on the map's news screens, or null where there
   * is nothing to read. Any change is a board turning over.
   */
  readonly headline: string | null;
}

/**
 * How often the rain bed is retriggered. Slightly under the patch's own
 * length (1.6s), so the swells overlap into one curtain rather than
 * pulsing.
 */
export const RAIN_BED_PERIOD_MS = 1500;

/** How often a drop is heard finding a puddle. */
export const RAIN_SPLASH_PERIOD_MS = 2300;

/** Nothing happening, nothing drawn, nothing said. */
export const QUIET_AMBIENCE: AmbienceSample = {
  timeMs: 0,
  train: false,
  drone: false,
  steam: false,
  rain: false,
  headline: null,
};

/** Whether a period boundary falls in (fromMs, toMs]. */
function crossedPeriod(fromMs: number, toMs: number, periodMs: number): boolean {
  if (!(periodMs > 0) || !(toMs > fromMs)) return false;
  return Math.floor(toMs / periodMs) > Math.floor(fromMs / periodMs);
}

/**
 * The one-shots to fire this frame, in a fixed order — set pieces
 * first, then the weather, then the boards. Deterministic: the same two
 * samples always give the same list.
 *
 * `previous` is null on the first frame of a map, which means an arrival
 * announces nothing: walking into a district mid-downpour should not
 * open with a train, a drone and a burst of steam at once just because
 * all three happen to be on screen.
 */
export function ambienceCues(
  previous: AmbienceSample | null,
  sample: AmbienceSample,
): readonly SoundEventId[] {
  if (previous === null) return [];
  const cues: SoundEventId[] = [];
  if (sample.train && !previous.train) cues.push("world.train.pass");
  if (sample.drone && !previous.drone) cues.push("world.drone.pass");
  if (sample.steam && !previous.steam) cues.push("world.steam.burst");
  if (sample.rain) {
    // A shower starting is heard at once; after that the bed is simply
    // kept up, and the splashes tick under it on their own period.
    if (!previous.rain) cues.push("world.rain.bed");
    else if (
      crossedPeriod(previous.timeMs, sample.timeMs, RAIN_BED_PERIOD_MS)
    ) {
      cues.push("world.rain.bed");
    }
    if (crossedPeriod(previous.timeMs, sample.timeMs, RAIN_SPLASH_PERIOD_MS)) {
      cues.push("world.rain.splash");
    }
  } else if (previous.rain) {
    // The sky turning over is worth one cue; the silence after it says
    // the rest.
    cues.push("ambient.weather.turn");
  }
  if (sample.headline !== null && sample.headline !== previous.headline) {
    cues.push("ambient.news.blip");
  }
  return cues;
}
