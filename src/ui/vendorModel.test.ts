import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { HAGGLE, itemValue, type VendorId } from "../data/economy";
import { VENDOR_STOCK } from "../data/world";
import { buyFromVendor, haggleWithVendor } from "../economy";
import { haggleAttempt } from "../economy/haggle";
import { addItem, effectiveStats } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { adjustReputation } from "../state/reputation";
import { creditDelta, priceView, vendorModel } from "./vendorModel";

/**
 * The two figures the risk-premium rows are made of, read off the
 * content rather than written down here — an economy balance pass moves
 * both, and neither is what these tests are about.
 */
const RAIL_WORTH = itemValue("wpn-rail-spitter");
const HOT_PREMIUM =
  VENDOR_STOCK.find((entry) => entry.id === "buy-rail-spitter-hot")?.premium ??
  0;


/**
 * The counter screen, as data. What is pinned here is what a player can
 * *read*: the price, the reasons for it adding up to it, what is left
 * on the shelf, and where the argument stands.
 */

const STALL: VendorId = "wet-market-back";
const LEDGER: VendorId = "vm-broker-counter";

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = createNewGame({
    character: fixtureCharacter({ backgroundId: "tower-analyst" }),
    seed: 1,
  });
  return {
    ...base,
    credits: 400,
    flags: { ...base.flags, "act1-complete": true },
    ...overrides,
  };
}

function seedWhere(won: boolean, vendorId: VendorId, act: number, cool: number) {
  for (let seed = 1; seed < 5000; seed++) {
    if (haggleAttempt({ vendorId, act, seed }, cool).won === won) return seed;
  }
  throw new Error("no such seed");
}

describe("the price view", () => {
  it("signs a modifier the way it moved", () => {
    expect(creditDelta(100)).toBe("+100 cr");
    expect(creditDelta(-32)).toBe("−32 cr");
  });

  it("reads as worth, reasons, and what changes hands", () => {
    const state = makeState();
    const row = vendorModel(state, STALL).buy.find(
      (candidate) => candidate.entryId === "buy-rail-spitter-hot",
    );
    // Nothing is hot on a clean run, so the plain line is the one shown.
    expect(row).toBeUndefined();

    const hot = vendorModel(
      makeState({ flags: { "act1-complete": true, "kept-spike": true } }),
      STALL,
    ).buy.find((candidate) => candidate.entryId === "buy-rail-spitter-hot");
    expect(hot?.price.base).toBe(RAIL_WORTH);
    expect(hot?.price.price).toBe(RAIL_WORTH + HOT_PREMIUM);
    expect(hot?.price.label).toBe(`${RAIL_WORTH + HOT_PREMIUM} cr`);
    expect(hot?.price.baseLabel).toBe(`Worth ${RAIL_WORTH} cr`);
    expect(hot?.price.lines).toEqual([
      { label: "Risk premium", amount: `+${HOT_PREMIUM} cr` },
    ]);
    expect(hot?.price.summary).toBe(
      `Worth ${RAIL_WORTH} cr · Risk premium +${HOT_PREMIUM} cr · ` +
        `You pay ${RAIL_WORTH + HOT_PREMIUM} cr`,
    );
    expect(hot?.note).toBe("They know what you kept.");
  });

  it("says nothing about a price nobody has moved", () => {
    const row = vendorModel(makeState(), STALL).buy.find(
      (candidate) => candidate.entryId === "buy-ghostline-mantle",
    );
    expect(row?.price.adjusted).toBe(false);
    expect(row?.price.lines).toEqual([]);
  });

  it("adds its own lines up to its own figure", () => {
    const state = makeState({
      credits: 4000,
      flags: { "act1-complete": true, "kept-spike": true },
    });
    const trusted: GameState = {
      ...state,
      reputation: adjustReputation(state.reputation, "court", 70),
    };
    for (const row of vendorModel(trusted, STALL).buy) {
      const moved = row.price.lines.reduce(
        (sum, line) => sum + Number(line.amount.replace("−", "-").replace(" cr", "")),
        0,
      );
      expect(row.price.base + moved, row.entryId).toBe(row.price.price);
    }
  });
});

