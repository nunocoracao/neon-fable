/**
 * The bark scheduler: who gets to say something, which line it is, and
 * how long it hangs over their head. Pure over (schedule, tick) —
 * every clock reading and every die roll arrives as an argument, so a
 * street replays line for line and the whole thing is testable without
 * a canvas, a DOM, or a wall clock.
 *
 * ## The shape of a tick
 *
 * 1. Retire what is over: chips past their life, cues nobody could
 *    answer in time.
 * 2. Stop if the scene is already full (MAX_LIVE_BARKS) or the last
 *    line went up moments ago (GLOBAL_COOLDOWN_MS). A street that
 *    talks constantly is noise; the cap and the floor between lines are
 *    what keep it a murmur.
 * 3. Take the oldest cue that anybody present can answer — a district
 *    arrival, the rain starting, the player limping out of a fight —
 *    and failing that, offer the ambient `idle` pool.
 * 4. Filter the (speaker, line) pairs down to the eligible ones, draw
 *    one with a single seeded roll weighted by the content, and put it
 *    up.
 *
 * ## The three cooldowns
 *
 * - Per speaker (SPEAKER_COOLDOWN_MS): nobody says two things in a
 *   row, and one speaker never has two chips at once.
 * - Scene-wide (GLOBAL_COOLDOWN_MS): a floor between any two lines,
 *   whoever said them.
 * - Per line (REPEAT_COOLDOWN_MS): the same sentence does not come
 *   round again while the player still remembers it.
 *
 * ## What is not here
 *
 * Nothing in this module reads or writes GameState — a bark is
 * decoration and changes nothing. It only *asks* GameState questions,
 * through the same requirement vocabulary dialogue choices use.
 */
import { barks as defaultCatalog, type Bark, type BarkTrigger } from "../data/barks";
import type { SceneSpeakerKind } from "../iso/events";
import type { DayPhaseId, WeatherId } from "../iso/tilemap";
import { createRng, hashSeed, nextFloat, type RngState } from "../state/rng";
import type { GameState } from "../state/gameState";
import { checkRequirements } from "./requirements";

/** Milliseconds a chip stays up, from the moment it appears. */
export const BARK_LIFE_MS = 3400;

/** Milliseconds of that life spent fading in, and fading out again. */
export const BARK_FADE_IN_MS = 140;
export const BARK_FADE_OUT_MS = 600;

/** Chips visible at once, scene-wide. */
export const MAX_LIVE_BARKS = 3;

/** Floor between any two lines, whoever says them. */
export const GLOBAL_COOLDOWN_MS = 2600;

/** How long one speaker stays quiet after saying something. */
export const SPEAKER_COOLDOWN_MS = 15_000;

/** How long before the same line may be heard again. */
export const REPEAT_COOLDOWN_MS = 60_000;

/** Tiles a passer-by can be heard from. */
export const PEDESTRIAN_BARK_RANGE = 9;

/** Tiles a named person can be heard from — closer, and on purpose. */
export const NPC_BARK_RANGE = 4;

/**
 * How long the player has to have stood still before a named person
 * says anything. Somebody you are walking towards should be silent
 * until you have arrived and stopped.
 */
export const NPC_LINGER_MS = 3000;

/**
 * How long a cue waits for somebody able to answer it before lapsing.
 * Deliberately longer than SPEAKER_COOLDOWN_MS: walking into a rainy
 * district cues both the arrival and the weather, and the companion who
 * answers the first has to be allowed to come off cooldown and answer
 * the second — a beat later, which is how somebody actually talks.
 */
export const CUE_PATIENCE_MS = 20_000;

/**
 * Fraction of maximum HP at or below which the player reads as badly
 * hurt — what the `wounded` cue is asked about when a scene opens after
 * a fight has gone through them.
 */
export const WOUNDED_BARK_RATIO = 0.4;

/** Whether the player is hurt enough for somebody to mention it. */
export function isWounded(state: GameState): boolean {
  const { hp, derived } = state.player;
  if (derived.maxHp <= 0) return false;
  return hp > 0 && hp / derived.maxHp <= WOUNDED_BARK_RATIO;
}

/** A figure that could be given a line this tick. */
export interface BarkSpeaker {
  /** Unique within the scene. */
  id: string;
  kind: SceneSpeakerKind;
  /** Interactable id or companion id; null for a passer-by. */
  refId: string | null;
  /** Ambient zone a pedestrian belongs to; null for everyone else. */
  zoneId: string | null;
  /** Tiles between them and the player. */
  distance: number;
}

/** What the world looks like this tick, as far as content gating goes. */
export interface BarkContext {
  mapId: string;
  weather: WeatherId;
  dayPhase: DayPhaseId;
}

/** A line currently up over somebody's head. */
export interface LiveBark {
  speakerId: string;
  barkId: string;
  text: string;
  /** Scene-clock milliseconds it went up on, and comes down on. */
  startedAt: number;
  endsAt: number;
}

/**
 * An event waiting for somebody able to answer it. `cuedAt` is null
 * until the first tick that sees it — the shell cues an arrival before
 * the scene's clock has ticked at all, so the schedule stamps it.
 */
