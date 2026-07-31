import { describe, expect, it } from "vitest";
import {
  REPUTATION_MAX,
  REPUTATION_MIN,
  factions,
} from "../data/factions";
import { applyStanding, emptyReputation } from "../state/reputation";
import { factionMeter, factionRows } from "./factionModel";

describe("factionRows", () => {
  it("returns one row per faction, in catalog order", () => {
    const rows = factionRows(emptyReputation());
    expect(rows.map((r) => r.factionId)).toEqual(factions.map((f) => f.id));
    expect(rows.map((r) => r.name)).toEqual(factions.map((f) => f.name));
  });

  it("carries the band and the description the panel prints", () => {
    const rows = factionRows(
      applyStanding(emptyReputation(), { court: 62, auric: -70 }),
    );
    const court = rows.find((r) => r.factionId === "court")!;
    expect(court).toMatchObject({
      standing: 62,
      band: "trusted",
      bandLabel: "Trusted",
    });
    expect(court.blurb.length).toBeGreaterThan(20);
    expect(court.bandBlurb.length).toBeGreaterThan(10);

    const auric = rows.find((r) => r.factionId === "auric")!;
    expect(auric).toMatchObject({ band: "hostile", bandLabel: "Hostile" });
  });

  it("reads a faction nobody has an opinion about as neutral", () => {
    const rows = factionRows(emptyReputation());
    for (const row of rows) {
      expect(row).toMatchObject({ standing: 0, band: "neutral" });
      expect(row.meter).toEqual({
        offsetPercent: 50,
        widthPercent: 0,
        side: "none",
      });
    }
  });
});

describe("factionMeter", () => {
  it("grows right of centre for goodwill", () => {
    expect(factionMeter(50)).toEqual({
      offsetPercent: 50,
      widthPercent: 25,
      side: "positive",
    });
  });

  it("grows left of centre for a debt", () => {
    expect(factionMeter(-50)).toEqual({
      offsetPercent: 25,
      widthPercent: 25,
      side: "negative",
    });
  });

  it("fills its half of the track at either end of the scale", () => {
    expect(factionMeter(REPUTATION_MAX)).toEqual({
      offsetPercent: 50,
      widthPercent: 50,
      side: "positive",
    });
    expect(factionMeter(REPUTATION_MIN)).toEqual({
      offsetPercent: 0,
      widthPercent: 50,
      side: "negative",
    });
  });

  it("never leaves the track", () => {
    for (let value = REPUTATION_MIN; value <= REPUTATION_MAX; value += 1) {
      const meter = factionMeter(value);
      expect(meter.offsetPercent).toBeGreaterThanOrEqual(0);
      expect(meter.offsetPercent + meter.widthPercent).toBeLessThanOrEqual(100);
    }
  });
});
