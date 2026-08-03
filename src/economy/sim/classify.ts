import { getItem } from "../../data/items";
import type { RouteCreditEvent } from "../../data/story/walkthroughSupport";
import { isDampener } from "../../inventory/staticLoad";
import type { Effect } from "../../narrative/types";
import type { FlowCategory } from "./ledger";

/**
 * What a credit movement was for, read off the thing that moved it.
 *
 * Nothing here is a table of choice ids: a scene that charges for a
 * splint kit is classified as supplies because the choice hands over a
 * splint kit, and a scene that charges for a coat is gear because the
 * choice hands over a coat. That is the whole design — a new paid scene
 * lands in the right column of the ledger with no edit here, and a scene
 * that quietly changes what it sells reclassifies itself.
 *
 * The fallback for a payment that buys no object is `toll`: a cover
 * charge, a bribe, passage, damages. Those are real sinks and the city
 * is full of them, but they are the only ones the ledger cannot name
 * more precisely than "the city took it".
 */

/**
 * Between-scene steps say what they are in their label. The prefix is
 * the contract: the sweep's own steps (./profiles.ts) name themselves
 * with one of these, and anything else is a step that moved money
 * without saying why — which the sweep treats as a toll rather than
 * guessing.
 */
const STEP_PREFIXES: ReadonlyArray<[string, FlowCategory]> = [
  ["sell", "salvage"],
  ["buy", "gear"],
  ["stock", "supplies"],
  ["breach", "breach"],
  ["clinic", "clinic"],
  ["bench", "parts"],
  ["dye", "cosmetic"],
  ["restyle", "cosmetic"],
];

export function classifyEvent(event: RouteCreditEvent): FlowCategory {
  if (event.kind === "combat") return "encounter";
  if (event.kind === "step") return classifyStep(event.detail);
  return event.delta > 0 ? "job" : classifyPurchase(event.effects);
}

function classifyStep(label: string): FlowCategory {
  for (const [prefix, category] of STEP_PREFIXES) {
    if (label.startsWith(prefix)) return category;
  }
  return "toll";
}

/**
 * What a paid choice bought, from what it handed over. A choice that
 * treats a wound is the clinic even when it also hands over a patch, so
 * treatment is read first; otherwise the dearest thing the choice gave
 * decides, which is what keeps a coat-and-a-skewer bundle filed as gear.
 */
function classifyPurchase(effects: readonly Effect[]): FlowCategory {
  if (effects.some((effect) => effect.type === "treat-injury")) return "clinic";
  let best: FlowCategory | null = null;
  let bestRank = -1;
  for (const effect of effects) {
    if (effect.type !== "add-item") continue;
    const category = categoryOfItem(effect.itemId);
    if (!category) continue;
    const rank = PURCHASE_RANK.indexOf(category);
    if (rank > bestRank) {
      bestRank = rank;
      best = category;
    }
  }
  return best ?? "toll";
}

/** Dearest first: a bundle is filed under the biggest thing in it. */
const PURCHASE_RANK: readonly FlowCategory[] = [
  "supplies",
  "cosmetic",
  "parts",
  "clinic",
  "gear",
];

function categoryOfItem(itemId: string): FlowCategory | null {
  const item = getItem(itemId);
  if (!item) return null;
  switch (item.kind) {
    case "weapon":
    case "outfit":
      return "gear";
    case "enhancement":
      // A dampener is bought to quiet a body rather than to arm it, and
      // the ledger reads it the way the fiction does: clinic hardware.
      return isDampener(item) ? "clinic" : "gear";
    case "mod":
      return "parts";
    case "consumable":
      return "supplies";
    case "dye":
      return "cosmetic";
    default:
      return null;
  }
}
