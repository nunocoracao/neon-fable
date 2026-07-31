import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { CHAPEL_DYE_SHELF, chapelDyePrice } from "../data/dyes";
import {
  addGear,
  addItem,
  applyDye,
  emptyInventory,
  equip,
  type DyeCounter,
} from "../inventory";
import { coatColorLine, dyeCounterModel } from "./dyeModel";

/**
 * The colour counter as data: which coats it offers, which tins it can
 * hand over, and what it greys out. No DOM — the screen is a rendering
 * of this, so the rules are tested once, here.
 */

const OUTFIT = "out-courier-slicker";
const worn = { where: "equipped" } as const;

function counter(credits = 200, tins: string[] = []): DyeCounter {
  const dressed = equip(
    fixtureCharacter(),
    addGear(emptyInventory(), OUTFIT, {}),
    OUTFIT,
  );
  let inventory = dressed.inventory;
  for (const id of tins) inventory = addItem(inventory, id, 1);
  return { character: dressed.character, inventory, credits };
}

function tin(model: ReturnType<typeof dyeCounterModel>, dyeId: string) {
  const row = model.tins.find((t) => t.dyeId === dyeId);
  if (!row) throw new Error(`no tin row for ${dyeId}`);
  return row;
}

describe("the counter's coats", () => {
  it("offers the worn coat first and selects it by default", () => {
    const model = dyeCounterModel(counter(), null);
    expect(model.coats[0]?.place).toBe("Worn");
    expect(model.coats[0]?.selected).toBe(true);
    expect(model.selected?.item.id).toBe(OUTFIT);
    expect(model.coats[0]?.colorLine).toBe("Factory colours");
  });

  it("reads back the colour a coat is wearing", () => {
    const dyed = applyDye(counter(200, ["dye-cinder-black"]), worn,
      "dye-cinder-black");
    const model = dyeCounterModel(dyed, null);
    expect(model.coats[0]?.colorLine).toBe("Wearing black cloth · amber trim");
    expect(model.canStrip).toBe(true);
  });

  it("honors an explicit pick over the default", () => {
    const withSuit: DyeCounter = (() => {
      const base = counter();
      return {
        ...base,
        inventory: addGear(base.inventory, "out-spire-suit", {}),
      };
    })();
    const model = dyeCounterModel(withSuit, {
      where: "carried",
      stackIndex: 0,
    });
    expect(model.selected?.item.id).toBe("out-spire-suit");
    expect(model.coats.find((c) => c.selected)?.place).toBe("Carried");
  });

  it("has nothing to say when there is no coat at all", () => {
    const bare: DyeCounter = {
      character: fixtureCharacter(),
      inventory: emptyInventory(),
      credits: 100,
    };
    const model = dyeCounterModel(bare, null);
    expect(model.coats).toEqual([]);
    expect(model.selected).toBeNull();
    expect(model.canStrip).toBe(false);
    // Every row is dead without something to paint.
    expect(model.tins.every((row) => !row.enabled)).toBe(true);
  });
});

describe("the counter's tins", () => {
  it("lists the whole shelf, in shelf order", () => {
    const model = dyeCounterModel(counter(), null);
    expect(model.tins.map((row) => row.dyeId)).toEqual(
      CHAPEL_DYE_SHELF.map((entry) => entry.itemId),
    );
  });

  it("quotes the shelf price, and charges nothing for a tin in the bag", () => {
    const model = dyeCounterModel(counter(200, ["dye-cinder-black"]), null);
    const carried = tin(model, "dye-cinder-black");
    expect(carried.carried).toBe(1);
    expect(carried.actionLabel).toBe("Apply — carried");
    const bought = tin(model, "dye-tidewater");
    expect(bought.actionLabel).toBe(
      `Buy & apply — ${chapelDyePrice("dye-tidewater")} cr`,
    );
  });

  it("greys out what the player cannot pay for", () => {
    const model = dyeCounterModel(counter(0), null);
    expect(model.tins.every((row) => !row.enabled)).toBe(true);
    // Carrying it makes it clickable with an empty purse.
    const withTin = dyeCounterModel(counter(0, ["dye-cinder-black"]), null);
    expect(tin(withTin, "dye-cinder-black").enabled).toBe(true);
  });

  it("greys out the colour already on the coat", () => {
    const dyed = applyDye(counter(200, ["dye-cinder-black"]), worn,
      "dye-cinder-black");
    const row = tin(dyeCounterModel(dyed, null), "dye-cinder-black");
    expect(row.current).toBe(true);
    expect(row.enabled).toBe(false);
    expect(row.actionLabel).toBe("Already worn");
  });

  it("shows a found tin the chapel does not stock, priced at nothing", () => {
    const model = dyeCounterModel(counter(200, ["dye-last-mile"]), null);
    const found = tin(model, "dye-last-mile");
    expect(found.price).toBeNull();
    expect(found.carried).toBe(1);
    expect(found.enabled).toBe(true);
    // Found colours come after the shelf.
    expect(model.tins[model.tins.length - 1]?.dyeId).toBe("dye-last-mile");
  });

  it("describes what each tin repaints", () => {
    const model = dyeCounterModel(counter(), null);
    expect(tin(model, "dye-signal-cyan").colors).toBe("cyan trim");
    expect(tin(model, "dye-cinder-black").colors).toBe(
      "black cloth · amber trim",
    );
  });

  it("refuses every tin for a coat with no cloth of its own", () => {
    const model = dyeCounterModel(counter(), null);
    const noCloth = { ...model.selected!, dyeable: false };
    expect(coatColorLine(noCloth)).toBe("Nothing on it to dye");
  });
});
