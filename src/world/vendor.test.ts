import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { type WorldConditionId } from "../data/world";
import { listPrice, vendorShelf } from "../economy";
import { requireNode } from "../narrative/engine";
import { introArc } from "../data/story";
import { createNewGame, type GameState } from "../state";
import { adjustReputation } from "../state/reputation";
import { deriveWorldState, worldOf } from "./state";
import { vendorCatalog, vendorEntry, vendorStock } from "./vendor";

/**
 * Stock variation, and the promise that the shelf the selector reports
 * and the shelf the player is shown are the same shelf.
 *
 * The counter screen is now the only door to the stall, so the seam
 * runs from `vendorStock` (what the city is letting them carry) to
 * `vendorShelf` (what the screen puts in front of this player). Prices
 * are not part of that seam at all — they are derived per player from
 * the item's worth, which is what `listPrice` reads without one.
 */

const VENDOR = "wet-market-back" as const;

function makeState(flags: GameState["flags"] = {}): GameState {
  const state = createNewGame({ character: fixtureCharacter({}), seed: 1 });
  return {
    ...state,
    credits: 5000,
    flags: { ...state.flags, "act1-complete": true, ...flags },
  };
}

const stockIds = (...conditions: readonly WorldConditionId[]): string[] =>
  vendorStock(VENDOR, worldOf(...conditions)).map((entry) => entry.id);

const priceOf = (
  itemId: string,
  ...conditions: readonly WorldConditionId[]
): number | undefined => {
  const entry = vendorEntry(VENDOR, itemId, worldOf(...conditions));
  return entry ? listPrice(VENDOR, entry) : undefined;
};

describe("vendorStock", () => {
  it("carries the shelf's ungated lines to everybody", () => {
    const base = stockIds();
    expect(base).toContain("buy-ghostline-mantle");
    expect(base).toContain("buy-cordon-plate");
  });

  it("prices the weapons at the counter rate while nothing is hot", () => {
    const calm = stockIds("streets-calm", "warrant-clear");
    expect(calm).toContain("buy-rail-spitter");
    expect(calm).not.toContain("buy-rail-spitter-hot");
    expect(priceOf("wpn-rail-spitter", "streets-calm")).toBe(320);
  });

  it("charges for the risk once the spike never came back", () => {
    const hot = stockIds("package-loose", "warrant-clear");
    expect(hot).toContain("buy-rail-spitter-hot");
    expect(hot).not.toContain("buy-rail-spitter");
    // The same weapon, the same worth, plus a flat premium for holding it.
    expect(priceOf("wpn-rail-spitter", "package-loose")).toBe(420);
    // Exactly one line for one item, whichever way the run went.
    for (const world of [worldOf("streets-calm"), worldOf("package-loose")]) {
      const rails = vendorStock(VENDOR, world).filter(
        (e) => e.itemId === "wpn-rail-spitter",
      );
      expect(rails).toHaveLength(1);
    }
  });

  it("takes corp optics off the shelf while a warrant stands", () => {
    const clear = stockIds("warrant-clear");
    expect(clear).toContain("buy-warden-optics");
    expect(clear).toContain("buy-cascade-governor");
    const wanted = stockIds("warrant-out");
    expect(wanted).not.toContain("buy-warden-optics");
    expect(wanted).not.toContain("buy-cascade-governor");
    expect(priceOf("cyb-warden-optics", "warrant-out")).toBe(undefined);
  });

  it("puts Exchange hardware on the stall once the Cordon is down", () => {
    expect(stockIds()).not.toContain("buy-torsion-frame");
    expect(stockIds("cordon-broken")).toContain("buy-torsion-frame");
  });

  it("offers market consignment only to somebody the boards vouch for", () => {
    expect(stockIds()).not.toContain("buy-spindle-projector");
    expect(stockIds("market-favoured")).toContain("buy-spindle-projector");
  });

  it("never stocks more than the catalog holds", () => {
    const catalog = vendorCatalog(VENDOR).map((e) => e.id);
    expect(catalog.length).toBeGreaterThan(stockIds().length);
    for (const id of stockIds("cordon-broken", "market-favoured", "warrant-clear")) {
      expect(catalog).toContain(id);
    }
  });
});

/**
 * The seam that matters: the screen's rows are the selector's entries,
 * in the selector's order, for every shape of run — so what a player
 * standing at the counter is offered is what the world layer says is on
 * the shelf, and neither can drift without the other.
 */
describe("the counter shows exactly what the world stocks", () => {
  const cases: Array<[string, GameState]> = [
    ["a clean run", makeState()],
    ["a kept spike", makeState({ "kept-spike": true })],
    ["a live warrant", makeState({ "wanted-by-auric": true })],
    [
      "a suspended warrant after the charter",
      makeState({ "wanted-by-auric": false, "undercroft-charter": true }),
    ],
    ["the Cordon down", makeState({ "cordon-broken": true })],
    [
      "everything at once",
      makeState({
        "kept-spike": true,
        "wanted-by-auric": true,
        "cordon-broken": true,
      }),
    ],
  ];

  for (const [name, state] of cases) {
    it(`agrees with the shelf on ${name}`, () => {
      const world = deriveWorldState(state);
      expect(vendorShelf(state, VENDOR).map((line) => line.entry.id)).toEqual(
        vendorStock(VENDOR, world).map((e) => e.id),
      );
    });
  }

  it("agrees with the boards' favour too", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      reputation: adjustReputation(base.reputation, "market", 40),
    };
    const rows = vendorShelf(state, VENDOR).map((line) => line.entry.id);
    expect(rows).toContain("buy-spindle-projector");
    expect(rows).toEqual(
      vendorStock(VENDOR, deriveWorldState(state)).map((e) => e.id),
    );
  });

  it("still shows an unaffordable line rather than hiding it", () => {
    // Broke, but the shelf itself is open: the price is shown, dead.
    const broke: GameState = { ...makeState(), credits: 0 };
    const mantle = vendorShelf(broke, VENDOR).find(
      (line) => line.entry.id === "buy-ghostline-mantle",
    );
    expect(mantle).toBeDefined();
    expect(mantle?.affordable).toBe(false);
  });

  it("reaches the counter through one door, and only one", () => {
    const shelf = requireNode(introArc, "wet-market-back");
    expect(shelf.choices.map((c) => c.id)).toEqual(["trade", "done"]);
    const opens = shelf.choices.filter((choice) =>
      (choice.effects ?? []).some(
        (effect) => effect.type === "open-vendor",
      ),
    );
    expect(opens).toHaveLength(1);
    expect(opens[0]?.target).toBe("wet-market-back");
  });
});
