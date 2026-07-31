import {
  applyBonuses,
  deriveAttributes,
  type AppearanceField,
  type DerivedAttributes,
  type Stats,
  type WizardDraft,
} from "../character";
import { STAT_KEYS } from "../character";
import { getAppearanceOption, getBackground, getItem } from "../data";
import { formatBonuses, statLabel } from "./format";

/**
 * Pure selector behind the wizard's review step: everything the
 * character sheet shows, derived from the draft and content catalogs.
 * No DOM — the screen renders exactly what this returns, so labels,
 * gear resolution, and the NG+ line are all unit-testable. Unknown ids
 * degrade to the raw id (missing content degrades, never crashes).
 */

/** Section labels for appearance fields, shared with the wizard screen. */
export const APPEARANCE_LABELS: Record<AppearanceField, string> = {
  skinTone: "Skin tone",
  build: "Build",
  hairStyle: "Hair",
  hairColor: "Hair color",
  eyes: "Eyes",
  eyeColor: "Eye color",
  brows: "Brows",
  mouth: "Mouth",
  faceDetail: "Face detail",
  headwear: "Headwear",
};

/** One worded line of the appearance summary, e.g. Hair: "Locs — Raven". */
export interface ReviewLine {
  label: string;
  value: string;
}

/** The New Game+ carry-over offer the review needs to summarize. */
export interface ReviewNgPlus {
  bonusPoints: number;
  /** The carried look that seeded the appearance step, when one did. */
  legacyAppearance?: WizardDraft["appearance"] | null;
}

export interface ReviewModel {
  name: string;
  background: { name: string; blurb: string; bonuses: string } | null;
  /** Stats after background bonuses — what the character starts with. */
  finalStats: Stats;
  /** "Body 8 · Reflexes 5 · …" in stat order. */
  statLine: string;
  derived: DerivedAttributes;
  /** Starting gear item names, in the background's declared order. */
  gear: string[];
  /** The chosen look in words, one line per visible feature. */
  appearance: ReviewLine[];
  /**
   * NG+ carry-over summary; null on a standard run. `excludes` is the
   * other half of the offer and is stated rather than implied: perks
   * are earned by *this* runner's street cred and do not travel, which
   * is what keeps New Game+ a nudge instead of a head start.
   */
  legacy: { pick: string; line: string; excludes: string } | null;
}

function optionLabel(field: AppearanceField, id: string): string {
  return getAppearanceOption(field, id)?.label ?? id;
}

/**
 * The look summarized in words from catalog labels. Colored features
 * pair the style with its color ("Shoulder Locs — Raven"); a layerless
 * hair style (shaved) has nothing to color, so its line stands alone.
 */
export function appearanceLines(
  appearance: WizardDraft["appearance"],
): ReviewLine[] {
  const hairStyle = getAppearanceOption("hairStyle", appearance.hairStyle);
  const hair =
    hairStyle && hairStyle.layer === null
      ? optionLabel("hairStyle", appearance.hairStyle)
      : `${optionLabel("hairStyle", appearance.hairStyle)} — ` +
        optionLabel("hairColor", appearance.hairColor);
  return [
    { label: APPEARANCE_LABELS.skinTone, value: optionLabel("skinTone", appearance.skinTone) },
    { label: APPEARANCE_LABELS.build, value: optionLabel("build", appearance.build) },
    { label: APPEARANCE_LABELS.hairStyle, value: hair },
    {
      label: APPEARANCE_LABELS.eyes,
      value:
        `${optionLabel("eyes", appearance.eyes)} — ` +
        optionLabel("eyeColor", appearance.eyeColor),
    },
    { label: APPEARANCE_LABELS.brows, value: optionLabel("brows", appearance.brows) },
    { label: APPEARANCE_LABELS.mouth, value: optionLabel("mouth", appearance.mouth) },
    { label: APPEARANCE_LABELS.faceDetail, value: optionLabel("faceDetail", appearance.faceDetail) },
    { label: APPEARANCE_LABELS.headwear, value: optionLabel("headwear", appearance.headwear) },
  ];
}

export function reviewModel(
  draft: WizardDraft,
  ngPlus: ReviewNgPlus | null = null,
): ReviewModel {
  const background = getBackground(draft.backgroundId) ?? null;
  const finalStats = background
    ? applyBonuses(draft.allocation, background.statBonuses)
    : draft.allocation;

  const legacyPick = draft.legacyItemId
    ? (getItem(draft.legacyItemId)?.name ?? draft.legacyItemId)
    : "Travel light";

  return {
    name: draft.name.trim(),
    background: background
      ? {
          name: background.name,
          blurb: background.description,
          bonuses: formatBonuses(background.statBonuses),
        }
      : null,
    finalStats,
    statLine: STAT_KEYS.map(
      (key) => `${statLabel(key)} ${finalStats[key]}`,
    ).join(" · "),
    derived: deriveAttributes(finalStats),
    gear: (background?.startingGearIds ?? []).map(
      (id) => getItem(id)?.name ?? id,
    ),
    appearance: appearanceLines(draft.appearance),
    legacy: ngPlus
      ? {
          pick: legacyPick,
          line:
            `${legacyPick} · +${ngPlus.bonusPoints} bonus point-buy points` +
            (ngPlus.legacyAppearance
              ? " · last runner's look carried over"
              : ""),
          excludes:
            "Perks stay with the runner who earned them — street cred is " +
            "a reputation, and nobody inherits one.",
        }
      : null,
  };
}
