import type { SaveStorage } from "./storage";

/**
 * Storages that fail the way real ones do, for the tests that have to
 * prove the game survives it.
 *
 * A quota cannot be simulated by mocking setItem to throw once: the
 * behaviour that matters is *when* it throws — against a budget, with
 * whatever is already stored counting toward it — because that is what
 * decides whether the probe in ./storage.ts catches the failure before
 * the real key is touched. So the fake keeps a real budget.
 */

export interface BudgetStorage extends SaveStorage {
  /** Bytes currently held, by the same reckoning the budget uses. */
  used(): number;
  /** Bytes the storage will hold in total. */
  readonly budget: number;
  /** Keys currently held, for asserting nothing was left behind. */
  keys(): string[];
}

/** How a browser says "full", as the game's detector expects to hear it. */
export function quotaError(): Error {
  const error = new Error("The quota has been exceeded.");
  error.name = "QuotaExceededError";
  return error;
}

function cost(key: string, value: string): number {
  return (key.length + value.length) * 2;
}

/**
 * An in-memory storage with a byte ceiling. Writes past the ceiling
 * throw a QuotaExceededError and change nothing, exactly as a browser's
 * does.
 */
export function createBudgetStorage(budget: number): BudgetStorage {
  const data = new Map<string, string>();

  function used(): number {
    let total = 0;
    for (const [key, value] of data) total += cost(key, value);
    return total;
  }

  return {
    budget,
    used,
    keys: () => [...data.keys()],
    getItem: (key) => data.get(key) ?? null,
    setItem(key, value) {
      const existing = data.get(key);
      const after =
        used() - (existing === undefined ? 0 : cost(key, existing)) +
        cost(key, value);
      if (after > budget) throw quotaError();
      data.set(key, value);
    },
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * A storage that refuses every write for a reason that is not room —
 * private browsing, a blocked origin. Reads still work, because that is
 * what those modes actually do.
 */
export function createReadOnlyStorage(
  seed: Record<string, string> = {},
): SaveStorage {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem() {
      throw new Error("The operation is insecure.");
    },
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * A storage that accepts every write and keeps none of them — the
 * silent failure the write path verifies against.
 */
export function createAmnesiacStorage(): SaveStorage {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}
