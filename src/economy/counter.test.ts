import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import {
  EconomyError,
  HAGGLE,
  ITEM_VALUES,
  STANDING_DISCOUNTS,
  itemValue,
  tradeable,
  vendors,
  type VendorId,
} from "../data/economy";
import { getItem } from "../data/items";
import { VENDOR_STOCK, type WorldConditionId } from "../data/world";
import { addGear, addItem, countItem, effectiveStats } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { adjustReputation } from "../state/reputation";
import { emptyVendors, ledgerFor, recordHaggle } from "../state/vendors";
import { worldOf } from "../world/state";
import { haggleAttempt } from "./haggle";
import { buyFromVendor, haggleWithVendor, sellToVendor } from "./counter";
import { shelfLine, vendorSellables, vendorShelf, vendorView } from "./shelf";

/**
 * The three moves across a counter, and the promises they keep: the
 * price charged is the price shown, stock runs out and comes back with
 * the chapter, and an argument happens once.
 */

const STALL: VendorId = "wet-market-back";
const LEDGER: VendorId = "vm-broker-counter";

/** A run with money, a face, and a chapter behind it. */
function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = createNewGame({
    character: fixtureCharacter({ backgroundId: "tower-analyst" }),
    seed: 1,
  });
  return {
    ...base,
    credits: 2000,
    flags: { ...base.flags, "act1-complete": true },
    ...overrides,
  };
}

/** A seed whose argument at this counter lands the way the test needs. */
function seedWhere(
  won: boolean,
  vendorId: VendorId,
  act: number,
  cool: number,
): number {
  for (let seed = 1; seed < 5000; seed++) {
    if (haggleAttempt({ vendorId, act, seed }, cool).won === won) return seed;
  }
  throw new Error(`no seed with a ${won ? "won" : "lost"} argument`);
}

describe("buying", () => {
  it("charges exactly what the shelf quoted, and hands the thing over", () => {
    const state = makeState();
    const line = shelfLine(state, STALL, "buy-ghostline-mantle");
    expect(line).toBeDefined();
    const result = buyFromVendor(state, STALL, "buy-ghostline-mantle");
    expect(result.paid).toBe(line?.quote.price);
    expect(result.state.credits).toBe(state.credits - result.paid);
    expect(countItem(result.state.inventory, "out-ghostline-mantle")).toBe(1);
  });

  it("books the copy out of this act's stock", () => {
    const state = makeState();
    const before = shelfLine(state, STALL, "buy-ghostline-mantle");
    expect(before?.remaining).toBe(1);
    const after = buyFromVendor(state, STALL, "buy-ghostline-mantle").state;
    expect(shelfLine(after, STALL, "buy-ghostline-mantle")?.remaining).toBe(0);
    // Sold out is still on the shelf; an empty hook is information.
    expect(
      vendorShelf(after, STALL).map((line) => line.entry.id),
    ).toContain("buy-ghostline-mantle");
  });

  it("refuses a second copy of a one-per-act line", () => {
    const once = buyFromVendor(makeState(), STALL, "buy-ghostline-mantle").state;
    expect(() => buyFromVendor(once, STALL, "buy-ghostline-mantle")).toThrow(
      EconomyError,
    );
    try {
      buyFromVendor(once, STALL, "buy-ghostline-mantle");
    } catch (error) {
      expect((error as EconomyError).code).toBe("out-of-stock");
    }
  });

  it("restocks when the chapter turns over, not when anybody asks", () => {
    const state = makeState();
    const sold = buyFromVendor(state, STALL, "buy-ghostline-mantle").state;
    expect(shelfLine(sold, STALL, "buy-ghostline-mantle")?.remaining).toBe(0);

    // Act 2 ends. Nothing fires; the ledger simply stops being this
    // act's ledger, and the shelf reads full again.
    const nextAct: GameState = {
      ...sold,
      flags: { ...sold.flags, "act2-complete": true },
    };
    expect(shelfLine(nextAct, STALL, "buy-ghostline-mantle")?.remaining).toBe(1);
    expect(() =>
      buyFromVendor(nextAct, STALL, "buy-ghostline-mantle"),
    ).not.toThrow();
  });

  it("puts out a whole case of a line the table restocks deeper", () => {
    // Quill's patches: three in act 1, four from act 2 onwards.
    const act1 = makeState({ flags: {} });
    expect(shelfLine(act1, LEDGER, "quill-patch")?.remaining).toBe(3);
    const act2 = makeState();
    expect(shelfLine(act2, LEDGER, "quill-patch")?.remaining).toBe(4);

    let running = act2;
    for (let i = 0; i < 4; i++) {
      running = buyFromVendor(running, LEDGER, "quill-patch").state;
    }
    expect(countItem(running.inventory, "con-trauma-patch")).toBe(4);
    expect(shelfLine(running, LEDGER, "quill-patch")?.remaining).toBe(0);
  });

  it("says the shelf is empty before it says you are broke", () => {
    const broke = { ...makeState(), credits: 0 };
    expect(() => buyFromVendor(broke, STALL, "buy-ghostline-mantle")).toThrow(
      /is \d+ cr; you have 0/,
    );
    const sold = buyFromVendor(makeState(), STALL, "buy-ghostline-mantle").state;
    const soldAndBroke = { ...sold, credits: 0 };
    try {
      buyFromVendor(soldAndBroke, STALL, "buy-ghostline-mantle");
    } catch (error) {
      expect((error as EconomyError).code).toBe("out-of-stock");
    }
  });

  it("refuses a line the city has taken off the shelf", () => {
    // The Torsion Frame only reaches the street once the Cordon falls.
    const state = makeState();
    try {
      buyFromVendor(state, STALL, "buy-torsion-frame");
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as EconomyError).code).toBe("unknown-entry");
    }
  });

  it("refuses a counter nobody keeps", () => {
    expect(() =>
      buyFromVendor(makeState(), "nobody-at-all", "buy-cordon-plate"),
    ).toThrow(EconomyError);
  });
});

