import type { GameState } from "../state/gameState";
import { checkRequirements } from "./requirements";
import type { Requirement } from "./types";

/**
 * Act interludes: the short vignette that plays at an act boundary and
 * reads back what the chapter just set moving.
 *
 * Entirely derived presentation. An interlude has no state of its own
 * beyond a seen-flag on GameState.flags, and its beats are selected
 * from the flags the act actually wrote — content lives in
 * src/data/interludes.ts, this module is the pure selection logic the
 * overlay renders from.
 *
 * ## How a beat is chosen
 *
 * A strand is one thing worth saying (what happened to the Undertow,
 * where the Court stands now). Its variants are read top-down and the
 * first whose requirements pass wins, exactly like an epilogue thread —
 * so **authored order inside a strand is variant priority**, most
 * specific first.
 *
 * A strand nothing matched falls back to its neutral connective line if
 * it has one, and is dropped if it does not. That is what keeps
 * composition total: an unplayed side chain leaves no gap, an
 * unrecognised flag combination still reads as a sentence, and a run
 * that somehow matched nothing at all still gets MIN_INTERLUDE_BEATS
 * lines out of the interlude's own connective pool.
 */

/** One authored line, and what has to be true for it to be the one. */
export interface InterludeVariant {
  id: string;
  text: string;
  /** All must pass against the state at the boundary; omit for a catch-all. */
  requires?: Requirement[];
}

/** One slot in the vignette: at most one of its variants is spoken. */
export interface InterludeStrand {
  id: string;
  variants: InterludeVariant[];
  /**
   * Neutral line for a run none of the variants matched. Omit for a
   * strand that should simply go unmentioned when nothing touched it.
   */
  fallback?: string;
}

/** How the vignette is dressed: a district's still, tinted. */
export interface InterludeBackdrop {
  /** Map whose name captions the card; unknown ids caption nothing. */
  mapId: string;
  tone: "cyan" | "amber" | "magenta";
}

/** One act boundary's worth of content. */
export interface Interlude {
  id: string;
  /**
   * The flag whose truth means this boundary has been crossed — the act
   * completion the chapter's last choice wrote.
   */
  afterFlag: string;
  /** Small caps line over the title, e.g. "Interlude — Act One". */
  kicker: string;
  title: string;
  backdrop: InterludeBackdrop;
  strands: InterludeStrand[];
  /**
   * Neutral connective lines, in order, used to pad a vignette that
   * came out short. Author at least MIN_INTERLUDE_BEATS of them: they
   * are the floor under every flag combination nobody predicted.
   */
  connective: string[];
}

/** A selected line, ready to render. */
export interface InterludeBeat {
  /** Stable id of what was chosen — variant id, fallback, or filler. */
  id: string;
  text: string;
}

/** An interlude resolved against one run: what the screen shows. */
export interface ComposedInterlude {
  id: string;
  kicker: string;
  title: string;
  backdrop: InterludeBackdrop;
  beats: InterludeBeat[];
}

/** Fewest beats a vignette may play; short runs are padded to it. */
export const MIN_INTERLUDE_BEATS = 3;

/** Most beats a vignette may play; a busy run is trimmed to it. */
export const MAX_INTERLUDE_BEATS = 5;

/** Flag recording that an interlude has played once, naturally. */
export function interludeSeenFlag(interludeId: string): string {
  return `interlude-seen:${interludeId}`;
}

/** Whether the run has crossed this boundary at all. */
export function interludeReached(
  state: GameState,
  interlude: Interlude,
): boolean {
  return state.flags[interlude.afterFlag] === true;
}

/** Whether this run has already been shown this interlude. */
export function interludeSeen(
  state: GameState,
  interlude: Interlude,
): boolean {
  return state.flags[interludeSeenFlag(interlude.id)] === true;
}

/**
 * The interlude owed to this run right now: the first, in authored
 * order, whose boundary is crossed and which has not played yet. Null
 * when the run owes none — which is the usual answer, on every step
 * that is not an act boundary.
 */
export function pendingInterlude(
  state: GameState,
  interludes: readonly Interlude[],
): Interlude | null {
  return (
    interludes.find(
      (interlude) =>
        interludeReached(state, interlude) && !interludeSeen(state, interlude),
    ) ?? null
  );
}

/**
 * The most recent boundary this run has crossed, seen or not — the
 * "Previously" the save screen offers to replay. Derived on the spot
 * from the run's own flags; nothing about a replay is recorded.
 */
export function latestInterlude(
  state: GameState,
  interludes: readonly Interlude[],
): Interlude | null {
  let latest: Interlude | null = null;
  for (const interlude of interludes) {
    if (interludeReached(state, interlude)) latest = interlude;
  }
  return latest;
}

/**
 * Records an interlude as played. Pure: returns a new state, and the
 * same state when the flag is already set, so a double call cannot
 * churn the save.
 */
export function markInterludeSeen(
  state: GameState,
  interlude: Interlude,
): GameState {
  if (interludeSeen(state, interlude)) return state;
  return {
    ...state,
    flags: { ...state.flags, [interludeSeenFlag(interlude.id)]: true },
  };
}

/** The line one strand has to say about this run, if it has one. */
export function selectStrandBeat(
  state: GameState,
  strand: InterludeStrand,
): InterludeBeat | null {
  const variant = strand.variants.find((candidate) =>
    checkRequirements(state, candidate.requires),
  );
  if (variant) return { id: variant.id, text: variant.text };
  if (strand.fallback === undefined) return null;
  return { id: `${strand.id}:fallback`, text: strand.fallback };
}

/** Every strand's line, in authored order, skipping the silent ones. */
export function selectBeats(
  state: GameState,
  interlude: Interlude,
): InterludeBeat[] {
  return interlude.strands
    .map((strand) => selectStrandBeat(state, strand))
    .filter((beat): beat is InterludeBeat => beat !== null);
}

/**
 * The vignette as it plays: the strands that had something to say,
 * trimmed to MAX_INTERLUDE_BEATS and, if the run came out quieter than
 * that, padded from the interlude's connective pool to
 * MIN_INTERLUDE_BEATS.
 *
 * Total by construction — a state with no flags at all still composes,
 * which is the whole point of the connective pool. It can only fall
 * short of the minimum if an interlude was authored with too few
 * connective lines, and a content test fails on that rather than
 * letting a thin screen ship.
 */
export function composeInterlude(
  state: GameState,
  interlude: Interlude,
): ComposedInterlude {
  const beats = selectBeats(state, interlude).slice(0, MAX_INTERLUDE_BEATS);
  for (
    let index = 0;
    beats.length < MIN_INTERLUDE_BEATS && index < interlude.connective.length;
    index += 1
  ) {
    beats.push({
      id: `${interlude.id}:connective:${index}`,
      text: interlude.connective[index]!,
    });
  }
  return {
    id: interlude.id,
    kicker: interlude.kicker,
    title: interlude.title,
    backdrop: interlude.backdrop,
    beats,
  };
}
