/**
 * What the public screens are saying.
 *
 * Two pure steps, and nothing else in the feature: gate the authored
 * headline pool against the live world conditions, then put the
 * survivors in a seeded order. The iso layer takes the finished list
 * and works out which line is showing and how far it has scrolled (see
 * src/iso/ticker.ts) — this module never sees a clock.
 *
 * ## Why the order is seeded rather than random
 *
 * A screen must say the same thing at the same moment every time the
 * same run stands in front of it: the ticker is scenery, and scenery
 * that reshuffles when you look away reads as broken. Seeding on the
 * screen's own id also means the billboard over the plaza and the sign
 * on the north wall are running different lines at any instant, which
 * is what stops two screens in shot from reading as one screen.
 */
import {
  NEWS_HEADLINES,
  type Headline,
  type NewsChannelId,
} from "../data/world";
import { createRng, hashSeed, nextInt } from "../state/rng";
import { conditionsAllow, type WorldState } from "./state";

/** The headlines a channel carries in this state of the city. */
export function eligibleHeadlines(
  channel: NewsChannelId,
  world: WorldState,
): Headline[] {
  return NEWS_HEADLINES.filter(
    (headline) => headline.channel === channel && conditionsAllow(world, headline),
  );
}

/**
 * A deterministic shuffle: same pool and same seed, same order, every
 * time. Fisher-Yates over the project's own seeded RNG, so nothing here
 * touches Math.random and a screen's rotation is replayable.
 */
export function rotateHeadlines<T>(pool: readonly T[], seed: number): T[] {
  const order = [...pool];
  let rng = createRng(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const draw = nextInt(rng, 0, i);
    rng = draw.state;
    const j = draw.value;
    const a = order[i];
    const b = order[j];
    if (a !== undefined && b !== undefined) {
      order[i] = b;
      order[j] = a;
    }
  }
  return order;
}

/** The seed a screen rotates on: its map and its own id, and nothing else. */
export function screenSeed(mapId: string, screenId: string): number {
  return hashSeed(`${mapId}:news:${screenId}`);
}

/**
 * The finished running order for one screen: everything its channel
 * carries right now, in this screen's own seeded rotation.
 *
 * An empty result is possible only for a channel whose whole pool is
 * gated, which content lint forbids — every channel keeps ungated
 * filler so a screen is never blank.
 */
export function newsStrip(
  mapId: string,
  screenId: string,
  channel: NewsChannelId,
  world: WorldState,
): string[] {
  return rotateHeadlines(
    eligibleHeadlines(channel, world),
    screenSeed(mapId, screenId),
  ).map((headline) => headline.text);
}
