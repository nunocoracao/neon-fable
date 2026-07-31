import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { CONDITION_MODIFIERS, itemValue } from "../data/economy";
import { VENDOR_STOCK } from "../data/world";
import { addItem } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { deriveWorldState, worldOf } from "../world/state";
import { vendorStock } from "../world/vendor";
import {
  conditionOf,
  listPrice,
  vendorSellables,
  vendorShelf,
  vendorView,
} from "./shelf";
import { getItem, requireItem } from "../data/items";

/**
 * The join between the world's shelf and this player's prices: what the
 * counter is carrying, what shape it is in, and what that does to the
 * number.
 */

const STALL = "wet-market-back";
const LEDGER = "vm-broker-counter";

function makeState(flags: GameState["flags"] = {}): GameState {
  const base = createNewGame({
    character: fixtureCharacter({ backgroundId: "tower-analyst" }),
    seed: 3,
  });
  return {
    ...base,
    credits: 1000,
    flags: { ...base.flags, "act1-complete": true, ...flags },
  };
}

describe("the shelf", () => {
  it("shows what the world stocks, in the world's order", () => {
    const state = makeState();
    expect(vendorShelf(state, STALL).map((line) => line.entry.id)).toEqual(
      vendorStock(STALL, deriveWorldState(state)).map((entry) => entry.id),
    );
  });

  it("carries the run's own act and books on every read", () => {
    const view = vendorView(makeState(), STALL);
    expect(view.act).toBe(2);
    expect(view.ledger.act).toBe(2);
    expect(view.haggle).toBe("none");
    expect(view.vendor.kind).toBe("stall");
  });

  it("quotes the list price to somebody nobody knows", () => {
    const state = makeState();
    const line = vendorShelf(state, STALL).find(
      (candidate) => candidate.entry.id === "buy-ghostline-mantle",
    );
    expect(line?.quote.price).toBe(itemValue("out-ghostline-mantle"));
    expect(line?.quote.price).toBe(
      listPrice(STALL, VENDOR_STOCK.find((e) => e.id === "buy-ghostline-mantle")!),
    );
  });

  it("marks a consignment line down for its condition, and says why", () => {
    const state = makeState();
    const rig = vendorShelf(state, LEDGER).find(
      (line) => line.entry.id === "quill-rig",
    );
    expect(rig?.entry.condition).toBe("used");
    const line = rig?.quote.lines.find((entry) => entry.id === "condition");
    expect(line?.label).toBe(CONDITION_MODIFIERS.used.label);
    expect(line?.amount).toBeLessThan(0);
    // Cheaper than the same coat would be unopened at the same counter.
    expect(rig?.quote.price).toBeLessThan(
      Math.round(itemValue("out-highline-rig") * 1.25),
    );
  });

  it("prices salvage below second-hand on the same shelf", () => {
    const state = makeState({ "cordon-broken": true });
    const plate = vendorShelf(state, LEDGER).find(
      (line) => line.entry.id === "quill-plate",
    );
    expect(plate?.entry.condition).toBe("salvage");
    const factorLine = plate?.quote.lines.find(
      (entry) => entry.id === "condition",
    );
    expect(factorLine?.label).toBe(CONDITION_MODIFIERS.salvage.label);
  });

  it("drops a line whose item this build no longer has", () => {
    // Every stocked item resolves today; the guard is what keeps a
    // future content move from crashing the screen instead of thinning
    // the shelf.
    for (const entry of VENDOR_STOCK) {
      expect(getItem(entry.itemId), entry.id).toBeDefined();
    }
  });

  it("carries the whole live shelf under a maximally loud city", () => {
    const world = worldOf("cordon-broken", "market-favoured", "warrant-clear");
    for (const entry of vendorStock(STALL, world)) {
      expect(listPrice(STALL, entry), entry.id).toBeGreaterThan(0);
    }
  });
});

describe("what a counter will take", () => {
  it("prices worn gear as second-hand and sealed stock as unopened", () => {
    expect(conditionOf(requireItem("out-ghostline-mantle"))).toBe("used");
    expect(conditionOf(requireItem("con-trauma-patch"))).toBe("new");
    expect(conditionOf(requireItem("mod-gyro-sleeve"))).toBe("new");
  });

  it("lists the bag in bag order, addressed by stack", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(
        addItem(base.inventory, "con-trauma-patch", 2),
        "wpn-rail-spitter",
      ),
    };
    const lines = vendorSellables(state, LEDGER);
    expect(lines.map((line) => line.itemId)).toEqual(
      state.inventory.stacks.map((stack) => stack.itemId),
    );
    for (const line of lines) {
      expect(state.inventory.stacks[line.stackIndex]?.itemId).toBe(line.itemId);
    }
    expect(lines.find((line) => line.itemId === "con-trauma-patch")?.quantity).toBe(
      2,
    );
  });

  it("says what it would pay before anything is committed", () => {
    const base = makeState();
    const state: GameState = {
      ...base,
      inventory: addItem(base.inventory, "wpn-rail-spitter"),
    };
    const line = vendorSellables(state, LEDGER).find(
      (candidate) => candidate.itemId === "wpn-rail-spitter",
    );
    expect(line?.quote.side).toBe("sell");
    expect(line?.quote.base).toBe(itemValue("wpn-rail-spitter"));
    expect(line?.quote.price).toBeLessThan(itemValue("wpn-rail-spitter"));
  });
});
