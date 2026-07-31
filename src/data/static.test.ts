import { describe, expect, it } from "vitest";
import { items } from "./items";
import {
  STATIC_BANDS,
  STATIC_BANDS_TABLE,
  staticBand,
  staticBandRank,
} from "./static";

describe("the Static band table", () => {
  it("covers every band id exactly once, in ladder order", () => {
    expect(STATIC_BANDS_TABLE.map((band) => band.id)).toEqual([
      ...STATIC_BANDS,
    ]);
  });

  it("starts at zero and climbs, so every level names a band", () => {
    expect(STATIC_BANDS_TABLE[0]?.min).toBe(0);
    for (let i = 1; i < STATIC_BANDS_TABLE.length; i++) {
      expect(STATIC_BANDS_TABLE[i]!.min).toBeGreaterThan(
        STATIC_BANDS_TABLE[i - 1]!.min,
      );
    }
  });

  it("ranks bands by their place on the ladder", () => {
    expect(staticBandRank("clear")).toBe(0);
    expect(staticBandRank("screaming")).toBe(STATIC_BANDS.length - 1);
    for (const id of STATIC_BANDS) {
      expect(staticBand(id).id).toBe(id);
    }
  });

  it("costs nothing at the two quiet bands", () => {
    for (const id of ["clear", "humming"] as const) {
      expect(staticBand(id).effects).toEqual({
        coolPenalty: 0,
        initiativePenalty: 0,
        chromeAffinity: false,
        surge: false,
      });
    }
  });

  it("makes loud a trade rather than a tax, and screaming the only bill", () => {
    // Loud costs composure and buys a door; that pairing is the whole
    // design of the band, so it is pinned rather than left to content.
    const loud = staticBand("loud").effects;
    expect(loud.coolPenalty).toBeGreaterThan(0);
    expect(loud.chromeAffinity).toBe(true);
    expect(loud.initiativePenalty).toBe(0);
    expect(loud.surge).toBe(false);

    const screaming = staticBand("screaming").effects;
    expect(screaming.chromeAffinity).toBe(true);
    expect(screaming.coolPenalty).toBeGreaterThanOrEqual(loud.coolPenalty);
    expect(screaming.initiativePenalty).toBeGreaterThan(0);
    expect(screaming.surge).toBe(true);
  });

  it("says what every band feels like, and what the loud ones cost", () => {
    for (const band of STATIC_BANDS_TABLE) {
      expect(band.label.length).toBeGreaterThan(0);
      expect(band.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe("Static loads on the shipped implants", () => {
  const enhancements = items.filter((item) => item.kind === "enhancement");

  it("prices every enhancement, dampeners included", () => {
    expect(enhancements.length).toBeGreaterThan(0);
    for (const item of enhancements) {
      if (item.kind !== "enhancement") continue;
      expect(Number.isInteger(item.staticLoad), item.id).toBe(true);
      expect(item.staticLoad, item.id).not.toBe(0);
    }
  });

  it("ships dampeners in more than one slot, so quiet is a real choice", () => {
    const dampeners = enhancements.filter(
      (item) => item.kind === "enhancement" && item.staticLoad < 0,
    );
    expect(dampeners.length).toBeGreaterThanOrEqual(2);
    const slots = new Set(
      dampeners.map((item) => (item.kind === "enhancement" ? item.slot : "")),
    );
    expect(slots.size).toBeGreaterThanOrEqual(2);
    // A dampener that cost no capacity would be free quiet, and the
    // whole trade rests on it costing a socket somebody wanted.
    for (const item of dampeners) {
      if (item.kind !== "enhancement") continue;
      expect(item.neuralCost, item.id).toBeGreaterThan(0);
    }
  });

  it("keeps every band reachable with the hardware that exists", () => {
    // One implant per slot, loudest first: if the loudest legal stack
    // cannot reach screaming, the band is a rule about nothing.
    const bySlot = new Map<string, number>();
    for (const item of enhancements) {
      if (item.kind !== "enhancement") continue;
      const best = bySlot.get(item.slot) ?? 0;
      bySlot.set(item.slot, Math.max(best, item.staticLoad));
    }
    const loudest = [...bySlot.values()].reduce((sum, load) => sum + load, 0);
    for (const band of STATIC_BANDS_TABLE) {
      expect(loudest, `${band.id} reachable`).toBeGreaterThanOrEqual(band.min);
    }
  });
});
