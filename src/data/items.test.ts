import { describe, expect, it } from "vitest";
import { InventoryError, MOD_SOCKET_KINDS } from "../inventory/items";
import { weaponSockets } from "../inventory/mods";
import { getAbility } from "./abilities";
import { layerArtGrid } from "../iso/art/layers";
import { BODY_BUILD_IDS, BODY_VIEW_IDS } from "../iso/art/layers/body";
import { cyberArtId } from "../iso/art/layers/cyberware";
import { outfitArtId } from "../iso/art/layers/outfits";
import { weaponArtId } from "../iso/art/layers/weapons";
import { MATERIAL_RAMPS } from "../iso/art/palette";
import { backgrounds } from "./backgrounds";
import { storyArcs } from "./story";
import { VENDOR_STOCK } from "./world";
import { getItem, items, requireItem } from "./items";

describe("item content", () => {
  it("has unique ids", () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("meets the minimum content bar per kind", () => {
    const byKind = (kind: string) => items.filter((i) => i.kind === kind);
    expect(byKind("weapon").length).toBeGreaterThanOrEqual(6);
    expect(byKind("outfit").length).toBeGreaterThanOrEqual(5);
    expect(byKind("consumable").length).toBeGreaterThanOrEqual(2);
    expect(byKind("enhancement").length).toBeGreaterThanOrEqual(7);
    expect(byKind("mod").length).toBeGreaterThanOrEqual(6);
  });

  it("sockets every weapon by tier, with kinds its silhouette could carry", () => {
    for (const item of items) {
      if (item.kind !== "weapon") continue;
      const sockets = weaponSockets(item);
      // One on a starter, two on tier-2 and signature hardware. A
      // weapon with none would be a weapon the bench cannot help.
      expect(sockets.length, item.id).toBeGreaterThanOrEqual(1);
      expect(sockets.length, item.id).toBeLessThanOrEqual(2);
      expect(sockets.length, item.id).toBe(item.damage >= 6 ? 2 : 1);
      for (const socket of sockets) {
        expect(MOD_SOCKET_KINDS, item.id).toContain(socket);
      }
      // Nothing swung has a barrel to thread. (The reverse does not
      // hold: a lash and a grapnel are "ranged" and are all grip.)
      if (item.rangeType === "melee") {
        expect(sockets, item.id).not.toContain("barrel");
      }
      // One of each kind at most: two barrels is not a weapon.
      expect(new Set(sockets).size, item.id).toBe(sockets.length);
    }
  });

  it("makes every mod a trade, fits a real socket, and shows on the weapon", () => {
    const sockets = new Set<string>();
    for (const item of items) {
      if (item.kind !== "mod") continue;
      sockets.add(item.socket);
      expect(MOD_SOCKET_KINDS, item.id).toContain(item.socket);
      // A modded weapon has to read as modded.
      expect(item.accent, `${item.id} needs an accent`).toBeDefined();
      if (item.accent) {
        expect(MATERIAL_RAMPS[item.accent], item.id).toBeDefined();
      }
      // Every part costs something: a mod that only gives is a stat
      // stick with a screw thread. The exception is a part whose whole
      // effect is conditional (armor pierce is worth nothing against
      // an unarmored target) or which spends the action it grants.
      const gives = item.effects.some(
        (effect) =>
          (effect.type === "stat-mod" && effect.amount > 0) ||
          (effect.type === "weapon-damage" && effect.amount > 0) ||
          (effect.type === "accuracy" && effect.amount > 0) ||
          (effect.type === "weapon-range" && effect.amount > 0) ||
          (effect.type === "crit-share" && effect.amount < 0) ||
          effect.type === "grant-ability",
      );
      const takes = item.effects.some(
        (effect) =>
          (effect.type === "stat-mod" && effect.amount < 0) ||
          (effect.type === "weapon-damage" && effect.amount < 0) ||
          (effect.type === "accuracy" && effect.amount < 0) ||
          (effect.type === "weapon-range" && effect.amount < 0) ||
          (effect.type === "crit-share" && effect.amount > 0),
      );
      const conditional = item.effects.some(
        (effect) => effect.type === "armor-pierce",
      );
      expect(gives || conditional, `${item.id} does nothing`).toBe(true);
      expect(takes || conditional, `${item.id} costs nothing`).toBe(true);
      // Every ability a part grants has to exist.
      for (const effect of item.effects) {
        if (effect.type === "grant-ability") {
          expect(getAbility(effect.abilityId), item.id).toBeDefined();
        }
      }
    }
    // Every socket kind a weapon offers has parts that fit it.
    expect(sockets).toEqual(new Set(MOD_SOCKET_KINDS));
  });

  it("covers every install slot across enhancements", () => {
    const slots = items
      .filter((i) => i.kind === "enhancement")
      .map((i) => i.slot);
    expect(new Set(slots)).toEqual(new Set(["eyes", "arms", "neural", "dermal"]));
  });

  it("gives every enhancement a genuine trade-off beyond neural cost", () => {
    for (const item of items) {
      if (item.kind !== "enhancement") continue;
      expect(item.neuralCost).toBeGreaterThan(0);
      const hasDrawback = item.effects.some(
        (effect) => effect.type === "stat-mod" && effect.amount < 0,
      );
      expect(hasDrawback, `${item.id} needs a negative stat mod`).toBe(true);
    }
  });

  it("carries a second gear tier that outclasses the starting gear", () => {
    const tier2 = {
      weapons: ["wpn-rail-spitter", "wpn-torque-cleaver", "wpn-spindle-projector"],
      outfits: ["out-cordon-plate", "out-ghostline-mantle"],
      enhancements: [
        "cyb-warden-optics",
        "cyb-torsion-frame",
        "cyb-cascade-governor",
      ],
    };
    for (const id of tier2.weapons) {
      const item = getItem(id);
      expect(item?.kind, id).toBe("weapon");
      if (item?.kind !== "weapon") continue;
      // Stronger than every tier-1 weapon and stat-gated on top of price.
      expect(item.damage).toBeGreaterThanOrEqual(7);
      expect(item.requirement?.value ?? 0).toBeGreaterThanOrEqual(6);
    }
    for (const id of tier2.outfits) {
      const item = getItem(id);
      expect(item?.kind, id).toBe("outfit");
      if (item?.kind !== "outfit") continue;
      expect(item.armor).toBeGreaterThanOrEqual(3);
    }
    for (const id of tier2.enhancements) {
      const item = getItem(id);
      expect(item?.kind, id).toBe("enhancement");
      if (item?.kind !== "enhancement") continue;
      expect(item.neuralCost).toBeGreaterThanOrEqual(3);
    }
  });

  it("puts every authored mod somewhere a player can actually get it", () => {
    // Loot (an add-item effect anywhere in the story) or vendor stock.
    // A part nobody can obtain is content that does not exist.
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
    const fromVendors = new Set(VENDOR_STOCK.map((entry) => entry.itemId));
    for (const item of items) {
      if (item.kind !== "mod") continue;
      expect(
        fromStory.has(item.id) || fromVendors.has(item.id),
        `${item.id} is not placed in loot or stock`,
      ).toBe(true);
    }
  });

  it("gives every wearable outfit a layer that resolves for both builds and views", () => {
    const outfits = items.filter((i) => i.kind === "outfit");
    for (const item of outfits) {
      if (item.kind !== "outfit") continue;
      const ref = item.outfitLayer;
      // Schema-wise the layer is optional (absent items fall back to
      // the base garb underlayer); every shipped wearable carries one.
      expect(ref, `${item.id} needs an outfitLayer`).toBeDefined();
      if (!ref) continue;
      for (const build of BODY_BUILD_IDS) {
        for (const view of BODY_VIEW_IDS) {
          expect(
            layerArtGrid("outfit", outfitArtId(ref.id, build), view),
            `${item.id} -> ${ref.id} ${build} ${view}`,
          ).not.toBeNull();
        }
      }
      for (const material of [ref.primary, ref.accent]) {
        if (material !== undefined) {
          expect(
            MATERIAL_RAMPS[material],
            `${item.id} material ${material}`,
          ).toBeDefined();
        }
      }
    }
    // Every wearable reads distinct: no two share family + recolors.
    const looks = outfits.map((i) =>
      i.kind === "outfit" ? JSON.stringify(i.outfitLayer) : "",
    );
    expect(new Set(looks).size).toBe(outfits.length);
  });

  it("gives every weapon a class layer that resolves for both builds and views", () => {
    const weapons = items.filter((i) => i.kind === "weapon");
    for (const item of weapons) {
      if (item.kind !== "weapon") continue;
      const ref = item.weaponLayer;
      // Schema-wise the layer is optional (absent items draw empty
      // hands); every shipped weapon carries one.
      expect(ref, `${item.id} needs a weaponLayer`).toBeDefined();
      if (!ref) continue;
      for (const build of BODY_BUILD_IDS) {
        for (const view of BODY_VIEW_IDS) {
          expect(
            layerArtGrid("weapon", weaponArtId(ref.id, build), view),
            `${item.id} -> ${ref.id} ${build} ${view}`,
          ).not.toBeNull();
        }
      }
      if (ref.accent !== undefined) {
        expect(
          MATERIAL_RAMPS[ref.accent],
          `${item.id} accent ${ref.accent}`,
        ).toBeDefined();
      }
    }
  });

  it("gives every enhancement a cyber layer that resolves for both builds and views", () => {
    const enhancements = items.filter((i) => i.kind === "enhancement");
    for (const item of enhancements) {
      if (item.kind !== "enhancement") continue;
      const ref = item.cyberLayer;
      // Schema-wise the layer is optional (absent items show no mark);
      // every shipped enhancement carries a visible overlay.
      expect(ref, `${item.id} needs a cyberLayer`).toBeDefined();
      if (!ref) continue;
      for (const build of BODY_BUILD_IDS) {
        for (const view of BODY_VIEW_IDS) {
          expect(
            layerArtGrid("cyberware", cyberArtId(ref.id, build), view),
            `${item.id} -> ${ref.id} ${build} ${view}`,
          ).not.toBeNull();
        }
      }
      if (ref.accent !== undefined) {
        expect(
          MATERIAL_RAMPS[ref.accent],
          `${item.id} accent ${ref.accent}`,
        ).toBeDefined();
      }
    }
    // Every install reads distinct: no two share family + recolor.
    const looks = enhancements.map((i) =>
      i.kind === "enhancement" ? JSON.stringify(i.cyberLayer) : "",
    );
    expect(new Set(looks).size).toBe(enhancements.length);
  });

  it("resolves every background starting-gear id to a real item", () => {
    for (const background of backgrounds) {
      for (const id of background.startingGearIds) {
        expect(getItem(id), `${background.id} references missing "${id}"`)
          .toBeDefined();
      }
    }
  });
});

describe("requireItem", () => {
  it("returns known items and throws 'unknown-item' otherwise", () => {
    expect(requireItem("wpn-shard-knife").kind).toBe("weapon");
    try {
      requireItem("no-such-item");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InventoryError);
      expect((error as InventoryError).code).toBe("unknown-item");
    }
  });
});
