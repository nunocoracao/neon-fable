import { describe, expect, it } from "vitest";
import { MATERIAL_RAMPS } from "../iso/art/palette";
import { dyesAnything } from "../inventory/items";
import { CHAPEL_DYE_SHELF, chapelDyePrice, dyeItems, getDye } from "./dyes";
import { getItem, items } from "./items";
import { storyArcs } from "./story";

/**
 * Content lint for the colour range: that every tin is a real,
 * paintable colour, that the shelf prices something the chapel can
 * actually hand over, and that the two found colours are genuinely
 * found rather than quietly on sale.
 */

/** Every add-item effect anywhere in the story graph. */
const granted = storyArcs.flatMap((arc) =>
  arc.nodes.flatMap((node) =>
    node.choices.flatMap((choice) =>
      (choice.effects ?? []).flatMap((effect) =>
        effect.type === "add-item" ? [effect.itemId] : [],
      ),
    ),
  ),
);

describe("the dye range", () => {
  it("carries enough colours to be a range at all", () => {
    expect(dyeItems.length).toBeGreaterThanOrEqual(8);
  });

  it("registers every tin as an item, exactly once", () => {
    const ids = dyeItems.map((dye) => dye.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dye of dyeItems) {
      expect(getItem(dye.id), dye.id).toBe(dye);
      expect(getDye(dye.id), dye.id).toBe(dye);
      expect(dye.id.startsWith("dye-"), dye.id).toBe(true);
    }
    expect(items.filter((item) => item.kind === "dye")).toEqual(dyeItems);
  });

  it("paints something, in materials the palette has", () => {
    for (const dye of dyeItems) {
      expect(dyesAnything(dye.colors), dye.id).toBe(true);
      for (const material of [dye.colors.primary, dye.colors.accent]) {
        if (material === undefined) continue;
        expect(MATERIAL_RAMPS[material], `${dye.id} ${material}`).toBeDefined();
      }
    }
  });

  it("gives every tin a colour pair no other tin has", () => {
    const pairs = dyeItems.map(
      (dye) => `${dye.colors.primary ?? "-"}/${dye.colors.accent ?? "-"}`,
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("says what it is in a name and a description", () => {
    for (const dye of dyeItems) {
      expect(dye.name.length, dye.id).toBeGreaterThan(3);
      expect(dye.description.length, dye.id).toBeGreaterThan(40);
    }
  });
});

describe("the chapel's shelf", () => {
  it("stocks only tins that exist, at prices somebody could pay", () => {
    for (const entry of CHAPEL_DYE_SHELF) {
      const dye = getDye(entry.itemId);
      expect(dye, entry.itemId).toBeDefined();
      expect(entry.price).toBeGreaterThan(0);
      // A tin should never cost more than a fresh coat's worth of work.
      expect(entry.price).toBeLessThanOrEqual(100);
      expect(chapelDyePrice(entry.itemId)).toBe(entry.price);
    }
  });

  it("lists each stocked tin once", () => {
    const ids = CHAPEL_DYE_SHELF.map((entry) => entry.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prices a trim-only tin under a full re-cloth", () => {
    const trimOnly = CHAPEL_DYE_SHELF.filter(
      (entry) => getDye(entry.itemId)?.colors.primary === undefined,
    );
    expect(trimOnly.length).toBeGreaterThan(0);
    const cheapestFull = Math.min(
      ...CHAPEL_DYE_SHELF.filter(
        (entry) => getDye(entry.itemId)?.colors.primary !== undefined,
      ).map((entry) => entry.price),
    );
    for (const entry of trimOnly) {
      expect(entry.price).toBeLessThan(cheapestFull);
    }
  });
});

describe("the colours nobody sells", () => {
  const unsold = dyeItems.filter((dye) => chapelDyePrice(dye.id) === null);

  it("keeps a couple of tins off the shelf entirely", () => {
    expect(unsold.length).toBeGreaterThanOrEqual(2);
  });

  it("hides every one of them somewhere in the world", () => {
    for (const dye of unsold) {
      expect(granted, `${dye.id} is unbuyable and unfindable`).toContain(
        dye.id,
      );
    }
  });

  it("never hands out a tin the chapel would happily sell", () => {
    // Shelf colours are bought, not looted: a found tin has to be
    // something the shelf cannot give you.
    for (const itemId of granted) {
      if (getItem(itemId)?.kind !== "dye") continue;
      expect(chapelDyePrice(itemId), itemId).toBeNull();
    }
  });
});
