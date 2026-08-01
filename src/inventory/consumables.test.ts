import { describe, expect, it } from "vitest";
import { NO_PERKS } from "../character/perks";
import { requireItem } from "../data/items";
import {
  consumableOutcome,
  isConsumable,
  outcomeMatters,
  plainSubject,
  refreshFamily,
  usableIn,
  type ConsumableSubject,
} from "./consumables";
import type { ConsumableItem, EffectFamily } from "./items";

/**
 * The one derivation every screen and both use-paths read. What is
 * pinned here is that it answers about *a body* rather than about an
 * item: the same patch is worth ten points to somebody bleeding, three
 * to somebody nearly whole, and nothing at all to somebody untouched.
 */

const consumable = (id: string): ConsumableItem => {
  const item = requireItem(id);
  if (!isConsumable(item)) throw new Error(`${id} is not a consumable`);
  return item;
};

const hurt = (hp: number): ConsumableSubject => ({
  hp,
  maxHp: 30,
  perks: NO_PERKS,
  injured: false,
});

describe("usableIn", () => {
  it("reads the item's authored contexts, both ways", () => {
    expect(usableIn(consumable("con-surge-stim"), "combat")).toBe(true);
    expect(usableIn(consumable("con-surge-stim"), "exploration")).toBe(false);
    expect(usableIn(consumable("con-cage-noodles"), "combat")).toBe(false);
    expect(usableIn(consumable("con-cage-noodles"), "exploration")).toBe(true);
    // The battlefield dressing is the one thing that works either side.
    expect(usableIn(consumable("con-trauma-patch"), "combat")).toBe(true);
    expect(usableIn(consumable("con-trauma-patch"), "exploration")).toBe(true);
  });
});

describe("consumableOutcome", () => {
  it("caps healing at the room left in the body", () => {
    const patch = consumable("con-trauma-patch");
    expect(consumableOutcome(patch, hurt(10)).heal).toBe(10);
    expect(consumableOutcome(patch, hurt(25)).heal).toBe(5);
    expect(consumableOutcome(patch, hurt(30)).heal).toBe(0);
  });

  it("folds a healing perk in, and still caps it", () => {
    const patch = consumable("con-trauma-patch");
    const thrifty = { ...hurt(10), perks: { ...NO_PERKS, healingPercent: 50 } };
    expect(consumableOutcome(patch, thrifty).heal).toBe(15);
    expect(
      consumableOutcome(patch, { ...thrifty, hp: 22 }).heal,
    ).toBe(8);
  });

  it("reports a stim's lift and its bill, and heals nothing", () => {
    const outcome = consumableOutcome(consumable("con-surge-stim"), hurt(10));
    expect(outcome.heal).toBe(0);
    expect(outcome.boosts).toHaveLength(1);
    expect(outcome.boosts[0]?.after?.amount).toBeLessThan(0);
    expect(outcome.readied).toEqual([]);
  });

  it("reports a meal as a small heal now and a lift held over", () => {
    const outcome = consumableOutcome(consumable("con-cage-noodles"), hurt(10));
    expect(outcome.heal).toBeGreaterThan(0);
    expect(outcome.boosts).toEqual([]);
    expect(outcome.readied).toHaveLength(1);
    expect(outcome.readied[0]?.family).toBe("well-fed");
    // Nothing a meal readies costs anything afterwards.
    expect(outcome.readied[0]?.after).toBeUndefined();
  });

  it("only claims to close a wound when there is one to close", () => {
    const kit = consumable("con-splint-kit");
    expect(consumableOutcome(kit, hurt(10)).treatsInjury).toBe(false);
    expect(
      consumableOutcome(kit, { ...hurt(10), injured: true }).treatsInjury,
    ).toBe(true);
  });

  it("sums two heals against one ceiling rather than each against it", () => {
    const double: ConsumableItem = {
      id: "test-double",
      kind: "consumable",
      consumableKind: "kit",
      name: "Double",
      description: "",
      contexts: ["exploration"],
      effects: [
        { type: "heal", amount: 8 },
        { type: "heal", amount: 8 },
      ],
    };
    expect(consumableOutcome(double, hurt(20)).heal).toBe(10);
  });
});

describe("outcomeMatters", () => {
  it("refuses a dose that would change nothing", () => {
    const patch = consumable("con-trauma-patch");
    expect(outcomeMatters(consumableOutcome(patch, hurt(30)))).toBe(false);
    expect(outcomeMatters(consumableOutcome(patch, hurt(29)))).toBe(true);
  });

  it("lets a meal through at full health — the lift lands anyway", () => {
    const noodles = consumable("con-cage-noodles");
    expect(outcomeMatters(consumableOutcome(noodles, hurt(30)))).toBe(true);
  });

  it("lets a splint kit through on somebody whole but wounded", () => {
    const kit = consumable("con-splint-kit");
    const whole = { ...hurt(30), injured: true };
    expect(outcomeMatters(consumableOutcome(kit, whole))).toBe(true);
    expect(outcomeMatters(consumableOutcome(kit, hurt(30)))).toBe(false);
  });
});

describe("refreshFamily", () => {
  interface Slot {
    family?: EffectFamily;
    tag: string;
  }

  it("keeps one entry per family, newest last", () => {
    const a: Slot = { family: "reflex-stim", tag: "a" };
    const b: Slot = { family: "reflex-stim", tag: "b" };
    const c: Slot = { family: "well-fed", tag: "c" };
    expect(refreshFamily(refreshFamily([a], c), b)).toEqual([c, b]);
  });

  it("leaves the familyless alone in both directions", () => {
    const loose: Slot = { tag: "loose" };
    const stim: Slot = { family: "reflex-stim", tag: "stim" };
    expect(refreshFamily([stim], loose)).toEqual([stim, loose]);
    expect(refreshFamily([loose], stim)).toEqual([loose, stim]);
  });
});

describe("plainSubject", () => {
  it("is a body with no habits and nothing wrong with it", () => {
    expect(plainSubject(5, 20)).toEqual({
      hp: 5,
      maxHp: 20,
      perks: NO_PERKS,
      injured: false,
    });
  });
});
