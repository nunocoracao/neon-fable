import type { DyeItem } from "../inventory/items";

/**
 * Dye content: the tins of color a runner can rub into a coat, and what
 * the Chrome Chapel charges for the ones it keeps on the shelf.
 *
 * A dye is cosmetic and nothing else — it names one or both of the
 * outfit sprite's material channels (primary is the cloth, accent is
 * the trim) and changes no figure any fight or gate reads. That is the
 * whole rule the economy rests on: color costs credits and buys
 * nothing but color.
 *
 * Two of the eight are never on the shelf. They are found — a tin
 * somebody left in a rented locker, and the color a market crew hands
 * you when you finish their run — because a look nobody can buy is
 * worth more than a look everybody can.
 */

export const dyeItems: DyeItem[] = [
  // --- Shelf stock: the chapel's standing range -----------------------
  {
    id: "dye-cinder-black",
    kind: "dye",
    name: "Cinder Black",
    description:
      "Soot-fast cloth dye cut with a lamp-amber edging pigment. Cinder " +
      "Row's own colors, and the reason half the Row looks like it just " +
      "walked out of a fire it started.",
    colors: { primary: "darkFabric", accent: "hazardAmber" },
  },
  {
    id: "dye-ash-vestment",
    kind: "dye",
    name: "Ash Vestment",
    description:
      "Flat grey pigment with a chrome-bright trim wash. Vesper calls it " +
      "the parish color and refuses to explain the joke.",
    colors: { primary: "concrete", accent: "brushedChrome" },
  },
  {
    id: "dye-signal-cyan",
    kind: "dye",
    name: "Signal Cyan",
    description:
      "Trim pigment only, mixed to the exact cyan the transit boards use " +
      "for a line that is still running. Leaves the cloth alone; the " +
      "seams do all the talking.",
    colors: { accent: "neonCyan" },
  },
  {
    id: "dye-tidewater",
    kind: "dye",
    name: "Tidewater",
    description:
      "A hologram-blue soak with glass-clear piping, sold to divers who " +
      "want the canal to think they belong to it.",
    colors: { primary: "hologramBlue", accent: "glass" },
  },
  {
    id: "dye-hazard-cut",
    kind: "dye",
    name: "Hazard Cut",
    description:
      "Work-crew amber with the trim dropped to black — the reverse of " +
      "every safety coat in the district, which is precisely the point.",
    colors: { primary: "hazardAmber", accent: "darkFabric" },
  },
  {
    id: "dye-mirror-steel",
    kind: "dye",
    name: "Mirror Steel",
    description:
      "A chrome-sheen wash with cold blue piping. Expensive, loud, and " +
      "the only tin on the shelf Vesper applies without commentary.",
    colors: { primary: "brushedChrome", accent: "hologramBlue" },
  },
  // --- Found colors: never sold, only come off a run -------------------
  {
    id: "dye-rust-vigil",
    kind: "dye",
    name: "Rust Vigil",
    description:
      "A half-used tin from a consignment locker nobody came back for: " +
      "market grey with the hazard edging the boards crews wore the year " +
      "the scaffolds went up. Not made any more.",
    colors: { primary: "concrete", accent: "hazardAmber" },
  },
  {
    id: "dye-last-mile",
    kind: "dye",
    name: "Last Mile Blue",
    description:
      "Courier color, mixed by hand and given rather than sold: deep " +
      "signal blue with a cyan cuff, worn by runners who finished a run " +
      "that had every reason not to be finished.",
    colors: { primary: "hologramBlue", accent: "neonCyan" },
  },
];

/** One tin the chapel keeps on the shelf, and what Vesper charges. */
export interface DyeShelfEntry {
  itemId: string;
  price: number;
}

/**
 * The Chrome Chapel's standing range, in shelf order. Prices scale with
 * how much of the coat the tin repaints: a trim-only pigment is the
 * cheap way to change what a crew reads as, a full re-cloth costs.
 */
export const CHAPEL_DYE_SHELF: readonly DyeShelfEntry[] = [
  { itemId: "dye-signal-cyan", price: 30 },
  { itemId: "dye-cinder-black", price: 45 },
  { itemId: "dye-ash-vestment", price: 45 },
  { itemId: "dye-hazard-cut", price: 50 },
  { itemId: "dye-tidewater", price: 55 },
  { itemId: "dye-mirror-steel", price: 65 },
];

const dyesById = new Map(dyeItems.map((dye) => [dye.id, dye]));

export function getDye(id: string): DyeItem | undefined {
  return dyesById.get(id);
}

/** What the chapel charges for a tin, or null for one it cannot sell. */
export function chapelDyePrice(id: string): number | null {
  return CHAPEL_DYE_SHELF.find((entry) => entry.itemId === id)?.price ?? null;
}
