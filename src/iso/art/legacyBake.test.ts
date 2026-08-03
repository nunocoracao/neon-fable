/**
 * The byte-identity pin.
 *
 * Palette v3 adds half-steps to the material ramps so art authored at
 * the finer density has somewhere to put a gradient. Every one of those
 * entries is new, and none of them may change what an existing grid
 * paints: the same character has to resolve to the same color, and the
 * detail pass has to light it toward the same neighbour it always did.
 *
 * "The same" is checkable exactly, so it is checked exactly. Every
 * registered piece of art goes through the real detail pass and the real
 * palette, and the resulting pixels are hashed. The digests below were
 * taken before palette v3 landed; if one moves, some old sprite now
 * paints differently, whatever the intent was.
 *
 * A digest that changes because art was *added* is expected — add the
 * new value. A digest that changes with no art added is the bug this
 * file exists to catch.
 */
import { describe, expect, it } from "vitest";
import { refined } from "./detail";
import { buildGallerySections } from "./gallery";
import { PALETTE, TRANSPARENT } from "./palette";
import type { PixelGrid } from "./pixel";

/** FNV-1a over a string, as an unsigned 32-bit number. */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One number per palette character, derived from the color it resolves
 * to — so the digest moves if a color is edited, not merely if a
 * character is used somewhere new.
 */
const COLOR_CODE: readonly number[] = ((): number[] => {
  const codes = Array<number>(128).fill(0);
  for (const [ch, color] of Object.entries(PALETTE)) {
    codes[ch.charCodeAt(0)] = hashText(color) || 1;
  }
  codes[TRANSPARENT.charCodeAt(0)] = 0;
  return codes;
})();

/** Fold a painted grid into a running hash, pixel by resolved pixel. */
function foldGrid(hash: number, grid: PixelGrid): number {
  let h = hash;
  for (const row of grid) {
    for (let x = 0; x < row.length; x++) {
      h ^= COLOR_CODE[row.charCodeAt(x)] ?? 0;
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x0a;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Digests as of the commit that introduced two-density art, taken from
 * the tree before palette v3. Keys are gallery section ids; the value is
 * every entry of that section, in registry order, run through the detail
 * pass and resolved against the palette.
 */
const PINNED: Readonly<Record<string, string>> = {
  tiles: "c04e13e1",
  props: "35cb2f0b",
  interactables: "bbe5d896",
  setpieces: "8179e454",
  cast: "75ee9bda",
  drones: "d58152a5",
  mechs: "695d1f3e",
  bodies: "872194ed",
  attacks: "5d9b51c5",
  reactions: "7359f25d",
  effects: "89871226",
  abilityEffects: "066983cd",
  statusMarkers: "d8593e6f",
  popups: "1dc6cc6d",
  actionIcons: "548e9f76",
  appearance: "02e1863c",
};

describe("existing art bakes byte-identically", () => {
  it("every registered grid still paints the pixels it always did", () => {
    const digests: Record<string, string> = {};
    for (const section of buildGallerySections()) {
      let hash = 0x811c9dc5;
      for (const entry of section.entries) {
        hash = Math.imul(hash ^ hashText(entry.id), 0x01000193) >>> 0;
        for (const frame of entry.frames) hash = foldGrid(hash, refined(frame));
      }
      digests[section.id] = hash.toString(16).padStart(8, "0");
    }
    expect(digests).toEqual(PINNED);
  });
});
