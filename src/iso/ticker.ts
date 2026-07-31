/**
 * What a public screen is showing at one instant.
 *
 * Shaped exactly like ./weather.ts and ./setpiece.ts: authored
 * declarations in, a clock in, a list of draws out. No state, no
 * wall-clock, no canvas — where a headline has got to is a function of
 * the running order and the timestamp alone, so two players standing in
 * front of the same board in the same run read the same word.
 *
 * The running order itself is content the shell resolves (see
 * src/world/news.ts); this layer never learns what a condition is, in
 * the same way the scene never learns what a bark says.
 *
 * ## The schedule
 *
 * Every line travels the same distance — the window's width plus its
 * own — at the same speed, so a long headline simply takes longer.
 * Durations are summed into one loop and the clock is taken modulo it,
 * which makes the whole rotation replayable from t alone with no
 * per-screen bookkeeping.
 */
import { newsTextWidth } from "./art/news";
import type { IsoMap, NewsScreen } from "./tilemap";

/** 1x art pixels a headline travels per second. */
export const TICKER_SPEED_PX_PER_S = 26;

/** Blank pixels held between one headline leaving and the next entering. */
export const TICKER_GAP_PX = 24;

/** One screen's state this frame. */
export interface TickerDraw {
  screen: NewsScreen;
  /** The headline showing. */
  text: string;
  /**
   * Where the headline's left edge sits, in 1x art pixels from the
   * window's left edge. Starts at +width (just off the right), falls
   * past 0, and ends at -textWidth (just off the left).
   */
  offsetPx: number;
  /** Width of the baked strip, so the caller need not measure again. */
  textPx: number;
}

/** How long one headline takes to cross a window of this width, in ms. */
export function headlineDurationMs(text: string, windowPx: number): number {
  const travel = windowPx + newsTextWidth(text) + TICKER_GAP_PX;
  return (travel / TICKER_SPEED_PX_PER_S) * 1000;
}

/**
 * Which line of a running order is showing at `timeMs`, and how far it
 * has travelled. Returns null for an empty order — a screen with
 * nothing to say shows nothing rather than a blank scroll.
 */
export function tickerFrameAt(
  headlines: readonly string[],
  windowPx: number,
  timeMs: number,
): { text: string; offsetPx: number; textPx: number } | null {
  if (headlines.length === 0 || windowPx <= 0) return null;
  const durations = headlines.map((text) => headlineDurationMs(text, windowPx));
  const loop = durations.reduce((sum, ms) => sum + ms, 0);
  if (loop <= 0) return null;
  // Negative or absurd clocks fold back into the loop rather than
  // indexing off the end: a scene may hand any timestamp it likes.
  let t = timeMs % loop;
  if (t < 0) t += loop;
  let index = 0;
  for (; index < durations.length - 1; index++) {
    const span = durations[index] ?? 0;
    if (t < span) break;
    t -= span;
  }
  const text = headlines[index] ?? "";
  const travelled = (t / 1000) * TICKER_SPEED_PX_PER_S;
  return {
    text,
    offsetPx: windowPx - travelled,
    textPx: newsTextWidth(text),
  };
}

/**
 * The still a stopped ticker holds: the first line of the order, parked
 * at the window's left edge. Reduced motion freezes every clock in the
 * scene at zero, and a screen frozen at t = 0 is a screen showing a
 * headline that has not entered yet — which reads as a dead board, not
 * as stillness.
 */
export function tickerStill(
  headlines: readonly string[],
): { text: string; offsetPx: number; textPx: number } | null {
  const [text] = headlines;
  if (text === undefined) return null;
  return { text, offsetPx: 0, textPx: newsTextWidth(text) };
}

/**
 * Every screen on a map, with what it is showing. `strips` is the
 * running order per screen id, resolved by the shell; a screen with no
 * entry simply does not draw.
 */
export function collectTickers(
  map: IsoMap,
  strips: Readonly<Record<string, readonly string[]>>,
  timeMs: number,
  options?: { motion?: boolean },
): TickerDraw[] {
  const motion = options?.motion !== false;
  const draws: TickerDraw[] = [];
  for (const screen of map.screens ?? []) {
    const headlines = strips[screen.id] ?? [];
    const frame = motion
      ? tickerFrameAt(headlines, screen.width, timeMs)
      : tickerStill(headlines);
    if (!frame) continue;
    draws.push({ screen, ...frame });
  }
  return draws;
}

/**
 * The slice of a baked strip that falls inside the window, and where to
 * put it — the whole of the scrolling, in four numbers. All in 1x art
 * pixels; null when the line is entirely off one end.
 */
export interface TickerWindow {
  /** First column of the strip to copy. */
  sourceX: number;
  /** Columns to copy. */
  sourceW: number;
  /** Where they land, from the window's left edge. */
  destX: number;
}

export function tickerWindow(
  offsetPx: number,
  textPx: number,
  windowPx: number,
): TickerWindow | null {
  const left = Math.round(offsetPx);
  const right = left + textPx;
  if (right <= 0 || left >= windowPx || textPx <= 0) return null;
  const sourceX = Math.max(0, -left);
  const sourceW = Math.min(textPx, windowPx - left) - sourceX;
  if (sourceW <= 0) return null;
  return { sourceX, sourceW, destX: Math.max(0, left) };
}
