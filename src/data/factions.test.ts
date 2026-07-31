import { describe, expect, it } from "vitest";
import {
  FACTION_IDS,
  REPUTATION_BANDS,
  REPUTATION_BAND_IDS,
  REPUTATION_MAX,
  REPUTATION_MIN,
  FactionError,
  bandCeiling,
  factions,
  getBand,
  getFaction,
  isFactionId,
  requireFaction,
  scaleStanding,
} from "./factions";
import { bandFor } from "../state/reputation";

describe("faction catalog", () => {
  it("registers one record per declared id, with copy on both", () => {
    expect(factions.map((f) => f.id)).toEqual([...FACTION_IDS]);
    for (const faction of factions) {
      expect(faction.name.length).toBeGreaterThan(0);
      expect(faction.blurb.length).toBeGreaterThan(20);
    }
  });

  it("names three distinct powers", () => {
    expect(new Set(factions.map((f) => f.name)).size).toBe(factions.length);
    expect(factions).toHaveLength(3);
  });

  it("looks a faction up, and knows when it does not have one", () => {
    expect(getFaction("court")?.name).toBe("The Cistern Court");
    expect(getFaction("longshore")).toBeUndefined();
    expect(isFactionId("auric")).toBe(true);
    expect(isFactionId("longshore")).toBe(false);
    expect(requireFaction("market").id).toBe("market");
    expect(() => requireFaction("longshore")).toThrow(FactionError);
  });
});

describe("reputation bands", () => {
  it("declares one band per id, ascending, starting at the floor", () => {
    expect(REPUTATION_BANDS.map((b) => b.id)).toEqual([
      ...REPUTATION_BAND_IDS,
    ]);
    expect(REPUTATION_BANDS[0]!.min).toBe(REPUTATION_MIN);
    for (let i = 1; i < REPUTATION_BANDS.length; i += 1) {
      expect(REPUTATION_BANDS[i]!.min).toBeGreaterThan(
        REPUTATION_BANDS[i - 1]!.min,
      );
    }
  });

  it("keeps every band reachable inside the scale", () => {
    for (const band of REPUTATION_BANDS) {
      expect(band.min).toBeGreaterThanOrEqual(REPUTATION_MIN);
      expect(band.min).toBeLessThanOrEqual(REPUTATION_MAX);
    }
  });

  it("looks a band up by id", () => {
    expect(getBand("warm")?.label).toBe("Warm");
    expect(getBand("beloved")).toBeUndefined();
  });

  it("names each band's ceiling, one below the next band's floor", () => {
    for (const [index, band] of REPUTATION_BANDS.entries()) {
      const next = REPUTATION_BANDS[index + 1];
      expect(bandCeiling(band.id), band.id).toBe(
        next ? next.min - 1 : REPUTATION_MAX,
      );
      // Ceiling and floor bracket the band and nothing else: the value
      // one above a ceiling must read as a different band.
      expect(bandFor(bandCeiling(band.id)).id, band.id).toBe(band.id);
      if (next) expect(bandFor(bandCeiling(band.id) + 1).id).toBe(next.id);
    }
  });
});

describe("scaleStanding", () => {
  it("multiplies an authored weight table into standing points", () => {
    expect(scaleStanding({ auric: 1, court: -2 }, 6)).toEqual({
      auric: 6,
      court: -12,
    });
  });

  it("drops factions the table leaves alone", () => {
    expect(scaleStanding({ auric: 0, market: 2 }, 6)).toEqual({ market: 12 });
    expect(scaleStanding({}, 6)).toEqual({});
  });
});
