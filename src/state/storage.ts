/**
 * Writing to storage without losing what was already there.
 *
 * `localStorage.setItem` has one failure mode that matters and it is
 * the worst possible one: the quota is full, the write throws, and
 * depending on the browser the key it was writing is now *gone* —
 * the player has lost the save they were overwriting in exchange for
 * the save they failed to write. A game that saves over its own
 * autosave every map transition cannot ship that.
 *
 * So every write here goes through one function with three properties:
 *
 *  - **Probe first.** The payload is written to a scratch key before
 *    the real one. If there is no room, the failure lands on a key
 *    nobody cares about and the real one is untouched.
 *  - **Roll back.** If the real write fails anyway — a quota that moved
 *    between the probe and the write, a storage that went away — the
 *    previous value is put back from memory.
 *  - **Never fail silently.** A write that could not happen throws a
 *    StorageWriteError carrying a sentence a player can act on, naming
 *    what is taking the room. Callers who genuinely cannot afford to
 *    throw (a backup, the codex) catch it; callers who can, don't.
 *
 * The one thing it cannot promise is a partial write, because
 * localStorage does not offer one: a key is set entirely or not at all.
 * What it can promise is that a failed write leaves the key holding
 * exactly what it held before.
 */

/** Minimal subset of the Web Storage API the game needs. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): SaveStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * "quota" — there is no room. "unavailable" — the storage itself
 * refused (private-browsing modes, a disabled origin), which no amount
 * of deleting saves will fix.
 */
export type StorageWriteCode = "quota" | "unavailable";

export class StorageWriteError extends Error {
  constructor(
    readonly code: StorageWriteCode,
    readonly key: string,
    /** The sentence that says what to do about it. */
    readonly guidance: string,
    message: string,
  ) {
    super(message);
    this.name = "StorageWriteError";
  }
}

/** Suffix the probe write lands on. Removed whether it succeeds or not. */
const SCRATCH_SUFFIX = ":writing";

export function scratchKey(key: string): string {
  return key + SCRATCH_SUFFIX;
}

/**
 * Whether a thrown value is storage saying "full". Browsers disagree
 * about how to say it — a DOMException named QuotaExceededError, the
 * legacy code 22, Firefox's NS_ERROR_DOM_QUOTA_REACHED at code 1014 —
 * so all of them are accepted, plus anything whose message says quota.
 */
export function isQuotaError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { name?: unknown; code?: unknown; message?: unknown };
  if (err.name === "QuotaExceededError") return true;
  if (err.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if (err.code === 22 || err.code === 1014) return true;
  return typeof err.message === "string" && /quota|storage is full/i.test(err.message);
}

/* ------------------------------------------------------------------ *
 * Guidance
 * ------------------------------------------------------------------ */

/** Something the player could delete, and what deleting it would buy. */
export interface Reclaimable {
  key: string;
  /** What the player calls it: "Slot 2", "Slot 2 backup". */
  label: string;
  bytes: number;
}

/** Roughly what a stored string costs, in bytes (storage is UTF-16). */
export function storedBytes(value: string | null): number {
  return value === null ? 0 : value.length * 2;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** What every quota message falls back to when nothing can be named. */
export const GENERIC_QUOTA_GUIDANCE =
  "Browser storage for this game is full. Delete an old save slot or a " +
  "backup from the Save screen, then try again.";

/**
 * The sentence a quota failure ends with: the biggest things this game
 * is storing, named and sized, so "free some space" is an instruction
 * rather than a wish. Backups sort first among equals — they are the
 * cheapest thing to lose.
 */
export function quotaGuidance(items: readonly Reclaimable[]): string {
  const worth = items.filter((item) => item.bytes > 0);
  if (worth.length === 0) return GENERIC_QUOTA_GUIDANCE;
  const biggest = [...worth].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  const named = biggest
    .map((item) => `${item.label} (${formatBytes(item.bytes)})`)
    .join(", ");
  return (
    "Browser storage for this game is full. The most room is in " +
    `${named} — delete one from the Save screen, then try again.`
  );
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export interface WriteOptions {
  /**
   * Called only when a write fails on quota, to build the sentence that
   * names what to delete. A thunk rather than a string because working
   * it out means reading every slot, and a write that succeeds should
   * not pay for that.
   */
  guidance?: () => string;
}

/**
 * Writes one key, or throws having changed nothing.
 *
 * The probe is what makes the promise keepable: a payload that does not
 * fit fails against the scratch key while the real one still holds the
 * last good save. Only once the storage has proven it can hold a string
 * this size is the real key touched.
 */
export function writeItem(
  storage: SaveStorage,
  key: string,
  value: string,
  options: WriteOptions = {},
): void {
  const scratch = scratchKey(key);
  const previous = safeRead(storage, key);

  // A scratch key left behind by a crashed write is pure cost; clear it
  // before asking for room.
  safeRemove(storage, scratch);

  let probeError: unknown = null;
  try {
    storage.setItem(scratch, value);
  } catch (error) {
    probeError = error;
  } finally {
    safeRemove(storage, scratch);
  }

  // A storage that refuses a write for a reason other than room, with
  // nothing of ours in it to protect, is simply not a storage.
  if (probeError !== null && !isQuotaError(probeError) && previous === null) {
    throw unavailable(key, probeError);
  }

  // The probe failing on room is not the end: overwriting a key that
  // already holds a payload of similar size can still succeed where
  // writing a second copy alongside it could not.
  try {
    storage.setItem(key, value);
  } catch (error) {
    restore(storage, key, previous);
    if (isQuotaError(error) || isQuotaError(probeError)) {
      throw quotaFailure(key, options.guidance);
    }
    throw unavailable(key, error);
  }

  // A storage that accepted the write and did not keep it is failing
  // silently, which is the one thing this module exists to prevent.
  if (safeRead(storage, key) !== value) {
    restore(storage, key, previous);
    throw quotaFailure(key, options.guidance);
  }
}

/** Removes a key, and the scratch key that shadows it. Never throws. */
export function removeItem(storage: SaveStorage, key: string): void {
  safeRemove(storage, scratchKey(key));
  safeRemove(storage, key);
}

function quotaFailure(key: string, guidance?: () => string): StorageWriteError {
  let sentence = GENERIC_QUOTA_GUIDANCE;
  try {
    sentence = guidance?.() ?? GENERIC_QUOTA_GUIDANCE;
  } catch {
    // Working out what to delete must never be what stops the error
    // from being reported.
  }
  return new StorageWriteError(
    "quota",
    key,
    sentence,
    `Could not write "${key}": storage is full. ${sentence}`,
  );
}

function unavailable(key: string, error: unknown): StorageWriteError {
  const detail = error instanceof Error ? error.message : String(error);
  const guidance =
    "This browser is not letting the game store anything — private " +
    "browsing or a blocked origin will do that. Progress will not be saved.";
  return new StorageWriteError(
    "unavailable",
    key,
    guidance,
    `Could not write "${key}": ${detail}. ${guidance}`,
  );
}

function restore(
  storage: SaveStorage,
  key: string,
  previous: string | null,
): void {
  try {
    if (previous === null) storage.removeItem(key);
    else storage.setItem(key, previous);
  } catch {
    // Nothing left to try. The throw the caller is about to receive is
    // still the truth: the write did not happen.
  }
}

function safeRead(storage: SaveStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(storage: SaveStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // A storage that will not delete is a storage that will not write
    // either; the write path reports that.
  }
}
