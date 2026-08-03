import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../../character/testSupport";
import {
  ITEM_VALUES,
  STANDING_DISCOUNTS,
  itemValue,
  tradeable,
  vendors,
  type VendorId,
} from "../../data/economy";
import { getItem } from "../../data/items";
import { VENDOR_STOCK, type WorldConditionId } from "../../data/world";
import { createNewGame, type GameState } from "../../state";
import { adjustReputation } from "../../state/reputation";
import { recordHaggle } from "../../state/vendors";
import { addItem } from "../../inventory/inventory";
import { worldOf } from "../../world/state";
import { buyFromVendor, sellToVendor } from "../counter";
import { vendorSellables, vendorShelf } from "../shelf";

/**
 * The no-exploit sweep, at the level a player actually plays at.
 *
 * ../price.test.ts already proves the *arithmetic* cannot be pumped:
 * over every priced item, every counter, every condition, every
 * standing and a won argument, the dearest sale stays under the
 * cheapest purchase. What it cannot prove is that the shipped
 * transaction agrees — a shelf's risk premium, a stock ledger, a
 * standing resolved from the reputation table and a haggle recorded
 * against the act all sit between `priceQuote` and a player's credits.
 *
 * So this file buys and sells for real, through `buyFromVendor` and
 * `sellToVendor`, across the whole v2 shelf, and asserts the loop is
 * loss-making every time. Property-style: the matrix is generated from
 * the content, so a new line, a new counter or a new item is swept the
 * day it lands rather than the day somebody remembers to add it.
 */

/**
 * Every world condition a shelf gates on, all at once. Mutually
 * exclusive in a real run — a spike cannot be both delivered and loose —
 * and deliberately not here: the point is to put every line the game can
 * ever stock in front of the sweep at the same time.
 */
const EVERY_CONDITION: readonly WorldConditionId[] = [
  "package-delivered",
  "package-loose",
  "streets-calm",
  "court-ascendant",
  "syndicate-street",
  "broadcast-loose",
  "cordon-broken",
  "warrant-clear",
  "market-favoured",
  "charter-signed",
  "steps-free",
  "basin-partnered",
  "city-settled",
];

const OPEN_WORLD = worldOf(...EVERY_CONDITION);

/** Rich enough that nothing in the sweep is refused for want of credits. */
const DEEP_POCKETS = 100_000;

function makeState(): GameState {
  const state = createNewGame({ character: fixtureCharacter({}), seed: 1 });
  return {
    ...state,
    credits: DEEP_POCKETS,
    flags: { ...state.flags, "act1-complete": true },
  };
}

/** The same run, as warm with every faction as the bands go. */
function withBestStanding(state: GameState): GameState {
  let reputation = state.reputation;
  for (const vendor of vendors) {
    reputation = adjustReputation(reputation, vendor.faction, 100);
  }
  return { ...state, reputation };
}

/** The same run, with a won argument live at every counter. */
function withWonArguments(state: GameState, act = 1): GameState {
  let ledger = state.vendors;
  for (const vendor of vendors) {
    ledger = recordHaggle(ledger, vendor.id, act, true);
  }
  return { ...state, vendors: ledger };
}

/** Every shape of buyer the price model knows how to be kind to. */
const BUYERS: ReadonlyArray<[string, (state: GameState) => GameState]> = [
  ["plain", (state) => state],
  ["trusted", withBestStanding],
  ["argued", (state) => withWonArguments(state)],
  ["trusted+argued", (state) => withWonArguments(withBestStanding(state))],
];

