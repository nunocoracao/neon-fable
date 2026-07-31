/**
 * How an interlude plays, as pure state: beats arrive one at a time,
 * and any input either catches the vignette up or closes it.
 *
 * The rule the model exists to pin down is the skip: one press while
 * lines are still arriving shows the rest immediately — it never skips
 * the screen — and only a press on a vignette that has nothing left to
 * show closes it. That way a player mashing Enter reads the whole
 * recap and then leaves, instead of dismissing it unread.
 *
 * Reduced motion is the same vignette with the reveal already done, so
 * the very first press closes it.
 */

/** Gap between beats arriving. */
export const INTERLUDE_BEAT_MS = 1100;

/** How long one beat takes to fade in; mirrored by the stylesheet. */
export const INTERLUDE_FADE_MS = 420;

export interface InterludeReveal {
  /** Beats currently on screen. */
  shown: number;
  total: number;
}

/** What a press does next. */
export type InterludeAction = "reveal" | "close";

/**
 * The opening state. Reduced motion lands fully revealed; otherwise the
 * first beat is already up, so the screen is never blank.
 */
export function startReveal(
  total: number,
  reducedMotion = false,
): InterludeReveal {
  const shown = reducedMotion ? total : Math.min(1, total);
  return { shown, total };
}

/** True once every beat is on screen. */
export function revealComplete(reveal: InterludeReveal): boolean {
  return reveal.shown >= reveal.total;
}

/** The next beat arrives; a finished reveal stays put. */
export function tickReveal(reveal: InterludeReveal): InterludeReveal {
  if (revealComplete(reveal)) return reveal;
  return { ...reveal, shown: reveal.shown + 1 };
}

/**
 * A click, Enter, or Space: catch up if there is anything left to say,
 * otherwise leave. Returns the state to render and what the view should
 * do about it.
 */
export function pressInterlude(reveal: InterludeReveal): {
  reveal: InterludeReveal;
  action: InterludeAction;
} {
  if (revealComplete(reveal)) return { reveal, action: "close" };
  return { reveal: { ...reveal, shown: reveal.total }, action: "reveal" };
}

/** Label for the vignette's one button, given where the reveal is. */
export function interludeButtonLabel(reveal: InterludeReveal): string {
  return revealComplete(reveal) ? "Continue" : "Skip";
}
