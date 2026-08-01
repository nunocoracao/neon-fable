/**
 * What the game does when the player is not looking at it.
 *
 * Two different things can be true, and they deserve different answers:
 *
 * - The *tab* is not on screen at all (another tab, minimised window).
 *   Nobody is watching, the browser is already throttling our timers,
 *   and a page that keeps playing from a tab you cannot see is the thing
 *   people hunt through tabs to kill. This goes to silence.
 * - The window is merely *unfocused* — the game is still visible,
 *   somebody is answering a message in front of it. Silencing that is
 *   heavy-handed; the game is still there, it should just stop
 *   competing. This ducks, it does not stop.
 *
 * Which is why this is a state machine over two independent facts rather
 * than one "is the player here" boolean: the events arrive from two
 * different browser APIs (window focus/blur and document visibility),
 * they interleave in every order, and a tab can be hidden while focused
 * or focused while hidden depending on the platform. Kept pure so the
 * orderings can be tested without a browser; ./bus.ts owns the listeners.
 *
 * The whole thing is one setting away from being off — some players run
 * the game on a second monitor on purpose, and that is a reasonable
 * thing to want.
 */

/** Gain factor while the window is visible but not focused. */
export const DUCK_BLURRED_GAIN = 0.2;
/** Gain factor while the tab is not on screen at all. */
export const DUCK_HIDDEN_GAIN = 0;

export interface FocusState {
  /** Whether the window has keyboard focus. */
  readonly focused: boolean;
  /** Whether the tab is on screen at all. */
  readonly visible: boolean;
}

/** Playing to somebody who is looking at it: the state a page boots in. */
export const ATTENDED: FocusState = { focused: true, visible: true };

/** The four things the browser tells us; nothing else moves this. */
export type FocusEvent = "focus" | "blur" | "show" | "hide";

/** Applies one browser event. Idempotent — repeats change nothing. */
export function applyFocusEvent(
  state: FocusState,
  event: FocusEvent,
): FocusState {
  switch (event) {
    case "focus":
      return state.focused ? state : { ...state, focused: true };
    case "blur":
      return state.focused ? { ...state, focused: false } : state;
    case "show":
      return state.visible ? state : { ...state, visible: true };
    case "hide":
      return state.visible ? { ...state, visible: false } : state;
  }
}

/**
 * What the master bus is multiplied by right now. A hidden tab wins over
 * an unfocused one — it is the stronger statement about whether anybody
 * is there — and the setting overrides both.
 */
export function duckFactor(state: FocusState, enabled: boolean): number {
  if (!enabled) return 1;
  if (!state.visible) return DUCK_HIDDEN_GAIN;
  if (!state.focused) return DUCK_BLURRED_GAIN;
  return 1;
}

/** Whether the game is currently being quieted for want of attention. */
export function isDucked(state: FocusState, enabled: boolean): boolean {
  return duckFactor(state, enabled) < 1;
}