export interface PendingCue {
  trigger: BarkTrigger;
  cuedAt: number | null;
}

/** Everything the scheduler carries between ticks. */
export interface BarkSchedule {
  live: readonly LiveBark[];
  cues: readonly PendingCue[];
  /** Scene-clock ms each speaker last said something. */
  lastBySpeaker: Readonly<Record<string, number>>;
  /** Scene-clock ms each line was last heard. */
  lastByBark: Readonly<Record<string, number>>;
  /** Scene-clock ms of the last line, whoever said it; null for none yet. */
  lastAt: number | null;
  rng: RngState;
}

/** One offer: the world, who is standing in it, and what time it is. */
export interface BarkTick {
  state: GameState;
  context: BarkContext;
  speakers: readonly BarkSpeaker[];
  /** The scene's animation clock, in milliseconds. */
  now: number;
  /** Milliseconds the player has stood still. */
  lingerMs: number;
  /** Content override; defaults to the shipped catalog. */
  catalog?: readonly Bark[];
}

/** A line matched to somebody able to say it. */
export interface BarkCandidate {
  speaker: BarkSpeaker;
  bark: Bark;
}

/**
 * A fresh schedule. The seed is what makes a street replayable: the
 * same map, entered the same way, hears the same lines in the same
 * order.
 */
export function createBarkSchedule(seed: number | string): BarkSchedule {
  return {
    live: [],
    cues: [],
    lastBySpeaker: {},
    lastByBark: {},
    lastAt: null,
    rng: createRng(typeof seed === "number" ? seed : hashSeed(seed)),
  };
}

/** True when `last` is long enough ago (never having happened counts). */
function ready(last: number | undefined | null, now: number, cooldown: number): boolean {
  return last == null || now - last >= cooldown;
}

/**
 * Queue an event for the next tick to answer. Cueing is deliberately
 * not the same as speaking: the companion who would answer might be
 * mid-line, or benched entirely, so the cue waits its CUE_PATIENCE_MS
 * and then gives up rather than interrupting or piling up.
 */
export function cueBark(schedule: BarkSchedule, trigger: BarkTrigger): BarkSchedule {
  // One of each kind waiting is plenty — walking in during a downpour
  // should not owe the player two identical remarks.
  if (schedule.cues.some((cue) => cue.trigger === trigger)) return schedule;
  return { ...schedule, cues: [...schedule.cues, { trigger, cuedAt: null }] };
}

/** Drop chips whose life is over and cues nobody answered in time. */
export function expireBarks(schedule: BarkSchedule, now: number): BarkSchedule {
  const live = schedule.live.filter((bark) => bark.endsAt > now);
  const cues = schedule.cues
    .map((cue) => (cue.cuedAt === null ? { ...cue, cuedAt: now } : cue))
    .filter((cue) => now - (cue.cuedAt ?? now) < CUE_PATIENCE_MS);
  const sameLive = live.length === schedule.live.length;
  const sameCues =
    cues.length === schedule.cues.length &&
    cues.every((cue, i) => cue.cuedAt === schedule.cues[i]?.cuedAt);
  if (sameLive && sameCues) return schedule;
  return { ...schedule, live, cues };
}

/** True when the district, zone, sky, and hour all allow this line. */
function matchesScene(bark: Bark, context: BarkContext, speaker: BarkSpeaker): boolean {
  if (bark.mapIds && !bark.mapIds.includes(context.mapId)) return false;
  if (bark.zoneIds && !bark.zoneIds.includes(speaker.zoneId ?? "")) return false;
  if (bark.weather && bark.weather !== context.weather) return false;
  if (bark.dayPhase && bark.dayPhase !== context.dayPhase) return false;
  return true;
}

/**
 * Whether this figure is close enough — and the player settled enough —
 * to be worth hearing. A passer-by carries across the street; a named
 * person waits until you have stopped beside them.
 */
export function canHear(speaker: BarkSpeaker, lingerMs: number): boolean {
  switch (speaker.kind) {
    case "pedestrian":
      return speaker.distance <= PEDESTRIAN_BARK_RANGE;
    case "npc":
      return speaker.distance <= NPC_BARK_RANGE && lingerMs >= NPC_LINGER_MS;
    case "companion":
      // They are walking with you. Distance is never the question.
      return true;
  }
}

/**
 * Every (speaker, line) pair that could go up right now for one
 * trigger, in catalog order — deterministic, so the seeded draw below
 * is the only thing deciding anything.
 */
