import { EconomyError, HAGGLE, requireVendor } from "../data/economy";
import { getItem } from "../data/items";
import { addItem, takeCopy } from "../inventory/inventory";
import { effectiveStats } from "../inventory/selectors";
import type { GameState } from "../state/gameState";
import { canHaggle, recordHaggle, recordSale } from "../state/vendors";
import { deriveWorldState, type WorldState } from "../world/state";
import { canAttemptHaggle, haggleAttempt, type HaggleAttempt } from "./haggle";
import {
  shelfLine,
  vendorSellables,
  vendorView,
  type SellLine,
  type ShelfLine,
} from "./shelf";

/**
 * The three things that happen across a counter, as pure functions over
 * GameState.
 *
 * Every one of them re-derives its own price through ./shelf.ts rather
 * than taking a number from the caller. A screen cannot charge a price
 * it made up, a stale render cannot buy at yesterday's figure, and the
 * refusals are typed (EconomyError) so the UI prints the counter's own
 * reason instead of inventing one.
 */

export interface BuyResult {
  state: GameState;
  line: ShelfLine;
  /** What was actually paid, after every modifier. */
  paid: number;
}

/**
 * Buys one copy off a line. Stock is checked before credits, so "the
 * hook is empty" never reads as "you cannot afford it", and the sale is
 * booked into this act's ledger — which is the whole of the restock
 * rule, since a ledger only counts against the act it was written in.
 */
export function buyFromVendor(
  state: GameState,
  vendorId: string,
  entryId: string,
  world: WorldState = deriveWorldState(state),
): BuyResult {
  const vendor = requireVendor(vendorId);
  const line = shelfLine(state, vendor.id, entryId, world);
  if (!line) {
    throw new EconomyError(
      "unknown-entry",
      `Nothing called "${entryId}" is on this shelf`,
    );
  }
  if (line.remaining <= 0) {
    throw new EconomyError(
      "out-of-stock",
      `${line.item.name} is sold out until the city turns over`,
    );
  }
  const price = line.quote.price;
  if (state.credits < price) {
    throw new EconomyError(
      "insufficient-credits",
      `${line.item.name} is ${price} cr; you have ${state.credits}`,
    );
  }
  const act = vendorView(state, vendor.id).act;
  return {
    state: {
      ...state,
      credits: state.credits - price,
      inventory: addItem(state.inventory, line.item.id, 1),
      vendors: recordSale(state.vendors, vendor.id, act, entryId, 1),
    },
    line,
    paid: price,
  };
}

export interface SellResult {
  state: GameState;
  line: SellLine;
  /** What the counter actually handed over. */
  received: number;
}

/**
 * Sells one carried copy. Addressed by stack index, because a modded
 * weapon and a bare one of the same id are two different objects and
 * only one of them is worth what the quote says.
 *
 * The counter keeps what it buys: a sold copy is gone, parts and all.
 * Nothing goes back on the shelf — a run cannot launder its own gear
 * into stock, and the sale never touches the act's stock counts.
 */
export function sellToVendor(
  state: GameState,
  vendorId: string,
  stackIndex: number,
): SellResult {
  const vendor = requireVendor(vendorId);
  const line = vendorSellables(state, vendor.id).find(
    (candidate) => candidate.stackIndex === stackIndex,
  );
  if (!line) {
    const carried = state.inventory.stacks[stackIndex];
    const name = carried ? getItem(carried.itemId)?.name : undefined;
    throw new EconomyError(
      "not-for-sale",
      name
        ? `Nobody in this city buys ${name}`
        : `Nothing carried in stack ${stackIndex}`,
    );
  }
  const taken = takeCopy(state.inventory, stackIndex);
  return {
    state: {
      ...state,
      credits: state.credits + line.quote.price,
      inventory: taken.inventory,
    },
    line,
    received: line.quote.price,
  };
}

export interface HaggleResult {
  state: GameState;
  attempt: HaggleAttempt;
  won: boolean;
}

/**
 * Argues the price. One attempt per counter per act, Cool-gated, and
 * written to the ledger the moment it is made — winning shifts every
 * price at this counter for the rest of the act, losing stops the
 * counter moving until the act turns over.
 *
 * The roll comes from the transaction context (counter, act, run seed),
 * never from the live RNG stream, so the same run at the same counter
 * in the same chapter always gets the same answer.
 */
export function haggleWithVendor(
  state: GameState,
  vendorId: string,
): HaggleResult {
  const vendor = requireVendor(vendorId);
  const view = vendorView(state, vendor.id);
  if (!canHaggle(view.ledger)) {
    throw view.ledger.haggle === "won"
      ? new EconomyError(
          "haggle-spent",
          `You have already talked ${vendor.keeper} down this chapter`,
        )
      : new EconomyError(
          "haggle-locked",
          `${vendor.keeper} is not moving on price again this chapter`,
        );
  }
  const cool = effectiveStats(state.player).cool;
  if (!canAttemptHaggle(cool)) {
    throw new EconomyError(
      "too-cold-to-haggle",
      `Talking a price down takes Cool ${HAGGLE.minCool}; yours is ${cool}`,
    );
  }
  const attempt = haggleAttempt(
    { vendorId: vendor.id, act: view.act, seed: state.rng.seed },
    cool,
  );
  return {
    state: {
      ...state,
      vendors: recordHaggle(state.vendors, vendor.id, view.act, attempt.won),
    },
    attempt,
    won: attempt.won,
  };
}