describe("selling", () => {
  it("pays the quoted price and takes the copy", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "out-ghostline-mantle"),
    };
    const line = vendorSellables(state, LEDGER).find(
      (candidate) => candidate.itemId === "out-ghostline-mantle",
    );
    expect(line).toBeDefined();
    const result = sellToVendor(state, LEDGER, line!.stackIndex);
    expect(result.received).toBe(line?.quote.price);
    expect(result.state.credits).toBe(state.credits + result.received);
    expect(countItem(result.state.inventory, "out-ghostline-mantle")).toBe(0);
  });

  it("pays less on the street than across a bonded counter", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "out-ghostline-mantle"),
    };
    const atStall = vendorSellables(state, STALL).find(
      (line) => line.itemId === "out-ghostline-mantle",
    );
    const atLedger = vendorSellables(state, LEDGER).find(
      (line) => line.itemId === "out-ghostline-mantle",
    );
    expect(atLedger?.quote.price).toBeGreaterThan(atStall?.quote.price ?? 0);
  });

  it("pays meaningfully less than the same counter charges", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "out-ghostline-mantle"),
    };
    const buy = shelfLine(state, STALL, "buy-ghostline-mantle")?.quote.price ?? 0;
    const sell =
      vendorSellables(state, STALL).find(
        (line) => line.itemId === "out-ghostline-mantle",
      )?.quote.price ?? 0;
    expect(sell).toBeLessThan(buy / 2);
  });

  it("prices a fitted weapon with its parts, and keeps them", () => {
    const base = makeState();
    const bare: GameState = {
      ...base,
      inventory: addItem(base.inventory, "wpn-rail-spitter"),
    };
    const scoped: GameState = {
      ...base,
      inventory: addGear(base.inventory, "wpn-rail-spitter", {
        mods: ["mod-smartlink-sight", null],
      }),
    };
    const bareQuote = vendorSellables(bare, LEDGER)[0];
    const scopedQuote = vendorSellables(scoped, LEDGER)[0];
    expect(scopedQuote?.fittedValue).toBe(itemValue("mod-smartlink-sight"));
    expect(scopedQuote?.quote.price).toBeGreaterThan(bareQuote?.quote.price ?? 0);

    // The counter keeps what it buys, parts and all — nothing returns
    // to the bag, and nothing returns to the shelf.
    const sold = sellToVendor(scoped, LEDGER, scopedQuote!.stackIndex).state;
    expect(countItem(sold.inventory, "wpn-rail-spitter")).toBe(0);
    expect(countItem(sold.inventory, "mod-smartlink-sight")).toBe(0);
  });

  it("will not take a story paper at any price", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "msc-auric-writ"),
    };
    expect(
      vendorSellables(state, LEDGER).some(
        (line) => line.itemId === "msc-auric-writ",
      ),
    ).toBe(false);
    const index = state.inventory.stacks.findIndex(
      (stack) => stack.itemId === "msc-auric-writ",
    );
    try {
      sellToVendor(state, LEDGER, index);
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as EconomyError).code).toBe("not-for-sale");
    }
  });

  it("never lists what the player is wearing", () => {
    const state = makeState();
    const worn = state.player.equipment.outfit;
    expect(worn).not.toBeNull();
    expect(
      vendorSellables(state, LEDGER).some((line) => line.itemId === worn),
    ).toBe(false);
  });
});

