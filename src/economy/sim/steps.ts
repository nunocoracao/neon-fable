import { CHAPEL_DYE_SHELF } from "../../data/dyes";
import { EconomyError } from "../../data/economy";
import { RESTYLE_PRICE } from "../../data/stylist";
import type { RouteStep } from "../../data/story/walkthroughSupport";
import { buyDye } from "../../inventory/dye";
import { InventoryError } from "../../inventory/items";
import { MOD_REMOVAL_FEE } from "../../inventory/mods";
import { carriedInjury, treatInjury } from "../../state/injuries";
import { applyRestyle } from "../../state/restyle";
import { buyFromVendor, sellToVendor } from "../counter";
import { vendorSellables } from "../shelf";

/**
 * The moves a player makes between scenes that cost or make money, as
 * route steps.
 *
 * Every one of them goes through the shipped function — `buyFromVendor`,
 * `sellToVendor`, `treatInjury`, `applyRestyle`, `buyDye` — so a figure
 * the ledger reports is a figure a player would have been charged. None
 * of them throws: a step that cannot happen (sold out, unaffordable, the
 * counter unreachable this chapter) simply does nothing, because a
 * profile is a description of what a player *tries*, and what they can
 * actually afford is the thing under measurement.
 *
 * Every discretionary step takes a `reserve` — credits it refuses to
 * spend past. Without one a simulated player cheerfully buys a coat with
 * the money the next chapter's paid scene needs and then walks into a
 * gate it cannot open, which measures the harness rather than the
 * economy. See CHAPTER_RESERVE in src/data/economyBalance.ts for what
 * the figure is and why.
 *
 * Labels matter: the classifier (./classify.ts) reads a step's category
 * off the first word of its label, so every step here starts with one of
 * its prefixes.
 */

/**
 * Buys one copy of the first line on the wishlist the counter can
 * actually sell tonight — which is how a player shops for "a tier-2
 * weapon" rather than for a specific entry id. Whichever of the shelf's
 * hardware the city has put out this chapter, and can be paid for, is
 * the one that gets bought; a wishlist nothing on it is reachable is a
 * trip that bought nothing.
 */
export function shopStep(
  vendorId: string,
  wishlist: readonly string[],
  reserve = 0,
  verb: "buy" | "stock" = "buy",
): RouteStep {
  return {
    kind: "do",
    label: `${verb} ${wishlist[0] ?? "nothing"}`,
    run(state) {
      for (const entryId of wishlist) {
        try {
          const bought = buyFromVendor(state, vendorId, entryId);
          if (bought.state.credits < reserve) continue;
          return bought.state;
        } catch (error) {
          if (error instanceof EconomyError) continue;
          throw error;
        }
      }
      return state;
    },
  };
}

/** Buys up to `copies` off one line: the way a bag of patches is filled. */
export function stockStep(
  vendorId: string,
  entryId: string,
  copies: number,
  reserve = 0,
): RouteStep {
  return {
    kind: "do",
    label: `stock ${entryId}`,
    run(state) {
      let next = state;
      for (let bought = 0; bought < copies; bought++) {
        try {
          const result = buyFromVendor(next, vendorId, entryId);
          if (result.state.credits < reserve) break;
          next = result.state;
        } catch (error) {
          if (error instanceof EconomyError) break;
          throw error;
        }
      }
      return next;
    },
  };
}

/**
 * Empties the bag across a counter, keeping anything named. The
 * salvage faucet, and the only one a player controls directly — which
 * is why the arbitrage sweep cares about it so much.
 */
export function sellBagStep(
  vendorId: string,
  keep: readonly string[] = [],
): RouteStep {
  return {
    kind: "do",
    label: `sell bag at ${vendorId}`,
    run(state) {
      let next = state;
      // One pass per copy: selling re-indexes the bag, so the list is
      // re-read every time rather than walked.
      for (let guard = 0; guard < 200; guard++) {
        const line = vendorSellables(next, vendorId).find(
          (candidate) => !keep.includes(candidate.itemId),
        );
        if (!line) break;
        try {
          next = sellToVendor(next, vendorId, line.stackIndex).state;
        } catch (error) {
          if (error instanceof EconomyError) break;
          throw error;
        }
      }
      return next;
    },
  };
}

/**
 * The clinic: treats every wound the run can pay for, cheapest first.
 * The floor the whole economy is measured against — a player who cannot
 * reach this step is in the dead end the targets forbid.
 */
export function clinicStep(): RouteStep {
  return {
    kind: "do",
    label: "clinic treatment",
    run(state) {
      let next = state;
      for (let guard = 0; guard < 20; guard++) {
        if (!carriedInjury(next)) break;
        const treated = treatInjury(next);
        if (treated === next) break;
        next = treated;
      }
      return next;
    },
  };
}

/** A session in the chapel's chair, if the fee is there. */
export function restyleStep(reserve = 0): RouteStep {
  return {
    kind: "do",
    label: "restyle at the chapel",
    run(state) {
      if (state.credits - RESTYLE_PRICE < reserve) return state;
      // Any real edit will do; the ledger cares about the fee, not the
      // hair. Walking the catalog for a different value keeps the step
      // honest against `restyleChanged`, which never charges for a
      // session that changed nothing.
      const look = { ...state.player.appearance };
      const result = applyRestyle(state, {
        ...look,
        hairColor: look.hairColor === "raven" ? "silver" : "raven",
      });
      return result.ok ? result.state : state;
    },
  };
}

/** A tin off the chapel shelf, by index into CHAPEL_DYE_SHELF. */
export function dyeStep(index: number, reserve = 0): RouteStep {
  const entry = CHAPEL_DYE_SHELF[index];
  return {
    kind: "do",
    label: `dye ${entry?.itemId ?? "none"}`,
    run(state) {
      if (!entry || state.credits - entry.price < reserve) return state;
      try {
        const counter = buyDye(
          {
            character: state.player,
            inventory: state.inventory,
            credits: state.credits,
          },
          entry.itemId,
          entry.price,
        );
        return {
          ...state,
          credits: counter.credits,
          inventory: counter.inventory,
        };
      } catch (error) {
        if (error instanceof InventoryError) return state;
        throw error;
      }
    },
  };
}

/**
 * The bench's own charge: backing a fitted part out of a socket. Modelled
 * as the fee alone, because the part goes back in the bag intact — the
 * credits are the whole of what the bench takes.
 */
export function benchPullStep(reserve = 0): RouteStep {
  return {
    kind: "do",
    label: "bench part pulled",
    run(state) {
      if (state.credits - MOD_REMOVAL_FEE < reserve) return state;
      return { ...state, credits: state.credits - MOD_REMOVAL_FEE };
    },
  };
}
