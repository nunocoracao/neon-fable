/**
 * The fader law: what a slider position means in amplitude.
 *
 * Loudness is logarithmic and sliders are linear, so a fader wired
 * straight to a gain node feels wrong in a specific, recognisable way —
 * the top half does almost nothing and everything happens in the last
 * centimetre. Real desks solve it by making the fader linear in *decibels*
 * instead, and by giving the top of the travel finer resolution than the
 * bottom, because that is where a mix is actually set.
 *
 * That is what this is: a two-segment taper.
 *
 * - The top half of the fader spans the last 12 dB — 1.0 is unity, 0.5
 *   is −12 dB. Fine control exactly where a player is balancing music
 *   against gunfire.
 * - The bottom half spans the remaining 48 dB, down to −60 dB, which is
 *   inaudible against anything. Coarse, because nobody balances a mix
 *   down there; they are on their way to off.
 * - 0 is silence outright, not −60 dB. The bottom of a fader means off.
 *
 * Every number here is a *position*, in [0,1] — what the slider reads and
 * what gets persisted. Amplitudes are derived and never stored, so the
 * curve can be re-tuned later without rewriting anybody's settings.
 */

/** Fader position where the two segments meet. */
export const FADER_MID = 0.5;
/** Decibels at FADER_MID: the top half's whole range. */
export const FADER_MID_DB = -12;
/** Decibels at the bottom of the travel, just above silence. */
export const FADER_MIN_DB = -60;

/** Clamps a fader position into [0,1]; non-finite values collapse to 0. */
export function clampFader(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * The level a fader position asks for, in decibels relative to unity.
 * −Infinity at the bottom of the travel, which is off rather than quiet.
 */
export function faderDb(position: number): number {
  const p = clampFader(position);
  if (p <= 0) return -Infinity;
  if (p >= FADER_MID) {
    return (FADER_MID_DB * (1 - p)) / (1 - FADER_MID);
  }
  return (
    FADER_MID_DB +
    ((FADER_MIN_DB - FADER_MID_DB) * (FADER_MID - p)) / FADER_MID
  );
}

/** The amplitude a fader position asks for, in [0,1]. */
export function faderGain(position: number): number {
  const db = faderDb(position);
  if (db === -Infinity) return 0;
  return 10 ** (db / 20);
}

/**
 * The fader position that produces `gain` — the inverse of faderGain,
 * exact over the fader's own range.
 *
 * This is what makes the move off the old linear volumes lossless: an
 * amplitude a player had chosen becomes the position that reproduces it,
 * so nothing about the mix changes on the upgrade. Anything below the
 * fader's floor was already inaudible and lands on off, which is where
 * it was.
 */
export function gainToFader(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) return 0;
  if (gain >= 1) return 1;
  const db = 20 * Math.log10(gain);
  if (db <= FADER_MIN_DB) return 0;
  if (db >= FADER_MID_DB) {
    return clampFader(1 - (db * (1 - FADER_MID)) / FADER_MID_DB);
  }
  return clampFader(
    FADER_MID - ((db - FADER_MID_DB) * FADER_MID) / (FADER_MIN_DB - FADER_MID_DB),
  );
}

/** A fader position as a whole percent, for the slider's own value. */
export function faderPercent(position: number): number {
  return Math.round(clampFader(position) * 100);
}

/**
 * The readout beside a fader: what it is set to, and what that means.
 * The percent is the fader's travel and the decibels are the level, and
 * they disagree on purpose — that disagreement *is* the taper, and
 * showing both is how a player calibrating against a test tone can tell
 * −6 dB from half.
 */
export function formatFader(position: number): string {
  const p = clampFader(position);
  if (p <= 0) return "Off";
  const db = faderDb(p);
  const rounded = Math.abs(db) < 0.05 ? 0 : db;
  const sign = rounded < 0 ? "−" : "";
  return `${faderPercent(p)}% · ${sign}${Math.abs(rounded).toFixed(1)} dB`;
}
