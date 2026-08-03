/**
 * The contextual-hint rules: which chip is offered, which one wins when
 * two want the screen, and what the save remembers about it. Pure over
 * (queue, flags) — no clock, no DOM, no settings lookup. The thin DOM
 * layer is src/ui/hintLayer.ts; the copy is src/data/hints.ts.
 *
 * ## Two halves, deliberately separate
 *
 * - **The queue** is a scene's worth of state: what is waiting, what is
 *   on screen, and how much of this scene's budget has been spent. It
 *   is thrown away with the screen and is never serialized.
 * - **The flags** are the run's memory: `hint:<id>` on GameState.flags,
 *   which is what makes a hint once-only across saves, reloads, and
 *   whatever the player does in between. They ride the save because
 *   "have I been told this" is a fact about the playthrough, not about
 *   the device — a save carried to another machine has still been told.
 *
 * The queue never writes flags and the flags never gate the queue's
 * shape; the caller joins them (see cueHints, which takes the flags as
 * a read-only argument, and showHint, which returns the id to mark).
 *
 * ## One chip at a time, and never a backlog
 *
 * `active` is a single id, not a list: a stack of tutorial boxes over a
 * fight is exactly the wall this system exists to avoid. Anything cued
 * while a chip is up waits its turn, and a scene-level budget
 * (`limit`) stops even the waiting from turning into a queue the player
 * has to click through — the first fight teaches two things and the
 * next fight teaches the rest.
 */
import {
  COMBAT_HINT_BUDGET,
  getHint,
  hints as defaultCatalog,
  hintsFor,
  WIZARD_STEP_HELP,
  type Hint,
  type HintTrigger,
} from "../data/hints";
import type { WizardStep } from "../character/wizard";
import type { MetaProgress } from "../state/meta";
import type { FlagMap } from "../state/flags";

export { COMBAT_HINT_BUDGET };
export type { Hint, HintTrigger };

/** Flag-key prefix for "this hint has been shown"; one key per hint. */
export const HINT_FLAG_PREFIX = "hint:";

/** The save flag that remembers one hint. */
export function hintFlagKey(hintId: string): string {
  return `${HINT_FLAG_PREFIX}${hintId}`;
}

/** Whether this run has already been shown a hint. */
export function hintSeen(flags: FlagMap, hintId: string): boolean {
  return flags[hintFlagKey(hintId)] === true;
}

/** The flags with one hint marked as shown. Pure; never mutates. */
export function markHintSeen(flags: FlagMap, hintId: string): FlagMap {
  if (hintSeen(flags, hintId)) return flags;
  return { ...flags, [hintFlagKey(hintId)]: true };
}

/**
 * The flags with one hint *un*-marked — the other half of marking on
 * show. A chip that went up and was covered by a panel in the same beat
 * was never actually read, and recording it would spend the one chance
 * that hint gets. See pauseHints, which is the only caller.
 */
export function forgetHint(flags: FlagMap, hintId: string): FlagMap {
  if (!hintSeen(flags, hintId)) return flags;
  const next = { ...flags };
  delete next[hintFlagKey(hintId)];
  return next;
}

/** Every hint id this run has been shown, in flag order. */
export function seenHintIds(flags: FlagMap): string[] {
  return Object.keys(flags)
    .filter((key) => key.startsWith(HINT_FLAG_PREFIX) && flags[key] === true)
    .map((key) => key.slice(HINT_FLAG_PREFIX.length));
}

/**
 * The flags with every hint forgotten — what the "reset hints" control
 * writes. Only the hint keys go; anything else the run has recorded is
 * left exactly as it was, which is why this deletes by prefix rather
 * than rebuilding the map from a whitelist.
 */
export function resetHintFlags(flags: FlagMap): FlagMap {
  const next: FlagMap = {};
  for (const [key, value] of Object.entries(flags)) {
    if (key.startsWith(HINT_FLAG_PREFIX)) continue;
    next[key] = value;
  }
  return next;
}

/** A scene's hint state. Ephemeral: never saved, never migrated. */
export interface HintQueue {
  /** Ids waiting for the screen, in cue order. */
  pending: readonly string[];
  /** The one id on screen, or null when nothing is up. */
  active: string | null;
  /** Chips this scene has already put up, against `limit`. */
  shown: number;
  /**
   * Chips this scene may put up at all. Infinity on the map (where
   * hints arrive minutes apart anyway); COMBAT_HINT_BUDGET in a fight,
   * which is what spreads the action-bar tour over the first few.
   */
  limit: number;
}

export function createHintQueue(limit: number = Number.POSITIVE_INFINITY): HintQueue {
  return { pending: [], active: null, shown: 0, limit };
}

/** True when this queue has spent everything the scene allows it. */
export function budgetSpent(queue: HintQueue): boolean {
  return queue.shown >= queue.limit;
}

