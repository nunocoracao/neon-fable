import { describe, expect, it } from "vitest";
import { readiedEffects } from "../character/readied";
import { combatStat, createCombat, playerCombatant } from "../combat";
import { useConsumable } from "../inventory";
import { countItem } from "../inventory/inventory";
import { createNewGame, type GameState } from "../state";
import { buyFromVendor } from "./counter";
import { vendorShelf } from "./shelf";

/**
 * The whole loop, end to end, through the real counters: walk up to a
 * cart, buy a bowl, eat it, and walk into a fight carrying it.
 *
 * Every step goes through the shipped pure functions and the shipped
 * content — no fixtures — so this is the test that would notice if the
 * cart stopped stocking food, if the price left a player unable to
 * afford the cheapest thing in the game, or if what a meal buys stopped
 * reaching the arena.
 */

function funded(credits = 200): GameState {
  return { ...createNewGame({ seed: 4 }), credits };
}

describe("the griddle carts", () => {
  it("puts a cheap hot meal in reach of a broke runner", () => {
    // A fresh character has 25 credits (see STARTING_CREDITS), which is
    // the whole point of a cart: it is the counter you can afford on
    // the first night.
    const state = funded(25);
    const cheapest = vendorShelf(state, "steps-food-cart")
      .filter((line) => line.item.kind === "consumable")
      .sort((a, b) => a.quote.price - b.quote.price)[0];
    if (!cheapest) throw new Error("the cart is empty");
    expect(cheapest.affordable).toBe(true);
    expect(cheapest.quote.price).toBeLessThanOrEqual(state.credits);
  });

  it("sells, feeds, and carries into the next fight", () => {
    let state = funded();
    const bought = buyFromVendor(state, "steps-food-cart", "bell-noodles");
    state = bought.state;
    expect(bought.paid).toBeGreaterThan(0);
    expect(countItem(state.inventory, "con-cage-noodles")).toBe(1);
    expect(state.credits).toBe(200 - bought.paid);

    // Hurt, then fed. The bowl heals a little and holds the rest over.
    state = { ...state, player: { ...state.player, hp: 5 } };
    const eaten = useConsumable(state.player, state.inventory, "con-cage-noodles");
    state = { ...state, player: eaten.character, inventory: eaten.inventory };
    expect(state.player.hp).toBe(14);
    expect(countItem(state.inventory, "con-cage-noodles")).toBe(0);
    expect(readiedEffects(state.player)).toHaveLength(1);

    // And the lift is live from turn one of the next fight.
    const fed = createCombat(state, "enc-rustyard-ambush");
    const cold = createCombat(
      { ...state, player: { ...state.player, readied: undefined } },
      "enc-rustyard-ambush",
    );
    expect(combatStat(playerCombatant(fed), "reflexes")).toBe(
      combatStat(playerCombatant(cold), "reflexes") + 1,
    );
  });

  it("keeps every cart's line inside what a cart can sell", () => {
    const state = funded();
    for (const vendorId of [
      "vm-noodle-counter",
      "steps-food-cart",
      "quays-food-cart",
    ] as const) {
      const shelf = vendorShelf(state, vendorId);
      expect(shelf.length, `${vendorId} shelf`).toBeGreaterThan(0);
      for (const line of shelf) {
        // A cart sells things you eat, drink or inject. Nobody buys a
        // coat off a hood with a pot on it.
        expect(line.item.kind, `${vendorId}/${line.entry.id}`).toBe(
          "consumable",
        );
        expect(line.remaining, `${vendorId}/${line.entry.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("runs a cart's cheap lines out of stock the way a day runs out", () => {
    let state = funded();
    const stocked = vendorShelf(state, "quays-food-cart").find(
      (line) => line.entry.id === "onder-tea",
    );
    expect(stocked?.stocked).toBeGreaterThan(1);
    for (let i = 0; i < (stocked?.stocked ?? 0); i++) {
      state = buyFromVendor(state, "quays-food-cart", "onder-tea").state;
    }
    expect(() =>
      buyFromVendor(state, "quays-food-cart", "onder-tea"),
    ).toThrow(/sold out/i);
  });
});