describe("the shelf", () => {
  it("greys what the run cannot afford, and says what is left", () => {
    const state = makeState({ credits: 0 });
    const row = state && vendorModel(state, STALL).buy[0];
    expect(row?.affordable).toBe(false);
    expect(row?.buyable).toBe(false);
    expect(row?.stockLabel).toBe("1 of 1 left this chapter");
  });

  it("shows a sold-out line as sold out rather than hiding it", () => {
    const state = makeState({ credits: 4000 });
    const after = buyFromVendor(state, STALL, "buy-ghostline-mantle").state;
    const row = vendorModel(after, STALL).buy.find(
      (candidate) => candidate.entryId === "buy-ghostline-mantle",
    );
    expect(row?.stockLabel).toBe("Sold out this chapter");
    expect(row?.buyable).toBe(false);
  });

  it("names the counter, its kind, its books and the chapter", () => {
    const model = vendorModel(makeState(), LEDGER);
    expect(model.title).toBe("Quill's ledger");
    expect(model.keeper).toBe("Quill");
    expect(model.kindLabel).toBe(
      "Bonded counter · keeps The Vertical Market's books",
    );
    expect(model.actLabel).toBe("Act 2 — The Cordon");
    expect(model.standingLabel).toBeNull();
  });

  it("says what a trusted face is worth here", () => {
    const base = makeState();
    const model = vendorModel(
      { ...base, reputation: adjustReputation(base.reputation, "court", 70) },
      STALL,
    );
    expect(model.standingLabel).toBe("Trusted here — 12% either way");
  });
});

describe("the bag", () => {
  it("lists what the counter would take, priced and conditioned", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "out-ghostline-mantle"),
    };
    const row = vendorModel(state, LEDGER, "sell").sell.find(
      (candidate) => candidate.itemId === "out-ghostline-mantle",
    );
    expect(row?.conditionLabel).toBe("Second-hand");
    expect(row?.price.price).toBeGreaterThan(0);
    expect(row?.price.summary).toContain("You get");
  });

  it("leaves story papers off the counter entirely", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "msc-auric-writ"),
    };
    expect(
      vendorModel(state, LEDGER, "sell").sell.some(
        (row) => row.itemId === "msc-auric-writ",
      ),
    ).toBe(false);
  });
});

describe("the argument", () => {
  it("quotes the odds before it is made", () => {
    const state = makeState();
    const cool = effectiveStats(state.player).cool;
    expect(cool).toBeGreaterThanOrEqual(HAGGLE.minCool);
    const haggle = vendorModel(state, STALL).haggle;
    expect(haggle.state).toBe("none");
    expect(haggle.canTry).toBe(true);
    expect(haggle.chanceLabel).toMatch(/^\d+%$/);
  });

  it("says why a face too cold cannot try", () => {
    const cold = createNewGame({
      character: fixtureCharacter({
        backgroundId: "grid-diver",
        allocation: { body: 8, reflexes: 8, tech: 5, cool: 3, intelligence: 6 },
      }),
      seed: 2,
    });
    const haggle = vendorModel(cold, STALL).haggle;
    expect(haggle.canTry).toBe(false);
    expect(haggle.chanceLabel).toBeNull();
    expect(haggle.hint).toContain(`Cool ${HAGGLE.minCool}`);
  });

  it("shows a won argument as spent, and holding", () => {
    const cool = effectiveStats(makeState().player).cool;
    const state = makeState({ rng: { seed: seedWhere(true, STALL, 2, cool) } });
    const after = haggleWithVendor(state, STALL).state;
    const model = vendorModel(after, STALL);
    expect(model.haggle.state).toBe("won");
    expect(model.haggle.canTry).toBe(false);
    expect(model.haggle.label).toBe("Price argued down");
    // And the shelf shows the shift, itemized.
    const row = model.buy.find((line) => line.entryId === "buy-ghostline-mantle");
    expect(row?.price.lines.map((line) => line.label)).toContain("Haggled");
  });

  it("shows a lost argument as a counter that stopped moving", () => {
    const cool = effectiveStats(makeState().player).cool;
    const state = makeState({ rng: { seed: seedWhere(false, STALL, 2, cool) } });
    const after = haggleWithVendor(state, STALL).state;
    const model = vendorModel(after, STALL);
    expect(model.haggle.state).toBe("locked");
    expect(model.haggle.canTry).toBe(false);
    expect(model.haggle.hint).toContain("not discussing price again");
    expect(
      model.buy.every((row) => !row.price.lines.some((l) => l.label === "Haggled")),
    ).toBe(true);
  });

  it("is a fresh argument in the next chapter", () => {
    const cool = effectiveStats(makeState().player).cool;
    const state = makeState({ rng: { seed: seedWhere(false, STALL, 2, cool) } });
    const locked = haggleWithVendor(state, STALL).state;
    const nextAct: GameState = {
      ...locked,
      flags: { ...locked.flags, "act2-complete": true },
    };
    expect(vendorModel(nextAct, STALL).haggle.canTry).toBe(true);
  });
});

describe("priceView", () => {
  it("is a pure read of a quote", () => {
    const view = priceView({
      side: "sell",
      itemId: "wpn-rail-spitter",
      base: 320,
      lines: [{ id: "spread", label: "Street stall resale rate", amount: -218 }],
      price: 102,
    });
    expect(view.label).toBe("102 cr");
    expect(view.lines).toEqual([
      { label: "Street stall resale rate", amount: "−218 cr" },
    ]);
    expect(view.summary).toBe(
      "Worth 320 cr · Street stall resale rate −218 cr · You get 102 cr",
    );
  });
});
