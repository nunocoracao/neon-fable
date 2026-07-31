import { describe, expect, it } from "vitest";
import {
  applyBonuses,
  baseStats,
  defaultAppearance,
  deriveAttributes,
  type WizardDraft,
} from "../character";
import { getBackground } from "../data";
import { reviewModel } from "./reviewModel";

/**
 * The review step's pure selector: catalog labels resolve into words,
 * the gear list follows the chosen background, and the NG+ line shows
 * exactly when a carry-over offer exists.
 */

function draft(patch: Partial<WizardDraft> = {}): WizardDraft {
  return {
    name: "  Vex  ",
    backgroundId: "gutter-courier",
    allocation: baseStats(),
    appearance: defaultAppearance(),
    legacyItemId: null,
    ...patch,
  };
}

describe("reviewModel", () => {
  it("resolves appearance labels from the catalogs, colors paired", () => {
    const model = reviewModel(
      draft({
        appearance: {
          ...defaultAppearance(),
          skinTone: "warm-brown",
          hairStyle: "locs",
          hairColor: "auburn",
          eyes: "narrow",
          eyeColor: "amber",
          mouth: "smirk",
        },
      }),
    );
    const byLabel = Object.fromEntries(
      model.appearance.map((line) => [line.label, line.value]),
    );
    expect(byLabel["Skin tone"]).toBe("Warm Brown");
    expect(byLabel["Hair"]).toBe("Shoulder Locs — Auburn");
    expect(byLabel["Eyes"]).toBe("Narrow — Amber");
    expect(byLabel["Mouth"]).toBe("Slight Smirk");
    expect(byLabel["Headwear"]).toBe("None");
  });

  it("a shaved head has nothing to color, so its line stands alone", () => {
    const model = reviewModel(
      draft({
        appearance: { ...defaultAppearance(), hairStyle: "none" },
      }),
    );
    const hair = model.appearance.find((line) => line.label === "Hair");
    expect(hair?.value).toBe("Shaved");
  });

  it("unknown appearance ids degrade to the raw id", () => {
    const model = reviewModel(
      draft({
        appearance: { ...defaultAppearance(), mouth: "gone-mouth" },
      }),
    );
    const mouth = model.appearance.find((line) => line.label === "Mouth");
    expect(mouth?.value).toBe("gone-mouth");
  });

  it("gear list matches the chosen background, in declared order", () => {
    expect(reviewModel(draft()).gear).toEqual([
      "Shard Knife",
      "Courier Slicker",
    ]);
    expect(reviewModel(draft({ backgroundId: "tower-analyst" })).gear).toEqual([
      "Compact Pistol",
      "Spire Suit",
    ]);
  });

  it("applies background bonuses to the stat line and derived block", () => {
    const model = reviewModel(draft());
    const background = getBackground("gutter-courier")!;
    const finalStats = applyBonuses(baseStats(), background.statBonuses);
    expect(model.finalStats).toEqual(finalStats);
    expect(model.statLine).toContain(`Body ${finalStats.body}`);
    expect(model.statLine).toContain(`Reflexes ${finalStats.reflexes}`);
    expect(model.derived).toEqual(deriveAttributes(finalStats));
    expect(model.background?.name).toBe("Gutter Courier");
    expect(model.background?.bonuses).toBe("+1 Body, +1 Reflexes");
    expect(model.background?.blurb).toBe(background.description);
  });

  it("an unknown background degrades to no blurb and no gear", () => {
    const model = reviewModel(draft({ backgroundId: "gone-bg" }));
    expect(model.background).toBeNull();
    expect(model.gear).toEqual([]);
    expect(model.finalStats).toEqual(baseStats());
  });

  it("trims the name", () => {
    expect(reviewModel(draft()).name).toBe("Vex");
  });

  it("shows the NG+ line only for NG+ runs", () => {
    expect(reviewModel(draft()).legacy).toBeNull();

    const withPick = reviewModel(
      draft({ legacyItemId: "wpn-shard-knife" }),
      { bonusPoints: 3 },
    );
    expect(withPick.legacy?.pick).toBe("Shard Knife");
    expect(withPick.legacy?.line).toBe(
      "Shard Knife · +3 bonus point-buy points",
    );

    const travelingLight = reviewModel(draft(), { bonusPoints: 2 });
    expect(travelingLight.legacy?.line).toBe(
      "Travel light · +2 bonus point-buy points",
    );
  });

  it("states what New Game+ does not carry — perks are never inherited", () => {
    const legacy = reviewModel(draft(), { bonusPoints: 3 }).legacy;
    expect(legacy?.excludes).toMatch(/perks/i);
    expect(legacy?.excludes).toMatch(/street cred/i);
  });

  it("mentions the carried look only when one seeded the wizard", () => {
    const carried = reviewModel(draft(), {
      bonusPoints: 3,
      legacyAppearance: defaultAppearance(),
    });
    expect(carried.legacy?.line).toBe(
      "Travel light · +3 bonus point-buy points · last runner's look carried over",
    );

    const withoutLook = reviewModel(draft(), {
      bonusPoints: 3,
      legacyAppearance: null,
    });
    expect(withoutLook.legacy?.line).toBe(
      "Travel light · +3 bonus point-buy points",
    );
  });
});