export function eligibleBarks(
  schedule: BarkSchedule,
  tick: BarkTick,
  trigger: BarkTrigger,
): BarkCandidate[] {
  const catalog = tick.catalog ?? defaultCatalog;
  const { now, context, state, lingerMs } = tick;
  const speaking = new Set(schedule.live.map((live) => live.speakerId));

  const speakers = tick.speakers.filter(
    (speaker) =>
      !speaking.has(speaker.id) &&
      canHear(speaker, lingerMs) &&
      ready(schedule.lastBySpeaker[speaker.id], now, SPEAKER_COOLDOWN_MS),
  );
  if (speakers.length === 0) return [];

  const candidates: BarkCandidate[] = [];
  for (const bark of catalog) {
    if (bark.trigger !== trigger) continue;
    if (!ready(schedule.lastByBark[bark.id], now, REPEAT_COOLDOWN_MS)) continue;
    // The story gate is the most expensive question, so it is asked
    // once per line rather than once per pair.
    if (!checkRequirements(state, bark.requirements)) continue;
    for (const speaker of speakers) {
      if (speaker.kind !== bark.speaker) continue;
      if (bark.speakerId && bark.speakerId !== speaker.refId) continue;
      if (!matchesScene(bark, context, speaker)) continue;
      candidates.push({ speaker, bark });
    }
  }
  return candidates;
}

/**
 * Draw one candidate, weighted by the content's own odds, with a single
 * roll. Weights below 1 are floored at 0 rather than rejected — bad
 * data quietly stops being picked instead of skewing the draw.
 */
export function pickBark(
  candidates: readonly BarkCandidate[],
  rng: RngState,
): { candidate: BarkCandidate | null; rng: RngState } {
  const weights = candidates.map((c) => Math.max(0, c.bark.weight ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const roll = nextFloat(rng);
  if (total <= 0) return { candidate: null, rng: roll.state };
  let cut = roll.value * total;
  for (let i = 0; i < candidates.length; i++) {
    cut -= weights[i] ?? 0;
    if (cut < 0) {
      return { candidate: candidates[i] ?? null, rng: roll.state };
    }
  }
  // Floating-point tail: the last positive-weight candidate wins.
  const last = candidates[candidates.length - 1] ?? null;
  return { candidate: last, rng: roll.state };
}

/** Put a chosen line up over its speaker's head. */
function speak(
  schedule: BarkSchedule,
  candidate: BarkCandidate,
  now: number,
  rng: RngState,
): BarkSchedule {
  const { speaker, bark } = candidate;
  return {
    live: [
      ...schedule.live,
      {
        speakerId: speaker.id,
        barkId: bark.id,
        text: bark.text,
        startedAt: now,
        endsAt: now + BARK_LIFE_MS,
      },
    ],
    cues: schedule.cues,
    lastBySpeaker: { ...schedule.lastBySpeaker, [speaker.id]: now },
    lastByBark: { ...schedule.lastByBark, [bark.id]: now },
    lastAt: now,
    rng,
  };
}

/**
 * One offer. Returns the schedule unchanged (bar expiries) whenever
 * nothing should be said — the scene is full, the last line is too
 * recent, or nobody present has anything eligible to say.
 */
export function stepBarks(schedule: BarkSchedule, tick: BarkTick): BarkSchedule {
  const current = expireBarks(schedule, tick.now);
  if (current.live.length >= MAX_LIVE_BARKS) return current;
  if (!ready(current.lastAt, tick.now, GLOBAL_COOLDOWN_MS)) return current;

  // Cues first, oldest first: an event nobody can answer is left
  // queued (it may still find a speaker) and the ambient pool is tried
  // in the same tick, so a stuck cue never mutes the street.
  for (const cue of current.cues) {
    const candidates = eligibleBarks(current, tick, cue.trigger);
    if (candidates.length === 0) continue;
    const { candidate, rng } = pickBark(candidates, current.rng);
    if (!candidate) continue;
    const spoken = speak(current, candidate, tick.now, rng);
    return { ...spoken, cues: current.cues.filter((other) => other !== cue) };
  }

  const idle = eligibleBarks(current, tick, "idle");
  if (idle.length === 0) return current;
  const { candidate, rng } = pickBark(idle, current.rng);
  if (!candidate) return { ...current, rng };
  return speak(current, candidate, tick.now, rng);
}

/** Take every chip down at once, keeping the cooldowns already earned. */
export function silenceBarks(schedule: BarkSchedule): BarkSchedule {
  if (schedule.live.length === 0 && schedule.cues.length === 0) return schedule;
  return { ...schedule, live: [], cues: [] };
}

/**
 * How visible a chip is `elapsedMs` after it went up: a quick fade in,
 * a long hold, and a fade out over the tail of its life. Null once it
 * is over (and before it is due), which is the same "nothing to draw"
 * answer the combat popups give.
 *
 * Reduced motion keeps the chip at full strength for its whole life and
 * cuts it — the words are the content, and a fade is the only thing
 * being withheld.
 */
export function barkAlphaAt(
  elapsedMs: number,
  reducedMotion = false,
  lifeMs: number = BARK_LIFE_MS,
): number | null {
  if (elapsedMs < 0 || elapsedMs >= lifeMs) return null;
  if (reducedMotion) return 1;
  if (elapsedMs < BARK_FADE_IN_MS) return elapsedMs / BARK_FADE_IN_MS;
  const remaining = lifeMs - elapsedMs;
  if (remaining < BARK_FADE_OUT_MS) return remaining / BARK_FADE_OUT_MS;
  return 1;
}
