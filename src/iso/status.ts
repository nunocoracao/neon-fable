/**
 * What an ongoing condition looks like from across the arena. A blow is
 * over in a third of a second; a condition is still true on somebody's
 * next turn, so it cannot be an animation that plays once — it has to be
 * a mark that keeps showing for as long as the condition lasts.
 *
 * ## One look per family, not per source
 *
 * Conditions group into *families*, and a family has exactly one glyph.
 * Two abilities, a consumable, and an enemy that all leave a combatant
 * quicker leave the same mark, because to the player they are the same
 * fact: that body is running fast right now. The families are:
 *
 * - `stunned` — a turn this combatant is going to lose (stunTurns).
 * - `charging` — an attack declared and not yet thrown (see
 *   src/combat/charge.ts). The tinted ground says *where* it lands; the
 *   mark says *who* is holding it, which is the half of the fact the
 *   floor cannot carry.
 * - `guarded` — a boost to what a body can take (Body).
 * - `empowered` — a boost to what it can do (everything else).
 *
 * Which family a boost shows as is a lookup, not a branch: BOOST_FAMILY
 * maps every stat, so a new stat cannot silently render as nothing.
 *
 * ## Marks, not motion
 *
 * Each glyph is a small looping picture pinned over the body's head. The
 * loops are slow and shallow on purpose — a marker that flashes competes
 * with the blows landing under it. Reduced motion holds frame zero: the
 * mark still says what is true, it simply stops moving.
 *
 * Pure over the condition and a clock. The glyphs live in
 * ./art/statusMarkers and a test pins their frame counts to this file.
 */
import { frameAt } from "./animation";
import type { StatKey } from "../character/stats";

/** Every condition family a combatant can be marked with. */
export const STATUS_FAMILY_IDS = [
  "stunned",
  "charging",
  "guarded",
  "empowered",
] as const;

export type StatusFamilyId = (typeof STATUS_FAMILY_IDS)[number];

/** Timing of one family's glyph loop; the art is authored to these. */
export interface StatusMarkerSpec {
  readonly frameMs: number;
  readonly frameCount: number;
  /** Shown in the log-free places a marker needs a name (dev, tests). */
  readonly label: string;
}

export const STATUS_MARKERS: Readonly<
  Record<StatusFamilyId, StatusMarkerSpec>
> = {
  // Static crawling round a head that is not going to move this turn.
  stunned: { frameMs: 130, frameCount: 3, label: "Stunned" },
  // Capacitors filling: three rungs lighting bottom to top, faster than
  // anything else on the row, because it is counting down to something.
  charging: { frameMs: 150, frameCount: 3, label: "Charging" },
  // Plating holding: a slow two-beat breath, nothing hurried about it.
  guarded: { frameMs: 220, frameCount: 2, label: "Guarded" },
  // Wound up: the same breath, quicker.
  empowered: { frameMs: 160, frameCount: 2, label: "Empowered" },
};

/**
 * Which family a stat boost marks a body with. Body is what a frame can
 * absorb, so a Body boost reads as plating; every other stat is the body
 * doing more, which reads as drive.
 */
export const BOOST_FAMILY: Readonly<Record<StatKey, StatusFamilyId>> = {
  body: "guarded",
  reflexes: "empowered",
  tech: "empowered",
  cool: "empowered",
  intelligence: "empowered",
};

/** The family a boost to this stat shows as. */
export function boostStatusFamily(stat: StatKey): StatusFamilyId {
  return BOOST_FAMILY[stat];
}

/** The conditions on one combatant, as the combat screen reads them. */
export interface StatusView {
  /** Turns the combatant is going to lose; 0 or absent is unstunned. */
  readonly stunTurns?: number;
  /** Stats currently boosted, however many boosts each has. */
  readonly boostStats?: readonly StatKey[];
  /** True while it is holding a declared attack it has not thrown. */
  readonly charging?: boolean;
}

/**
 * The families a combatant is marked with, in registry order and with no
 * repeats — two Reflexes boosts are one mark, because the player is
 * being told a fact, not a count.
 */
export function statusFamilies(view: StatusView): StatusFamilyId[] {
  const found = new Set<StatusFamilyId>();
  if ((view.stunTurns ?? 0) > 0) found.add("stunned");
  if (view.charging === true) found.add("charging");
  for (const stat of view.boostStats ?? []) found.add(boostStatusFamily(stat));
  return STATUS_FAMILY_IDS.filter((id) => found.has(id));
}

/**
 * Which frame of a family's glyph is showing. Reduced motion holds the
 * first frame forever — the mark stays, the motion goes.
 */
export function statusMarkerFrame(
  family: StatusFamilyId,
  timeMs: number,
  reducedMotion = false,
): number {
  if (reducedMotion) return 0;
  const { frameMs, frameCount } = STATUS_MARKERS[family];
  return frameAt(timeMs, frameMs, frameCount);
}

/** Screen pixels between the centers of two markers over one body. */
export const STATUS_MARKER_SPACING_PX = 22;

/**
 * Screen-x offsets from the body's center for a row of markers, so the
 * row stays centered over the head however many conditions are on it.
 */
export function statusMarkerOffsets(
  count: number,
  spacingPx: number = STATUS_MARKER_SPACING_PX,
): number[] {
  if (count <= 0) return [];
  const start = -((count - 1) * spacingPx) / 2;
  return Array.from({ length: count }, (_, i) => start + i * spacingPx);
}
