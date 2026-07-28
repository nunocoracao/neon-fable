import { describe, expect, it } from "vitest";
import { createSpriteCache } from "./spriteCache";

/** Cache of named values where each value's size is its number. */
function numberCache(budgetBytes: number) {
  return createSpriteCache<number>(budgetBytes, (value) => value);
}

describe("createSpriteCache", () => {
  it("makes on miss, returns the cached value on hit", () => {
    const cache = numberCache(100);
    let makes = 0;
    const make = (): number => {
      makes++;
      return 7;
    };
    expect(cache.get("a", make)).toBe(7);
    expect(cache.get("a", make)).toBe(7);
    expect(makes).toBe(1);
    expect(cache.stats()).toMatchObject({
      entries: 1,
      bytes: 7,
      budgetBytes: 100,
      hits: 1,
      misses: 1,
      evictions: 0,
    });
  });

  it("accounts bytes across entries", () => {
    const cache = numberCache(100);
    cache.get("a", () => 10);
    cache.get("b", () => 30);
    expect(cache.stats().bytes).toBe(40);
    expect(cache.stats().entries).toBe(2);
  });

  it("evicts least-recently-used entries once over budget", () => {
    const cache = numberCache(100);
    let remade = 0;
    cache.get("a", () => 40);
    cache.get("b", () => 40);
    cache.get("c", () => 40); // 120 > 100: evicts a
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 80, evictions: 1 });
    cache.get("a", () => {
      remade++;
      return 40;
    });
    expect(remade).toBe(1); // a was evicted
    // b was oldest when a came back, so it went next.
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 80, evictions: 2 });
  });

  it("a hit refreshes recency, protecting the entry from eviction", () => {
    const cache = numberCache(100);
    cache.get("a", () => 40);
    cache.get("b", () => 40);
    cache.get("a", () => 999); // hit: a becomes most recent
    cache.get("c", () => 40); // over budget: evicts b, not a
    let remadeA = 0;
    cache.get("a", () => {
      remadeA++;
      return 40;
    });
    expect(remadeA).toBe(0);
    expect(cache.stats().evictions).toBe(1);
  });

  it("keeps a single entry that alone exceeds the budget", () => {
    const cache = numberCache(100);
    expect(cache.get("huge", () => 500)).toBe(500);
    expect(cache.stats()).toMatchObject({ entries: 1, bytes: 500, evictions: 0 });
    // The next insert evicts the oversized entry, not the new one.
    cache.get("small", () => 10);
    expect(cache.stats()).toMatchObject({ entries: 1, bytes: 10, evictions: 1 });
  });

  it("evicts multiple entries when one insert overshoots by a lot", () => {
    const cache = numberCache(100);
    cache.get("a", () => 30);
    cache.get("b", () => 30);
    cache.get("c", () => 30);
    cache.get("big", () => 90); // needs a, b, and c gone
    expect(cache.stats()).toMatchObject({ entries: 1, bytes: 90, evictions: 3 });
  });
});
