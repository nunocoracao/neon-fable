import { describe, expect, it } from "vitest";
import { NEWS_HEADLINES } from "../data/world";
import {
  eligibleHeadlines,
  newsStrip,
  rotateHeadlines,
  screenSeed,
} from "./news";
import { EMPTY_WORLD, worldOf } from "./state";

/**
 * Pool gating and seeded rotation. Two promises: a screen never carries
 * a line the run has not earned, and a screen says the same thing at
 * the same moment every time the same run looks at it.
 */

const text = (id: string): string => {
  const headline = NEWS_HEADLINES.find((h) => h.id === id);
  if (!headline) throw new Error(`no headline "${id}"`);
  return headline.text;
};

describe("eligibleHeadlines", () => {
  it("carries a channel's standing filler to a run that has done nothing", () => {
    const civic = eligibleHeadlines("civic", EMPTY_WORLD);
    expect(civic.length).toBeGreaterThan(0);
    expect(civic.every((h) => h.channel === "civic")).toBe(true);
    expect(civic.some((h) => h.requires?.length)).toBe(false);
  });

  it("never leaks one channel's lines onto the other", () => {
    const world = worldOf("cordon-broken", "stalls-shuttered");
    expect(eligibleHeadlines("market", world).every((h) => h.channel === "market"))
      .toBe(true);
    expect(eligibleHeadlines("civic", world).every((h) => h.channel === "civic"))
      .toBe(true);
  });

  it("adds a beat's line the moment the city notices it", () => {
    const before = eligibleHeadlines("civic", EMPTY_WORLD).map((h) => h.id);
    expect(before).not.toContain("cordon-down");
    const after = eligibleHeadlines("civic", worldOf("cordon-broken")).map(
      (h) => h.id,
    );
    expect(after).toContain("cordon-down");
    // And keeps the filler: news is added, not swapped.
    expect(after).toEqual(expect.arrayContaining(before));
  });

  it("drops a line the world has overtaken", () => {
    // The Combine's growth report is filler right up until the
    // succession settles, and then it is not something the city says.
    expect(eligibleHeadlines("civic", EMPTY_WORLD).map((h) => h.id)).toContain(
      "combine-quarter",
    );
    expect(
      eligibleHeadlines("civic", worldOf("city-settled")).map((h) => h.id),
    ).not.toContain("combine-quarter");
  });

  it("needs every condition a line asks for", () => {
    const partial = eligibleHeadlines("market", worldOf("stalls-shuttered"));
    expect(partial.map((h) => h.id)).toContain("trade-climbs");
    expect(partial.map((h) => h.id)).not.toContain("exchange-stock");
  });
});

describe("rotateHeadlines", () => {
  const pool = ["a", "b", "c", "d", "e", "f", "g"];

  it("is the same order every time for the same seed", () => {
    expect(rotateHeadlines(pool, 7)).toEqual(rotateHeadlines(pool, 7));
  });

  it("is a permutation — nothing invented, nothing dropped", () => {
    const rotated = rotateHeadlines(pool, 12345);
    expect([...rotated].sort()).toEqual([...pool].sort());
    expect(rotated).toHaveLength(pool.length);
  });

  it("gives different seeds different orders", () => {
    const orders = new Set(
      [1, 2, 3, 4, 5].map((seed) => rotateHeadlines(pool, seed).join()),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("leaves the pool it was handed alone", () => {
    const snapshot = [...pool];
    rotateHeadlines(pool, 99);
    expect(pool).toEqual(snapshot);
  });

  it("survives an empty and a single-line pool", () => {
    expect(rotateHeadlines([], 3)).toEqual([]);
    expect(rotateHeadlines(["only"], 3)).toEqual(["only"]);
  });
});

describe("screenSeed", () => {
  it("gives every screen on every map its own rotation", () => {
    const seeds = [
      screenSeed("cinder-plaza", "plaza-board"),
      screenSeed("cinder-plaza", "row-sign"),
      screenSeed("vertical-market", "plaza-board"),
    ];
    expect(new Set(seeds).size).toBe(3);
    expect(screenSeed("cinder-plaza", "plaza-board")).toBe(seeds[0]);
  });
});

describe("newsStrip", () => {
  it("runs two screens on one map out of step with each other", () => {
    const world = worldOf("cordon-broken");
    const board = newsStrip("cinder-plaza", "plaza-board", "civic", world);
    const sign = newsStrip("cinder-plaza", "row-sign", "civic", world);
    expect([...board].sort()).toEqual([...sign].sort());
    expect(board).not.toEqual(sign);
  });

  it("carries the beat's own headline once the city has noticed", () => {
    const world = worldOf("cordon-broken");
    expect(newsStrip("cinder-plaza", "plaza-board", "civic", world)).toContain(
      text("cordon-down"),
    );
    expect(
      newsStrip("cinder-plaza", "plaza-board", "civic", EMPTY_WORLD),
    ).not.toContain(text("cordon-down"));
  });

  it("never comes back empty, so a screen is never blank", () => {
    for (const world of [
      EMPTY_WORLD,
      worldOf("city-settled"),
      worldOf("stalls-shuttered", "warrant-out"),
    ]) {
      expect(
        newsStrip("cinder-plaza", "plaza-board", "civic", world).length,
      ).toBeGreaterThan(0);
      expect(
        newsStrip("vertical-market", "aisle-board", "market", world).length,
      ).toBeGreaterThan(0);
    }
  });

  it("is stable across calls — the ticker is scenery, not a shuffle", () => {
    const world = worldOf("market-favoured");
    expect(newsStrip("vertical-market", "aisle-board", "market", world)).toEqual(
      newsStrip("vertical-market", "aisle-board", "market", world),
    );
  });
});