describe("the round trip is always a loss", () => {
  it("puts every line the city can stock in front of the sweep", () => {
    // A guard on the sweep itself: if a `requires` condition is added
    // and not listed above, the line silently drops out and the loop it
    // might open goes unswept.
    const stocked = new Set(
      vendors.flatMap((vendor) =>
        vendorShelf(makeState(), vendor.id, OPEN_WORLD).map(
          (line) => line.entry.id,
        ),
      ),
    );
    const missing = VENDOR_STOCK.filter((entry) => !stocked.has(entry.id));
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it("actually makes the kind buyer kinder — the sweep is not vacuous", () => {
    // Standing and a won argument have to be live for the loop above to
    // be testing anything; a reputation table that stopped resolving
    // would turn the whole file green and prove nothing.
    const plain = vendorShelf(makeState(), "wet-market-back", OPEN_WORLD);
    const kind = vendorShelf(
      withWonArguments(withBestStanding(makeState())),
      "wet-market-back",
      OPEN_WORLD,
    );
    expect(plain.length).toBeGreaterThan(0);
    for (const [index, line] of plain.entries()) {
      expect(kind[index]?.quote.price, line.entry.id).toBeLessThan(
        line.quote.price,
      );
    }
  });

  it("never pays back what it charged, on any line, for any buyer", () => {
    for (const [label, shape] of BUYERS) {
      const state = shape(makeState());
      for (const vendor of vendors) {
        for (const line of vendorShelf(state, vendor.id, OPEN_WORLD)) {
          const bought = buyFromVendor(state, vendor.id, line.entry.id, OPEN_WORLD);
          // Sell it straight back at the counter that pays best for it,
          // which is the loop a player would actually try.
          for (const back of vendors) {
            const offer = vendorSellables(bought.state, back.id).find(
              (candidate) => candidate.itemId === line.item.id,
            );
            if (!offer) continue;
            const sold = sellToVendor(bought.state, back.id, offer.stackIndex);
            expect(
              sold.state.credits,
              `${label}: ${line.entry.id} at ${vendor.id} → ${back.id}`,
            ).toBeLessThan(state.credits);
          }
        }
      }
    }
  });

  it("does not put a sold copy back on the shelf to be sold again", () => {
    const state = makeState();
    const vendorId: VendorId = "wet-market-back";
    const before = vendorShelf(state, vendorId, OPEN_WORLD);
    const line = before[0];
    if (!line) throw new Error("the back shelf is empty");
    const bought = buyFromVendor(state, vendorId, line.entry.id, OPEN_WORLD);
    const offer = vendorSellables(bought.state, vendorId).find(
      (candidate) => candidate.itemId === line.item.id,
    );
    if (!offer) throw new Error("the counter will not take its own stock back");
    const sold = sellToVendor(bought.state, vendorId, offer.stackIndex);
    const after = vendorShelf(sold.state, vendorId, OPEN_WORLD).find(
      (candidate) => candidate.entry.id === line.entry.id,
    );
    expect(after?.remaining).toBe(line.remaining - 1);
  });
});

describe("no part of the v2 item set opens a loop", () => {
  const PRICED = Object.keys(ITEM_VALUES).filter(tradeable);
  const WEAPONS = PRICED.filter((id) => getItem(id)?.kind === "weapon");
  const MODS = PRICED.filter((id) => getItem(id)?.kind === "mod");

  it("cannot be pumped by fitting any part into any weapon", () => {
    // The full matrix, rather than the one hand-picked pair the price
    // tests use: a fitted weapon is worth its own worth plus its parts',
    // and every counter pays a fraction of that.
    const state = withWonArguments(withBestStanding(makeState()));
    let checked = 0;
    for (const weaponId of WEAPONS) {
      for (const modId of MODS) {
        const carrying: GameState = {
          ...state,
          inventory: {
            ...state.inventory,
            stacks: [{ itemId: weaponId, quantity: 1, mods: [modId] }],
          },
        };
        const offer = vendorSellables(carrying, "vm-broker-counter").find(
          (candidate) => candidate.itemId === weaponId,
        );
        if (!offer) continue;
        checked += 1;
        expect(offer.quote.price, `${weaponId} + ${modId}`).toBeLessThan(
          itemValue(weaponId) + itemValue(modId),
        );
      }
    }
    // The matrix is real, not an empty loop dressed as a proof.
    expect(checked).toBe(WEAPONS.length * MODS.length);
  });

  it("keeps every priced item worth less sold than bought, everywhere", () => {
    // The cross-counter statement, swept over the shipped transaction
    // rather than the quote: the best price any counter will pay a
    // maximally-liked, freshly-argued player is still under the worst
    // price the cheapest counter charges them.
    const rich = withWonArguments(withBestStanding(makeState()));
    for (const itemId of PRICED) {
      let dearestSale = -Infinity;
      for (const vendor of vendors) {
        const carrying: GameState = {
          ...rich,
          inventory: addItem(rich.inventory, itemId),
        };
        const offer = vendorSellables(carrying, vendor.id).find(
          (candidate) => candidate.itemId === itemId,
        );
        if (offer) dearestSale = Math.max(dearestSale, offer.quote.price);
      }
      if (dearestSale === -Infinity) continue;
      let cheapestBuy = Infinity;
      for (const vendor of vendors) {
        for (const line of vendorShelf(rich, vendor.id, OPEN_WORLD)) {
          if (line.item.id !== itemId) continue;
          cheapestBuy = Math.min(cheapestBuy, line.quote.price);
        }
      }
      if (cheapestBuy === Infinity) continue;
      expect(dearestSale, `${itemId} round trip`).toBeLessThan(cheapestBuy);
    }
  });

  it("cannot be argued or befriended into profit", () => {
    // The two modifiers that move a price the player's way, at full
    // strength on both sides at once. If any stack of kindness could
    // flip the sign, it would be this one.
    const best = STANDING_DISCOUNTS[STANDING_DISCOUNTS.length - 1];
    expect(best).toBeDefined();
    const rich = withWonArguments(withBestStanding(makeState()));
    for (const vendor of vendors) {
      for (const line of vendorShelf(rich, vendor.id, OPEN_WORLD)) {
        const carrying: GameState = {
          ...rich,
          inventory: addItem(rich.inventory, line.item.id),
        };
        const offer = vendorSellables(carrying, vendor.id).find(
          (candidate) => candidate.itemId === line.item.id,
        );
        if (!offer) continue;
        expect(
          offer.quote.price,
          `${vendor.id}/${line.entry.id}`,
        ).toBeLessThan(line.quote.price);
      }
    }
  });
});
