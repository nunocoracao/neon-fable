import { describe, expect, it } from "vitest";
import { items } from "../../data/items";
import { dyeItems } from "../../data/dyes";
import { appearanceCatalogs } from "../../data/appearance";
import { ENHANCEMENT_SLOTS } from "../../inventory/items";
import { APPEARANCE_FIELDS } from "../appearance";
import {
  cyberSets,
  describeCase,
  describeFrame,
  dyePicks,
  outfitPicks,
  sweepDimensions,
  sweepPlan,
  weaponPicks,
} from "./cases";
import { faultReport } from "./report";

describe("the sweep dimensions", () => {
  it("takes its appearance axes straight from the catalogs", () => {
    const dimensions = sweepDimensions();
    APPEARANCE_FIELDS.forEach((field, i) => {
      expect(dimensions[i]?.name).toBe(field);
      expect(dimensions[i]?.values).toEqual(
        appearanceCatalogs[field].map((option) => option.id),
      );
    });
  });

  it("takes its gear axes straight from the item data", () => {
    const wearable = items.filter(
      (item) => item.kind === "outfit" && item.outfitLayer !== undefined,
    );
    expect(outfitPicks()).toHaveLength(wearable.length + 1);
    expect(outfitPicks()[0]?.itemId).toBeNull();

    const armed = items.filter(
      (item) => item.kind === "weapon" && item.weaponLayer !== undefined,
    );
    expect(weaponPicks()).toHaveLength(armed.length + 1);

    expect(dyePicks()).toHaveLength(dyeItems.length + 1);
    expect(dyePicks()[0]?.dye).toBeUndefined();
  });

  it("shows every visible implant on its own and in a full rack", () => {
    const visible = items.filter(
      (item) => item.kind === "enhancement" && item.cyberLayer !== undefined,
    );
    const sets = cyberSets();
    expect(sets[0]?.enhancements).toEqual({});
    for (const implant of visible) {
      const alone = sets.find((set) => set.id === implant.id);
      expect(alone, `no solo set for ${implant.id}`).toBeDefined();
      const inRack = sets.some((set) =>
        Object.values(set.enhancements).includes(implant.id),
      );
      expect(inRack, `${implant.id} never appears in a rack`).toBe(true);
    }
    const racks = sets.filter((set) => set.id.startsWith("rack-"));
    expect(racks.length).toBeGreaterThan(0);
    for (const rack of racks) {
      // A rack fills every slot that has an implant to fill it.
      for (const slot of ENHANCEMENT_SLOTS) {
        const anyForSlot = visible.some(
          (item) => item.kind === "enhancement" && item.slot === slot,
        );
        if (anyForSlot) expect(rack.enhancements[slot]).toBeDefined();
      }
    }
  });
});

describe("sweepPlan", () => {
  const plan = sweepPlan();

  it("is deterministic and free of duplicate descriptors", () => {
    expect(sweepPlan().cases.map((one) => one.key)).toEqual(
      plan.cases.map((one) => one.key),
    );
    expect(new Set(plan.cases.map((one) => one.key)).size).toBe(
      plan.cases.length,
    );
  });

  it("leads with the per-option baseline and reaches every option", () => {
    expect(plan.perOption.length).toBeGreaterThan(0);
    expect(plan.cases.slice(0, plan.perOption.length)).toEqual(plan.perOption);
    const faults: string[] = [];
    plan.dimensions.forEach((dimension, d) => {
      for (const value of dimension.values) {
        const id =
          typeof value === "string" ? value : (value as { id: string }).id;
        const used = plan.generated.some(
          (row) => dimension.values[row[d] ?? -1] === value,
        );
        if (!used) faults.push(`${dimension.name}="${id}" never swept`);
      }
    });
    expect(faultReport(faults)).toBe("");
  });

  it("dyes only what there is cloth to dye", () => {
    const faults: string[] = [];
    for (const sweepCase of plan.cases) {
      if (sweepCase.outfitId === "bare" && sweepCase.dyeId !== "undyed") {
        faults.push(`dye on a bare torso — ${describeCase(sweepCase)}`);
      }
      if (sweepCase.dyeId !== "undyed" && !sweepCase.equipment.outfitDye) {
        faults.push(`dye named but not equipped — ${describeCase(sweepCase)}`);
      }
    }
    expect(faultReport(faults)).toBe("");
  });

  it("sweeps a real dye onto a real coat somewhere", () => {
    const dyed = plan.cases.filter((one) => one.dyeId !== "undyed");
    expect(dyed.length).toBeGreaterThanOrEqual(dyeItems.length);
  });

  it("records what the exhaustive product would have cost", () => {
    const product = plan.dimensions.reduce(
      (total, dimension) => total * dimension.values.length,
      1,
    );
    expect(plan.exhaustive).toBe(product);
    expect(plan.cases.length).toBeLessThan(product / 1e6);
  });
});

describe("repro lines", () => {
  const [sweepCase] = sweepPlan().cases;

  it("names every axis of a case", () => {
    expect(sweepCase).toBeDefined();
    const line = describeCase(sweepCase!);
    for (const field of APPEARANCE_FIELDS) {
      expect(line).toContain(`${field}=${sweepCase!.appearance[field]}`);
    }
    expect(line).toContain(`outfit=${sweepCase!.outfitId}`);
    expect(line).toContain(`weapon=${sweepCase!.weaponId}`);
    expect(line).toContain(`cyber=${sweepCase!.cyberId}`);
    expect(line).toContain(`dye=${sweepCase!.dyeId}`);
  });

  it("adds the pose, and the variant when there is one", () => {
    expect(describeFrame(sweepCase!, "e", "walk", 3)).toContain("[e/walk:3]");
    expect(describeFrame(sweepCase!, "n", "react", 1, "flinch+")).toContain(
      "[n/react:1/flinch+]",
    );
  });
});

describe("faultReport", () => {
  it("is empty for a clean sweep", () => {
    expect(faultReport([])).toBe("");
  });

  it("counts everything and prints the first few", () => {
    const report = faultReport(["a", "b", "c"], 2);
    expect(report).toContain("3 failing combination(s):");
    expect(report).toContain("a");
    expect(report).toContain("… and 1 more");
    expect(report).not.toContain("\nc");
  });
});
