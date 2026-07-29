/**
 * Day-phase tinting: the whole time-of-day look, done in the palette at
 * bake time. A phase maps every palette character to the color it takes
 * at that hour; the sprite provider bakes through that table and keys
 * its cache by phase, so a dusk street and a 3am street are two sets of
 * baked canvases rather than a per-pixel filter over every frame.
 *
 * The shift is a color grade, not a wash: each channel is multiplied by
 * a gain derived from the phase's cast, so darks stay dark and nothing
 * flattens toward the tint. Three kinds of entry are treated
 * differently, which is what keeps the look readable:
 *
 * - Emissive entries (EMISSIVE_COLORS) pass through untouched. Neon is
 *   its own light source; the hour it burns in does not dim it.
 * - Skin ramps take a damped share of the shift (SKIN_TINT_DAMPING), so
 *   a face never goes as blue-black as the pavement behind it.
 * - Everything else — neutrals, concrete, fabric, rust, water, hair —
 *   takes the shift in full.
 *
 * Pure and canvas-free: the tables are unit-testable, and "night" is
 * the identity grade, so an undeclared map bakes byte-for-byte what the
 * art was authored as.
 *
 * Scope is the scene. The DOM-side bakes — dialogue portraits, the
 * appearance pickers and preview, the dev gallery — keep the master
 * palette, so a look is always judged as it was authored rather than
 * through whatever hour the player happens to be standing in.
 */
import { EMISSIVE_COLORS, PALETTE, SKIN_RAMPS } from "./palette";
import type { DayPhaseId } from "../tilemap";

/** How a phase pushes the palette around. */
export interface PhaseTint {
  /** Overall gain on every tinted entry; below 1 darkens the scene. */
  brightness: number;
  /**
   * The hour's color cast, as "#rrggbb". Only its ratios matter: the
   * channel gains are normalized so the dominant channel stays 1 and
   * the others pull down, which shifts hue without lifting blacks.
   */
  cast: string;
  /** How far a tinted entry travels toward the cast (0 = none, 1 = all). */
  strength: number;
  /** Multiplier on the emissive glow pass's draw alpha. */
  glow: number;
}

/**
 * The three hours, tuned against the hub. Night is the identity grade —
 * every sprite in the game is authored at that hour, so it must bake
 * unchanged. Dusk lifts and warms the neutrals and holds the glow pass
 * back (signage does not win against the sky yet); late drops and cools
 * them hard and lets the glow pass over-drive, so the only warmth left
 * on a 3am street comes off the signs.
 */
export const PHASE_TINTS: Readonly<Record<DayPhaseId, PhaseTint>> = {
  dusk: { brightness: 1.16, cast: "#ff9a4d", strength: 0.24, glow: 0.7 },
  night: { brightness: 1, cast: "#ffffff", strength: 0, glow: 1 },
  late: { brightness: 0.76, cast: "#6ea0ff", strength: 0.28, glow: 1.35 },
};

/**
 * The share of a phase's shift skin ramps take. Faces are the one thing
 * a player must read at every hour, so skin travels less than half as
 * far as the world around it — enough to sit in the scene, not enough
 * to turn a character into a silhouette.
 */
export const SKIN_TINT_DAMPING = 0.45;

/** Palette characters belonging to a skin ramp, from every tone. */
const SKIN_CHARS: ReadonlySet<string> = new Set(
  SKIN_RAMPS.flatMap((ramp) => [ramp.shade, ramp.base, ramp.highlight]),
);

const EMISSIVE_CHARS: ReadonlySet<string> = new Set(EMISSIVE_COLORS);

const HEX = /^#[0-9a-fA-F]{6}$/;

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0");
}

/**
 * Per-channel multipliers for a tint: the cast normalized so its
 * strongest channel is 1, then blended in by `strength`. A cast of pure
 * white (or zero strength) yields (1, 1, 1) — the identity grade.
 */
export function tintGains(tint: PhaseTint): [number, number, number] {
  const cast = channels(tint.cast);
  const peak = Math.max(...cast, 1);
  return cast.map((c) => 1 + ((c / peak) - 1) * tint.strength) as [
    number,
    number,
    number,
  ];
}

/**
 * One palette color at an hour. `damping` is how far along the grade
 * the color travels: 1 takes all of it, SKIN_TINT_DAMPING walks skin
 * back toward what it was authored as. Colors that are not plain
 * "#rrggbb" — the soft alpha ground shadow — pass through, since
 * tinting a shadow only muddies the silhouette it sells.
 */
export function tintedColor(color: string, tint: PhaseTint, damping = 1): string {
  if (!HEX.test(color)) return color;
  const gains = tintGains(tint);
  const graded = channels(color).map((c, i) => {
    const full = c * tint.brightness * (gains[i] ?? 1);
    return c + (full - c) * damping;
  });
  return `#${graded.map(toHex).join("")}`;
}

/** Phase palettes are stable, so each is built once and shared. */
const PALETTE_CACHE = new Map<DayPhaseId, Readonly<Record<string, string>>>();

/**
 * The palette to bake with at an hour: total over the master palette
 * (every character keeps an entry, and no character is invented), with
 * emissive entries passed through and skin damped.
 */
export function phasePalette(phase: DayPhaseId): Readonly<Record<string, string>> {
  const cached = PALETTE_CACHE.get(phase);
  if (cached) return cached;
  const tint = PHASE_TINTS[phase];
  const table: Record<string, string> = {};
  for (const [ch, color] of Object.entries(PALETTE)) {
    table[ch] = EMISSIVE_CHARS.has(ch)
      ? color
      : tintedColor(color, tint, SKIN_CHARS.has(ch) ? SKIN_TINT_DAMPING : 1);
  }
  const frozen = Object.freeze(table);
  PALETTE_CACHE.set(phase, frozen);
  return frozen;
}

/**
 * How hard the emissive glow pass burns at an hour. Neon does not get
 * brighter after midnight — the eye and the darker street around it
 * make it read that way, and this is how that is faked.
 */
export function glowIntensityScale(phase: DayPhaseId): number {
  return PHASE_TINTS[phase].glow;
}
