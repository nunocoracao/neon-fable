import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { vendorChoices, type WorldConditionId } from "../data/world";
import { requireNode } from "../narrative/engine";
import { availableChoices } from "../narrative/engine";
import { introArc } from "../data/story";
import { createNewGame, type GameState } from "../state";
import { adjustReputation } from "../state/reputation";
import { deriveWorldState, worldOf } from "./state";
import { vendorCatalog, vendorPrice, vendorStock } from "./vendor";

/**
 * Stock variation, and the promise that the shelf the selector reports
 * and the shelf the player is offered are the same shelf.
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
    expect(vendorPrice(VENDOR, "wpn-rail-spitter", worldOf("streets-calm"))).toBe(
      320,
    );
  });

  it("charges for the risk once the spike never came back", () => {
    const hot = stockIds("package-loose", "warrant-clear");
    expect(hot).toContain("buy-rail-spitter-hot");
    expect(hot).not.toContain("buy-rail-spitter");
    expect(vendorPrice(VENDOR, "wpn-rail-spitter", worldOf("package-loose"))).toBe(
      420,
    );
    // Exactly one price for one item, whichever way the run went.
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
    expect(vendorPrice(VENDOR, "cyb-warden-optics", worldOf("warrant-out"))).toBe(
      undefined,
    );
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
 * The seam that matters: the generated choices carry each entry's own
 * condition requirements verbatim, so what the engine offers a player
 * standing at the counter is what the selector says is on the shelf.
 */
describe("the shop offers exactly what the world stocks", () => {
  const shelf = requireNode(introArc, "wet-market-back");

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
      const offered = availableChoices(state, shelf)
        .map((p) => p.choice.id)
        .filter((id) => id.startsWith("buy-"));
      expect(offered).toEqual(vendorStock(VENDOR, world).map((e) => e.id));
    });
  }

  it("agrees with the boards' favour too", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      reputation: adjustReputation(base.reputation, "market", 40),
    };
    const offered = availableChoices(state, shelf)
      .map((p) => p.choice.id)
      .filter((id) => id.startsWith("buy-"));
    expect(offered).toContain("buy-spindle-projector");
    expect(offered).toEqual(
      vendorStock(VENDOR, deriveWorldState(state)).map((e) => e.id),
    );
  });

  it("still greys an affordable-only gate rather than hiding it", () => {
    // Broke, but the shelf itself is open: the price is shown, disabled.
    const broke: GameState = { ...makeState(), credits: 0 };
    const presented = availableChoices(broke, shelf).filter((p) =>
      p.choice.id.startsWith("buy-"),
    );
    const mantle = presented.find((p) => p.choice.id === "buy-ghostline-mantle");
    expect(mantle?.enabled).toBe(false);
  });

  it("builds the node's choices from the catalog, plus the way out", () => {
    expect(shelf.choices.map((c) => c.id)).toEqual([
      ...vendorChoices(VENDOR, "wet-market-back").map((c) => c.id),
      "done",
    ]);
  });
});
