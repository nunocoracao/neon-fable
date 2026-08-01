import { describe, expect, it } from "vitest";
import {
  CONSUMABLE_CONTEXTS,
  CONSUMABLE_KINDS,
  EFFECT_FAMILIES,
  type ConsumableItem,
  type ConsumableKind,
} from "../inventory/items";
import { STAT_KEYS } from "../character/stats";
import { consumableItems } from "./consumables";
import { ITEM_VALUES, VENDOR_IDS, itemValue } from "./economy";
import { items } from "./items";
import { storyArcs } from "./story";
import { VENDOR_STOCK } from "./world";

/**
 * Content lint for the consumable shelf. The figures are tuning and
 * will move; what must not move is that every family keeps its bargain
 * — a stim borrows, a meal is cheap and waits, a kit only opens when
 * nobody is shooting — and that everything on the shelf is somewhere a
 * player can actually buy it.
 */

const byKind = (kind: ConsumableKind): ConsumableItem[] =>
  consumableItems.filter((item) => item.consumableKind === kind);

describe("the consumable shelf", () => {
  it("ships a real spread across all four families", () => {
    expect(consumableItems.length).toBeGreaterThanOrEqual(12);
    expect(byKind("stim").length).toBeGreaterThanOrEqual(4);
    expect(byKind("food").length).toBeGreaterThanOrEqual(3);
    expect(byKind("kit").length).toBeGreaterThanOrEqual(4);
    expect(byKind("oddity").length).toBeGreaterThanOrEqual(1);
  });

  it("is registered in the item catalog, once each", () => {
    const registered = items.filter((item) => item.kind === "consumable");
    expect(registered.map((item) => item.id).sort()).toEqual(
      consumableItems.map((item) => item.id).sort(),
    );
  });

  it("says where it may be opened, and does something when opened", () => {
    for (const item of consumableItems) {
      expect(CONSUMABLE_KINDS, item.id).toContain(item.consumableKind);
      expect(item.contexts.length, `${item.id} is usable nowhere`)
        .toBeGreaterThan(0);
      for (const context of item.contexts) {
        expect(CONSUMABLE_CONTEXTS, item.id).toContain(context);
      }
      expect(item.effects.length, `${item.id} does nothing`).toBeGreaterThan(0);
    }
  });

  it("names a real family and a real stat on every timed effect", () => {
    for (const item of consumableItems) {
      for (const effect of item.effects) {
        if (effect.type !== "boost" && effect.type !== "ready-boost") continue;
        const { boost } = effect;
        expect(EFFECT_FAMILIES, item.id).toContain(boost.family);
        expect(STAT_KEYS, item.id).toContain(boost.stat);
        expect(boost.turns, `${item.id} lasts no turns`).toBeGreaterThan(0);
        expect(boost.amount, `${item.id} lifts nothing`).toBeGreaterThan(0);
        if (boost.after) {
          expect(STAT_KEYS, item.id).toContain(boost.after.stat);
          expect(boost.after.turns, item.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("makes every stim a loan: a combat action that costs afterwards", () => {
    for (const item of byKind("stim")) {
      expect(item.contexts, `${item.id} is not a combat action`).toEqual([
        "combat",
      ]);
      const lifts = item.effects.flatMap((effect) =>
        effect.type === "boost" ? [effect.boost] : [],
      );
      expect(lifts.length, `${item.id} lifts nothing`).toBeGreaterThan(0);
      for (const lift of lifts) {
        // The bill is the whole point of the family: a stim with no
        // after-cost is a free action, and this shelf does not sell one.
        expect(lift.after, `${item.id} costs nothing afterwards`).toBeDefined();
        expect(lift.after?.amount, item.id).toBeLessThan(0);
      }
      // And a stim is never a way out of being hurt.
      expect(
        item.effects.some((effect) => effect.type === "heal"),
        `${item.id} heals, which is not what a stim is for`,
      ).toBe(false);
    }
  });

  it("keeps a shared slot inside each stim family, so a dose is a choice", () => {
    // Two stims in one family are alternatives, not a stack: buying the
    // dearer one has to mean giving up the cheaper one's lift.
    const families = byKind("stim").flatMap((item) =>
      item.effects.flatMap((effect) =>
        effect.type === "boost" ? [effect.boost.family] : [],
      ),
    );
    expect(new Set(families).size).toBeLessThan(families.length);
  });

  it("makes every meal cheap, out-of-combat, and paid forward", () => {
    for (const item of byKind("food")) {
      expect(item.contexts, `${item.id} is eaten mid-fight`).toEqual([
        "exploration",
      ]);
      const readied = item.effects.flatMap((effect) =>
        effect.type === "ready-boost" ? [effect.boost] : [],
      );
      expect(readied.length, `${item.id} buys no next fight`).toBe(1);
      // Nothing a meal readies costs anything later; food is not a stim.
      expect(readied[0]?.after, `${item.id} has a hangover`).toBeUndefined();
      expect(readied[0]?.family, item.id).toBe("well-fed");
      expect(
        item.effects.some((effect) => effect.type === "heal"),
        `${item.id} is not food`,
      ).toBe(true);
      // The floor the economy will bear (see ITEM_VALUES), and well
      // under what a Trauma Patch costs.
      expect(itemValue(item.id), `${item.id} price`).toBeGreaterThanOrEqual(10);
      expect(itemValue(item.id), item.id).toBeLessThan(
        itemValue("con-trauma-patch"),
      );
    }
    // One family between all of them: eating the whole cart is worth
    // exactly one meal.
    const families = byKind("food").flatMap((item) =>
      item.effects.flatMap((effect) =>
        effect.type === "ready-boost" ? [effect.boost.family] : [],
      ),
    );
    expect(new Set(families).size).toBe(1);
  });

  it("keeps the wound-closer expensive, out of combat, and alone", () => {
    const closers = consumableItems.filter((item) =>
      item.effects.some((effect) => effect.type === "treat-injury"),
    );
    expect(closers).toHaveLength(1);
    const kit = closers[0];
    if (!kit) throw new Error("no wound-closer");
    expect(kit.contexts).toEqual(["exploration"]);
    // Priced against a clinic visit rather than against hit points: it
    // has to be the worse deal, or the clinic stops mattering.
    expect(itemValue(kit.id)).toBeGreaterThan(100);
  });

  it("keeps the oddity odd: one item, one small strange effect", () => {
    const oddities = byKind("oddity");
    expect(oddities).toHaveLength(1);
    const sugar = oddities[0];
    if (!sugar) throw new Error("no oddity");
    expect(sugar.effects.map((effect) => effect.type)).toEqual(["settle"]);
    // And nothing else in the game settles anybody.
    const settlers = consumableItems.filter((item) =>
      item.effects.some((effect) => effect.type === "settle"),
    );
    expect(settlers).toEqual([sugar]);
  });
});

describe("where a player gets them", () => {
  const fromVendors = new Set(VENDOR_STOCK.map((entry) => entry.itemId));
  const fromStory = new Set(
    storyArcs.flatMap((arc) =>
      arc.nodes.flatMap((node) =>
        node.choices.flatMap((choice) =>
          (choice.effects ?? []).flatMap((effect) =>
            effect.type === "add-item" ? [effect.itemId] : [],
          ),
        ),
      ),
    ),
  );

  it("puts every consumable somewhere a player can actually get it", () => {
    for (const item of consumableItems) {
      expect(
        fromVendors.has(item.id) || fromStory.has(item.id),
        `${item.id} is on no shelf and in no loot`,
      ).toBe(true);
    }
  });

  it("prices every one of them", () => {
    for (const item of consumableItems) {
      expect(ITEM_VALUES[item.id], `no worth for ${item.id}`).toBeDefined();
      expect(itemValue(item.id), item.id).toBeGreaterThan(0);
    }
  });

  it("sells food at all three carts, and stims where stims belong", () => {
    const linesAt = (vendorId: string): string[] =>
      VENDOR_STOCK.filter((entry) => entry.vendorId === vendorId).map(
        (entry) => entry.itemId,
      );
    for (const cart of [
      "vm-noodle-counter",
      "steps-food-cart",
      "quays-food-cart",
    ] as const) {
      expect(VENDOR_IDS, cart).toContain(cart);
      const sold = linesAt(cart);
      expect(sold.length, `${cart} sells nothing`).toBeGreaterThan(0);
      const food = sold.filter((id) =>
        byKind("food").some((item) => item.id === id),
      );
      expect(food.length, `${cart} sells no food`).toBeGreaterThan(0);
    }
    // The two districts that had nowhere to eat now do.
    expect(linesAt("steps-food-cart")).toContain("con-scrap-skewer");
    expect(linesAt("quays-food-cart")).toContain("con-basin-tea");
    // And the wound-closer is on a counter a player reaches in Act 1,
    // which is the whole point of it existing.
    expect(linesAt("steps-food-cart")).toContain("con-splint-kit");
  });
});
