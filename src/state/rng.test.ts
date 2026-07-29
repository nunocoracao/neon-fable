import { describe, expect, it } from "vitest";
import { createRng, hashSeed, nextFloat, nextInt, type RngState } from "./rng";

function sequence(seed: number, count: number): number[] {
  let state: RngState = createRng(seed);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const result = nextFloat(state);
    state = result.state;
    values.push(result.value);
  }
  return values;
}

describe("seeded RNG", () => {
  it("produces the same sequence for the same seed", () => {
    expect(sequence(1234, 20)).toEqual(sequence(1234, 20));
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(1, 10)).not.toEqual(sequence(2, 10));
  });

  it("is pure: calling nextFloat twice on the same state gives the same result", () => {
    const state = createRng(99);
    const a = nextFloat(state);
    const b = nextFloat(state);
    expect(a.value).toBe(b.value);
    expect(a.state).toEqual(b.state);
    expect(state.seed).toBe(99);
  });

  it("returns floats in [0, 1)", () => {
    for (const value of sequence(555, 200)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("nextInt stays within inclusive bounds and hits both ends", () => {
    let state = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const result = nextInt(state, 1, 6);
      state = result.state;
      expect(result.value).toBeGreaterThanOrEqual(1);
      expect(result.value).toBeLessThanOrEqual(6);
      seen.add(result.value);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(6)).toBe(true);
  });

  it("nextInt rejects an inverted range", () => {
    expect(() => nextInt(createRng(1), 5, 4)).toThrow();
  });

  it("rng state survives a JSON round-trip", () => {
    let state = createRng(42);
    state = nextFloat(state).state;
    const revived = JSON.parse(JSON.stringify(state)) as RngState;
    expect(nextFloat(revived).value).toBe(nextFloat(state).value);
  });
});

describe("hashSeed", () => {
  it("is a stable pure function of the text", () => {
    expect(hashSeed("cinder-plaza:3,7")).toBe(hashSeed("cinder-plaza:3,7"));
    expect(hashSeed("")).toBe(hashSeed(""));
  });

  it("always lands in uint32 range", () => {
    for (const text of ["", "a", "cinder-plaza:3,7", "☂ unicode ☂"]) {
      const hash = hashSeed(text);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("separates nearby inputs", () => {
    const hashes = new Set(
      ["map:0,0", "map:0,1", "map:1,0", "other:0,0", "map:10,10"].map(hashSeed),
    );
    expect(hashes.size).toBe(5);
  });
});
