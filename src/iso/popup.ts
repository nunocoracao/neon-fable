/**
 * What a blow *says* while it lands: the number that rises off a body,
 * the muted figure a plate ate most of, the word a miss leaves behind,
 * and the short label a condition announces itself with.
 *
 * ## Presentation, never bookkeeping
 *
 * Nothing here decides anything. The combat log is the record of what
 * happened; a popup is one reading of an entry in it (see
 * ../ui/combatPopups.ts, which does the deriving). So a number can
 * never disagree with the log — there is only one figure, shown twice.
 *
 * ## Kinds
 *
 * A kind is how a reading is *styled*, not what it is about: the ink it
 * burns in, how large it is drawn, and whether it carries a mark.
 *
 * - `damage` — what got through, in danger red.
 * - `critical` — a blow that took a real share of the frame: the same
 *   figure, twice the size, in amber.
 * - `reduced` — plating stopped the greater part of it: chrome, muted,
 *   behind a shield tick, so a 1 that was nearly a 9 reads as armor
 *   rather than as a weak attacker.
 * - `miss` — no figure to show, so it says so, in steel.
 * - `heal` — HP coming back, in the palette's cyan-green.
 * - `status` / `status-out` — a condition arriving, and the same
 *   condition ending, dimmer.
 *
 * ## Motion
 *
 * One curve, pure over the milliseconds since the popup was due: it
 * rises quickly and settles, holding its brightness before dropping
 * away late, so the figure is readable for most of its life rather than
 * fading the instant it appears. Reduced motion keeps the fade and
 * drops the rise — the number appears where the blow landed and goes
 * out there.
 *
 * ## Stacking
 *
 * Several readings can answer one beat on one body (a hit and the
 * condition it left). Each takes the lowest free slot over that column,
 * and a slot is a fixed step up the screen — so simultaneous popups sit
 * in a column instead of on top of each other. Pure: the same live set
 * always assigns the same slot.
 *
 * Everything here is pure over a kind and an elapsed millisecond count.
 * The glyphs live in ./art/popupFont and a test pins the two together.
 */
import { clamp01 } from "./animation";
import type { StatusFamilyId } from "./status";

/** How a reading is styled; see the module comment. */
export const POPUP_KINDS = [
  "damage",
  "critical",
  "reduced",
  "miss",
  "heal",
  "status",
  "status-out",
] as const;

export type PopupKind = (typeof POPUP_KINDS)[number];

/** A mark drawn ahead of the text. Only armor has one to make. */
export const POPUP_BADGE_IDS = ["shield"] as const;

export type PopupBadgeId = (typeof POPUP_BADGE_IDS)[number];

/** How one kind is drawn. The font module authors to exactly this. */
export interface PopupStyle {
  /**
   * The palette character every glyph pixel burns in. Glyphs are
   * authored in white ink and remapped to this before baking.
   */
  readonly ink: string;
  /** Whole-pixel enlargement of the authored glyphs; 1 is the font. */
  readonly scale: number;
  /** A mark drawn ahead of the text, or null for most kinds. */
  readonly badge: PopupBadgeId | null;
}

/**
 * Every kind's look. Inks are palette characters, so a number is drawn
 * in exactly the colors the rest of the art is drawn in — the danger
 * red of the HP bar's last band, the amber of a muzzle flash, the
 * chrome of plating, the cyan a heal already reads as.
 *
 * The palette carries no green: its neon cyan (`g`) is the nearest
 * green-family entry and is already the color health comes back in
 * elsewhere in the HUD, so a heal burns in that.
 */
export const POPUP_STYLES: Readonly<Record<PopupKind, PopupStyle>> = {
  damage: { ink: "p", scale: 1, badge: null },
  // Bigger and hotter: the one reading meant to be seen from across the
  // arena without being read.
  critical: { ink: "n", scale: 2, badge: null },
  // Muted, behind the tick: what got through was mostly stopped.
  reduced: { ink: "8", scale: 1, badge: "shield" },
  miss: { ink: "7", scale: 1, badge: null },
  heal: { ink: "g", scale: 1, badge: null },
  // A condition arriving reads in the cyan its marker glows in; one
  // ending is the same word gone cold.
  status: { ink: "h", scale: 1, badge: null },
  "status-out": { ink: "6", scale: 1, badge: null },
};

