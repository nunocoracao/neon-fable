/**
 * Deterministic seeded RNG (mulberry32). Pure: every call takes an RngState
 * and returns the next state plus a value, so game logic that rolls dice is
 * replayable and testable. Never use Math.random in game logic.
 */
export interface RngState {
  seed: number;
}

export interface RngResult<T> {
  state: RngState;
  value: T;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0 };
}

/** Advance the RNG one step; value is a float in [0, 1). */
export function nextFloat(state: RngState): RngResult<number> {
  const seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: { seed }, value };
}

/** Integer in [min, max] inclusive. */
export function nextInt(
  state: RngState,
  min: number,
  max: number,
): RngResult<number> {
  if (max < min) {
    throw new Error(`nextInt: max (${max}) < min (${min})`);
  }
  const { state: next, value } = nextFloat(state);
  return { state: next, value: min + Math.floor(value * (max - min + 1)) };
}