/**
 * Queue every unseen hint a trigger owns. Ids already waiting, already
 * on screen, or already recorded in the flags are skipped — which is
 * the whole of "fires once", and is why re-cueing the same trigger
 * every frame is safe and cheap.
 *
 * Note this does *not* consult the budget: a hint cued while the fight
 * is out of budget stays queued for the fight after it rather than
 * being dropped on the floor.
 */
export function cueHints(
  queue: HintQueue,
  trigger: HintTrigger,
  flags: FlagMap,
  catalog: readonly Hint[] = defaultCatalog,
): HintQueue {
  const fresh = hintsFor(trigger, catalog)
    .filter((hint) => !hintSeen(flags, hint.id))
    .filter((hint) => hint.id !== queue.active)
    .filter((hint) => !queue.pending.includes(hint.id))
    .map((hint) => hint.id);
  if (fresh.length === 0) return queue;
  return { ...queue, pending: [...queue.pending, ...fresh] };
}

/**
 * Which waiting hint should go up next: highest priority first, then
 * catalog order. Null when nothing is waiting — an id with no content
 * behind it (a retired hint still queued) sorts last and is dropped by
 * showHint rather than shown as a blank chip.
 */
export function nextHintId(
  queue: HintQueue,
  catalog: readonly Hint[] = defaultCatalog,
): string | null {
  const ranked = [...queue.pending]
    .map((id, index) => ({ id, index, hint: lookup(id, catalog) }))
    .filter((entry) => entry.hint !== undefined)
    .sort((a, b) => {
      const byPriority = (b.hint?.priority ?? 0) - (a.hint?.priority ?? 0);
      if (byPriority !== 0) return byPriority;
      const catalogA = catalog.indexOf(a.hint!);
      const catalogB = catalog.indexOf(b.hint!);
      if (catalogA !== catalogB) return catalogA - catalogB;
      return a.index - b.index;
    });
  return ranked[0]?.id ?? null;
}

function lookup(id: string, catalog: readonly Hint[]): Hint | undefined {
  return catalog === defaultCatalog
    ? getHint(id)
    : catalog.find((hint) => hint.id === id);
}

/**
 * Put the next waiting hint on screen, if there is room for one. Returns
 * the queue and — when a chip actually went up — the id the caller must
 * record in the flags. Nothing happens while a chip is already up, while
 * the scene is out of budget, or when nothing is waiting.
 *
 * Ids with no content behind them are dropped from the queue here rather
 * than shown: retiring a hint from the catalog must not strand a scene.
 */
export function showHint(
  queue: HintQueue,
  catalog: readonly Hint[] = defaultCatalog,
): { queue: HintQueue; shown: string | null } {
  if (queue.active !== null) return { queue, shown: null };
  if (budgetSpent(queue)) return { queue, shown: null };
  const id = nextHintId(queue, catalog);
  if (id === null) {
    // Everything waiting is unknown content; clearing it keeps the
    // queue from being asked the same dead question every tick.
    const live = queue.pending.filter((pending) => lookup(pending, catalog));
    return {
      queue: live.length === queue.pending.length ? queue : { ...queue, pending: live },
      shown: null,
    };
  }
  return {
    queue: {
      ...queue,
      pending: queue.pending.filter((pending) => pending !== id),
      active: id,
      shown: queue.shown + 1,
    },
    shown: id,
  };
}

/**
 * Take the chip down. A dismissal is instant and final: the hint is
 * already recorded as seen (showHint said so), so it does not come back
 * and nothing has to be confirmed.
 *
 * Passing an id that is not the one on screen is a no-op — a stale
 * click on a chip that has already gone must not take its replacement
 * down with it.
 */
export function dismissHint(queue: HintQueue, hintId?: string): HintQueue {
  if (queue.active === null) return queue;
  if (hintId !== undefined && hintId !== queue.active) return queue;
  return { ...queue, active: null };
}

/**
 * Clear the screen for a panel, putting the chip back rather than
 * spending it. A hint covered by an overlay in the same beat it went up
 * was never read — and, more to the point, a vendor hint cued *by* the
 * counter opening would otherwise be marked seen behind the counter's
 * own panel and never shown at all.
 *
 * So the chip goes to the front of the queue and the budget it took is
 * handed back; the caller un-marks the flag (see forgetHint). Anything
 * that was merely waiting stays waiting.
 */
export function pauseHints(queue: HintQueue): {
  queue: HintQueue;
  returned: string | null;
} {
  if (queue.active === null) return { queue, returned: null };
  return {
    queue: {
      ...queue,
      active: null,
      pending: [queue.active, ...queue.pending],
      shown: Math.max(0, queue.shown - 1),
    },
    returned: queue.active,
  };
}

/**
 * The helper line under a creation-wizard step, or null when the player
 * has finished a run before. One completed playthrough is the whole
 * test: somebody who has seen the credits has made every one of these
 * choices and does not need them explained again.
 */
export function wizardHelpFor(
  step: WizardStep,
  meta: Pick<MetaProgress, "completions">,
): string | null {
  if (meta.completions > 0) return null;
  return WIZARD_STEP_HELP[step];
}
