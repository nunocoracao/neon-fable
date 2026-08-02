/**
 * A checksum for saved text.
 *
 * The job is narrow: catch a save that changed *after* it was written —
 * a half-flushed string, a storage quota that truncated one, a hand
 * edit that left valid JSON saying something the game never wrote. It
 * is not, and cannot be, tamper-proofing: the algorithm ships in the
 * same bundle the player is running, so anybody determined to edit a
 * save can restamp it, and that is fine. Save editing is not the threat
 * a single-player game has; silent corruption is.
 *
 * FNV-1a, 32 bits, printed as eight lowercase hex digits. Chosen for
 * being twelve lines of code with no dependencies and no async — a
 * checksum that had to be awaited (SubtleCrypto) would push saving into
 * a promise and every caller of it with them.
 */

/** How the stamp is spelled, so a later algorithm can be told apart. */
const PREFIX = "fnv1a32";

const OFFSET_BASIS = 0x811c9dc5;
const PRIME = 0x01000193;

/**
 * FNV-1a over the string's UTF-16 code units, folded to 32 bits.
 * Deterministic across builds and platforms — the same text always
 * stamps the same way, which is the whole contract.
 */
export function checksumText(text: string): string {
  let hash = OFFSET_BASIS;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    // Both bytes of the unit, low first: a two-byte feed keeps
    // characters outside Latin-1 from colliding with their low byte.
    hash = Math.imul(hash ^ (unit & 0xff), PRIME);
    hash = Math.imul(hash ^ ((unit >>> 8) & 0xff), PRIME);
  }
  return `${PREFIX}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** True when `stamp` is what this build would have written for `text`. */
export function checksumMatches(text: string, stamp: unknown): boolean {
  return typeof stamp === "string" && stamp === checksumText(text);
}

/**
 * Whether a stamp is one this build knows how to check. A stamp from a
 * future algorithm is *not* a mismatch — it is unverifiable, and a save
 * is not corrupt because the build reading it is older than the build
 * that wrote it. (Such a save fails the version gate first anyway; this
 * keeps the checksum layer from being the one to say something wrong.)
 */
export function isKnownChecksum(stamp: unknown): boolean {
  return typeof stamp === "string" && stamp.startsWith(`${PREFIX}:`);
}