/** Ms one popup lives for, from the beat it is due on. */
export const POPUP_MS = 900;

/** Screen pixels it climbs over that life. */
export const POPUP_RISE_PX = 56;

/**
 * Screen pixels above a tile's center the bottom of a popup starts at:
 * clear of the head of whoever is standing on it, so a number never
 * covers the body it is about.
 */
export const POPUP_LIFT_PX = 88;

/**
 * Screen pixels between the baselines of two popups stacked over one
 * body. Larger than the tallest popup draws (the critical kind, at
 * twice the font), so a stack never overlaps — pinned by a test.
 */
export const POPUP_STACK_PX = 26;

/** Where a popup is, and how visible, at one instant of its life. */
export interface PopupMotion {
  /** Screen pixels risen from where it was due. */
  readonly risePx: number;
  /** 1 at full strength, 0 once it is gone. */
  readonly alpha: number;
}

/**
 * The popup's motion `elapsedMs` after the beat it is due on, or null
 * before it is due and once it is over. Reduced motion holds it where
 * it landed and lets it fade there — the reading survives, the travel
 * does not.
 */
export function popupMotionAt(
  elapsedMs: number,
  reducedMotion = false,
): PopupMotion | null {
  if (elapsedMs < 0 || elapsedMs >= POPUP_MS) return null;
  const t = clamp01(elapsedMs / POPUP_MS);
  // Quick off the mark, settling as it goes: a number thrown up by the
  // blow rather than one drifting at a constant rate.
  const risePx = reducedMotion ? 0 : POPUP_RISE_PX * (1 - (1 - t) * (1 - t));
  // Holds bright, drops away late, so most of the life is readable.
  return { risePx, alpha: 1 - t * t };
}

/** One popup already over a column: which slot it took, and when. */
export interface PopupSlotView {
  readonly slot: number;
  /** Scene-clock ms the popup is due on. */
  readonly bornAt: number;
}

/**
 * The slot a popup due at `bornAt` takes over a column: the lowest one
 * no overlapping popup is using. Two popups overlap when their lives
 * do — including one still waiting on a later impact beat, which is
 * exactly the case a rifle's number and the condition behind it make.
 */
export function nextPopupSlot(
  live: readonly PopupSlotView[],
  bornAt: number,
  lifeMs: number = POPUP_MS,
): number {
  const taken = new Set(
    live
      .filter((other) => Math.abs(bornAt - other.bornAt) < lifeMs)
      .map((other) => other.slot),
  );
  let slot = 0;
  while (taken.has(slot)) slot++;
  return slot;
}

/** Screen pixels a slot sits above the first one. */
export function popupSlotOffsetPx(slot: number): number {
  return Math.max(0, slot) * POPUP_STACK_PX;
}

/** Whether a condition is arriving or ending. */
export type StatusPopupPhase = "gain" | "loss";

/**
 * What each condition family says when it lands and when it lifts.
 * Short and shouted, because it is read at a glance while something
 * else is happening under it — and because the marker over the body
 * (see ./status.ts) carries the fact for as long as it is true. The
 * popup only ever announces the *change*.
 */
export const STATUS_POPUP_LABELS: Readonly<
  Record<StatusFamilyId, Readonly<Record<StatusPopupPhase, string>>>
> = {
  stunned: { gain: "STUNNED", loss: "READY" },
  guarded: { gain: "GUARD UP", loss: "GUARD DOWN" },
  empowered: { gain: "POWER UP", loss: "POWER DOWN" },
};

/** The label a family's change shows. */
export function statusPopupLabel(
  family: StatusFamilyId,
  phase: StatusPopupPhase,
): string {
  return STATUS_POPUP_LABELS[family][phase];
}

/** The kind a family's change is styled as: lit arriving, cold ending. */
export function statusPopupKind(phase: StatusPopupPhase): PopupKind {
  return phase === "gain" ? "status" : "status-out";
}
