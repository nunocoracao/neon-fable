import { chapterReserve } from "../../data/economyBalance";
import type { RouteStep } from "../../data/story/walkthroughSupport";
import {
  benchPullStep,
  clinicStep,
  dyeStep,
  restyleStep,
  sellBagStep,
  shopStep,
  stockStep,
} from "./steps";

/**
 * How a run is played, as the economy sees it.
 *
 * Two profiles, because the economy makes two different promises and
 * only one of them is about a rich player:
 *
 * - **mainline-rusher** takes the road, patches up, treats what the
 *   fights leave behind, and buys the one weapon tier-up the shelf will
 *   sell. If this profile cannot finish holding something, the game has
 *   a poverty lock in it.
 * - **thorough-explorer** wants everything: the hardware, the chrome,
 *   the parts, the bench, the chair, the tins, a full bag of stims. It
 *   also sells what it stops needing, which is the only faucet a player
 *   controls directly. If *this* profile can afford the whole wishlist,
 *   the choices the shops offer are not choices.
 *
 * A profile is a list of things the player *tries* at each chapter
 * break, not a list of things that happen: every step in ./steps.ts is a
 * no-op when the shelf is empty or the credits are not there. That is
 * exactly what makes the ledger a measurement — what fell off the end of
 * the wishlist is the finding.
 */

export const ECONOMY_PROFILE_IDS = [
  "mainline-rusher",
  "thorough-explorer",
] as const;

export type EconomyProfileId = (typeof ECONOMY_PROFILE_IDS)[number];

export interface EconomyProfile {
  id: EconomyProfileId;
  label: string;
  blurb: string;
  /**
   * What this player does at the break after `chapter` — the moment the
   * shelf restocks and the clinic is open. Chapters are 1 and 2; the
   * finale has no shopping after it.
   */
  interlude(chapter: number): RouteStep[];
}

/* ------------------------------------------------------------------ *
 * Wishlists
 * ------------------------------------------------------------------ */

/**
 * The tier-2 hardware, in the order a player would take it. Both hot
 * variants are on the list under their clean twins: a run that kept the
 * spike pays the risk premium for the same gun, which is the point of
 * the premium and the reason it belongs in the sweep.
 */
export const WEAPON_WISHLIST = [
  "buy-rail-spitter",
  "buy-torque-cleaver",
  "buy-rail-spitter-hot",
  "buy-torque-cleaver-hot",
  "buy-spindle-projector",
] as const;

/** Coats, split by the counter that keeps them. */
const BROKER_OUTFITS = [
  "quill-plate", // salvaged Cordon plate, when the Cordon has fallen
  "quill-rig",
] as const;

const STALL_OUTFITS = ["buy-cordon-plate", "buy-ghostline-mantle"] as const;

/** Chrome a run buys rather than is given. */
const CHROME_WISHLIST = [
  "quill-optics",
  "buy-torsion-frame",
  "buy-warden-optics",
  "buy-cascade-governor",
] as const;

const PARTS_WISHLIST = [
  "buy-smartlink-sight",
  "buy-lattice-rifling",
  "buy-longspar-extension",
  "quill-ballast",
  "buy-burst-governor",
  "buy-hairline-sear",
] as const;

/**
 * How a weapon tier-up shows up in a ledger. Every purchase step labels
 * itself with the head of its wishlist (see shopStep), so this is the
 * prefix a bought gun files itself under whichever of the five lines the
 * shelf actually had out.
 */
export const WEAPON_WISH_PREFIX = `buy ${WEAPON_WISHLIST[0]}`;

/* ------------------------------------------------------------------ *
 * The profiles
 * ------------------------------------------------------------------ */

const BROKER = "vm-broker-counter";
const STALL = "wet-market-back";

export const ECONOMY_PROFILES: readonly EconomyProfile[] = [
  {
    id: "mainline-rusher",
    label: "Mainline rusher",
    blurb:
      "Takes the road, treats what the road costs, and buys the one gun " +
      "the shelf will sell. Nothing optional.",
    interlude: (chapter) => {
      const keep = chapterReserve(chapter);
      return [
        clinicStep(),
        stockStep(BROKER, "quill-patch", 2, keep),
        shopStep(STALL, WEAPON_WISHLIST, keep),
      ];
    },
  },
  {
    id: "thorough-explorer",
    label: "Thorough explorer",
    blurb:
      "Wants the hardware, the chrome, the parts, the bench, the chair " +
      "and a full bag — and sells everything it stops needing to get it.",
    interlude: (chapter) => {
      const keep = chapterReserve(chapter);
      return [
        // Salvage first: a thorough player clears the bag before they
        // shop, which is what makes the resale rate matter at all. Story
        // keys are worth nothing and are never listed, so nothing here
        // can sell a quest away.
        sellBagStep(BROKER, ["con-trauma-patch", "con-field-kit"]),
        clinicStep(),
        shopStep(STALL, WEAPON_WISHLIST, keep),
        shopStep(BROKER, BROKER_OUTFITS, keep),
        shopStep(STALL, STALL_OUTFITS, keep),
        shopStep(STALL, CHROME_WISHLIST, keep),
        shopStep(STALL, PARTS_WISHLIST, keep),
        benchPullStep(keep),
        stockStep(BROKER, "quill-patch", 3, keep),
        stockStep(BROKER, "quill-stim", 2, keep),
        stockStep(BROKER, "quill-kit", 1, keep),
        // Cosmetics last: the chair is what a player pays for once the
        // things that keep them alive are bought.
        restyleStep(keep),
        dyeStep(chapter - 1, keep),
      ];
    },
  },
];

export function requireEconomyProfile(id: EconomyProfileId): EconomyProfile {
  const profile = ECONOMY_PROFILES.find((entry) => entry.id === id);
  if (!profile) throw new Error(`No economy profile "${id}"`);
  return profile;
}