describe("haggling", () => {
  const COOL = () =>
    effectiveStats(fixtureCharacter({ backgroundId: "tower-analyst" })).cool;

  it("shifts every price at the counter once it lands", () => {
    const cool = COOL();
    const state = makeState({ rng: { seed: seedWhere(true, STALL, 2, cool) } });
    const before = shelfLine(state, STALL, "buy-ghostline-mantle")?.quote.price;
    const result = haggleWithVendor(state, STALL);
    expect(result.won).toBe(true);
    const after = shelfLine(result.state, STALL, "buy-ghostline-mantle");
    expect(after?.quote.price).toBe(
      Math.round((before ?? 0) * (1 - HAGGLE.step)),
    );
    expect(
      after?.quote.lines.some((line) => line.id === "haggle"),
    ).toBe(true);
    // And it holds on the way back out, too.
    const sellState: GameState = {
      ...result.state,
      inventory: addItem(result.state.inventory, "out-ghostline-mantle"),
    };
    const quoted = vendorSellables(sellState, STALL).find(
      (line) => line.itemId === "out-ghostline-mantle",
    );
    expect(quoted?.quote.lines.some((line) => line.id === "haggle")).toBe(true);
  });

  it("locks the counter for the chapter when it fails", () => {
    const cool = COOL();
    const state = makeState({ rng: { seed: seedWhere(false, STALL, 2, cool) } });
    const before = shelfLine(state, STALL, "buy-ghostline-mantle")?.quote.price;
    const result = haggleWithVendor(state, STALL);
    expect(result.won).toBe(false);
    expect(ledgerFor(result.state.vendors, STALL, 2).haggle).toBe("locked");
    expect(shelfLine(result.state, STALL, "buy-ghostline-mantle")?.quote.price).toBe(
      before,
    );
    try {
      haggleWithVendor(result.state, STALL);
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as EconomyError).code).toBe("haggle-locked");
    }
  });

  it("gives one go per counter per chapter, and no more", () => {
    const cool = COOL();
    const state = makeState({ rng: { seed: seedWhere(true, STALL, 2, cool) } });
    const won = haggleWithVendor(state, STALL).state;
    try {
      haggleWithVendor(won, STALL);
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as EconomyError).code).toBe("haggle-spent");
    }
    // The counter on the boards has not heard any of this.
    expect(() => haggleWithVendor(won, LEDGER)).not.toThrow();
  });

  it("comes back when the chapter does", () => {
    const cool = COOL();
    const state = makeState({ rng: { seed: seedWhere(false, STALL, 2, cool) } });
    const locked = haggleWithVendor(state, STALL).state;
    const nextAct: GameState = {
      ...locked,
      flags: { ...locked.flags, "act2-complete": true },
    };
    expect(() => haggleWithVendor(nextAct, STALL)).not.toThrow();
  });

  it("cannot be re-rolled by reloading before the click", () => {
    const cool = COOL();
    const state = makeState({ rng: { seed: seedWhere(false, STALL, 2, cool) } });
    // The roll is a function of the counter, the chapter and the run —
    // not of the live RNG stream — so the same save always argues the
    // same way.
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(haggleWithVendor(state, STALL).won).toBe(false);
    }
  });

  it("refuses a face too cold to try", () => {
    const cold = createNewGame({
      character: fixtureCharacter({
        backgroundId: "grid-diver",
        // 15 points, none of them on keeping a straight face.
      allocation: { body: 8, reflexes: 8, tech: 5, cool: 3, intelligence: 6 },
      }),
      seed: 7,
    });
    expect(effectiveStats(cold.player).cool).toBeLessThan(HAGGLE.minCool);
    try {
      haggleWithVendor({ ...cold, credits: 500 }, STALL);
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as EconomyError).code).toBe("too-cold-to-haggle");
    }
    // And a refused attempt is not an attempt: the counter is untouched.
    expect(ledgerFor(cold.vendors, STALL, 1).haggle).toBe("none");
  });
});

