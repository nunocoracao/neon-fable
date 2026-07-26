import { describe, expect, it } from "vitest";
import { STAT_KEYS } from "../character/stats";
import {
  DEFAULT_BACKGROUND_ID,
  backgrounds,
  getBackground,
} from "./backgrounds";

describe("backgrounds data", () => {
  it("defines at least three backgrounds with unique ids", () => {
    expect(backgrounds.length).toBeGreaterThanOrEqual(3);
    expect(new Set(backgrounds.map((b) => b.id)).size).toBe(backgrounds.length);
  });

  it("gives every background bonuses on real stats, gear, and tags", () => {
    for (const background of backgrounds) {
      expect(background.name).not.toBe("");
      expect(background.description).not.toBe("");
      const bonusKeys = Object.keys(background.statBonuses);
      expect(bonusKeys.length).toBeGreaterThan(0);
      for (const key of bonusKeys) {
        expect(STAT_KEYS).toContain(key);
      }
      expect(background.startingGearIds.length).toBeGreaterThan(0);
      expect(background.tags.length).toBeGreaterThan(0);
    }
  });

  it("looks backgrounds up by id", () => {
    expect(getBackground(DEFAULT_BACKGROUND_ID)?.id).toBe(DEFAULT_BACKGROUND_ID);
    expect(getBackground("no-such-origin")).toBeUndefined();
  });
});