describe("standing", () => {
  it("charges a trusted face less and pays them more", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      reputation: adjustReputation(base.reputation, "court", 70),
      inventory: addItem(base.inventory, "out-ghostline-mantle"),
    };
    const view = vendorView(state, STALL);
    expect(view.standing?.label).toBe("Trusted here");

    const plain = shelfLine(base, STALL, "buy-ghostline-mantle")?.quote.price ?? 0;
    const trusted =
      shelfLine(state, STALL, "buy-ghostline-mantle")?.quote.price ?? 0;
    expect(trusted).toBeLessThan(plain);

    const paid =
      vendorSellables(state, STALL).find(
        (line) => line.itemId === "out-ghostline-mantle",
      )?.quote.price ?? 0;
    const plainPaid =
      vendorSellables(
        { ...base, inventory: state.inventory },
        STALL,
      ).find((line) => line.itemId === "out-ghostline-mantle")?.quote.price ?? 0;
    expect(paid).toBeGreaterThan(plainPaid);
  });

  it("is worth nothing at a counter that keeps another faction's books", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      reputation: adjustReputation(base.reputation, "court", 70),
      vendors: emptyVendors(),
    };
    expect(vendorView(state, LEDGER).standing).toBeNull();
    expect(shelfLine(state, LEDGER, "quill-patch")?.quote.price).toBe(
      shelfLine(base, LEDGER, "quill-patch")?.quote.price,
    );
  });

  it("takes the strongest band the run has earned", () => {
    const base = makeState();
    const warm: GameState = {
      ...base,
      reputation: adjustReputation(base.reputation, "court", 30),
    };
    const trusted: GameState = {
      ...base,
      reputation: adjustReputation(base.reputation, "court", 70),
    };
    expect(vendorView(warm, STALL).standing?.label).toBe("Known here");
    expect(
      shelfLine(trusted, STALL, "buy-ghostline-mantle")?.quote.price,
    ).toBeLessThan(
      shelfLine(warm, STALL, "buy-ghostline-mantle")?.quote.price ?? 0,
    );
  });
});

/**
 * The no-exploit sweep, at the level a player actually plays at.
 *
 * ./price.test.ts already proves the *arithmetic* cannot be pumped:
 * over every priced item, every counter, every condition, every
 * standing and a won argument, the dearest sale stays under the
 * cheapest purchase. What it cannot prove is that the shipped
 * transaction agrees — a shelf's risk premium, a stock ledger, a
 * standing resolved from the reputation table and a haggle recorded
 * against the act all sit between `priceQuote` and a player's credits.
 *
 * So this section buys and sells for real, through the same three moves
 * the rest of the file covers, across the whole v2 shelf, and asserts
 * the loop is loss-making every time. Property-style: the matrix is
 * generated from the content, so a new line, a new counter or a new
 * item is swept the day it lands rather than the day somebody remembers
 * to add it.
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

function richState(): GameState {
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
        vendorShelf(richState(), vendor.id, OPEN_WORLD).map(
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
    const plain = vendorShelf(richState(), "wet-market-back", OPEN_WORLD);
    const kind = vendorShelf(
      withWonArguments(withBestStanding(richState())),
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
      const state = shape(richState());
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
    const state = richState();
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
    const state = withWonArguments(withBestStanding(richState()));
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
    const rich = withWonArguments(withBestStanding(richState()));
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
    const rich = withWonArguments(withBestStanding(richState()));
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
